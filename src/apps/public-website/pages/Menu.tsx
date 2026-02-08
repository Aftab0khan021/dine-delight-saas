import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { useToast } from "@/hooks/use-toast";
import { CopyButton } from "@/apps/admin-panel/components/qr/CopyButton";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useRestaurantCart } from "../hooks/useRestaurantCart";
import { MenuItemDialog } from "../components/MenuItemDialog";

function formatMoney(cents: number, currency = "INR") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format((cents ?? 0) / 100);
  } catch {
    return `₹${((cents ?? 0) / 100).toFixed(2)}`;
  }
}

type RestaurantRow = Tables<"restaurants">;
type CategoryRow = Tables<"categories">;
type MenuItemRow = Tables<"menu_items">;

type CategoryWithItems = CategoryRow & { items: MenuItemRow[] };

export default function PublicMenu() {
  const { toast } = useToast();
  const { restaurantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const slug = (restaurantSlug ?? "").trim();

  const cart = useRestaurantCart(slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItemRow | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedOrderToken, setPlacedOrderToken] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const restaurantQuery = useQuery({
    queryKey: ["public-menu", "restaurant", slug],
    enabled: !!slug,
    queryFn: async (): Promise<RestaurantRow> => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ["public-menu", "categories", slug, restaurantQuery.data?.id],
    enabled: !!restaurantQuery.data?.id,
    queryFn: async (): Promise<CategoryRow[]> => {
      const restaurantId = restaurantQuery.data!.id;
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["public-menu", "items", slug, restaurantQuery.data?.id],
    enabled: !!restaurantQuery.data?.id,
    queryFn: async (): Promise<MenuItemRow[]> => {
      const restaurantId = restaurantQuery.data!.id;
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return data ?? [];
    },
  });

  const currencyCode = useMemo(() => {
    const first = itemsQuery.data?.find(Boolean);
    return first?.currency_code ?? "USD";
  }, [itemsQuery.data]);

  const categoriesWithItems = useMemo((): CategoryWithItems[] => {
    const categories = categoriesQuery.data ?? [];
    const items = itemsQuery.data ?? [];

    const byCategory = new Map<string, MenuItemRow[]>();
    for (const item of items) {
      const key = item.category_id ?? "__uncategorized__";
      const list = byCategory.get(key) ?? [];
      list.push(item);
      byCategory.set(key, list);
    }

    const result: CategoryWithItems[] = categories
      .map((c) => ({ ...c, items: byCategory.get(c.id) ?? [] }))
      .filter((c) => c.items.length > 0);

    const uncategorized = byCategory.get("__uncategorized__") ?? [];
    if (uncategorized.length > 0) {
      result.push({
        id: "__uncategorized__" as unknown as string,
        restaurant_id: restaurantQuery.data?.id ?? ("" as unknown as string),
        name: "Other",
        description: null,
        is_active: true,
        sort_order: Number.MAX_SAFE_INTEGER,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        items: uncategorized,
      });
    }

    return result;
  }, [categoriesQuery.data, itemsQuery.data, restaurantQuery.data?.id]);

  const loading =
    (!!slug && restaurantQuery.isLoading) ||
    categoriesQuery.isLoading ||
    itemsQuery.isLoading;

  const errorMessage =
    (restaurantQuery.error as Error | null)?.message ??
    (categoriesQuery.error as Error | null)?.message ??
    (itemsQuery.error as Error | null)?.message ??
    null;

  const trackUrl = useMemo(() => {
    if (!placedOrderToken) return null;
    const url = new URL(window.location.origin + "/track");
    url.searchParams.set("token", placedOrderToken);
    return url.toString();
  }, [placedOrderToken]);

  const placeOrder = async () => {
    if (placingOrder) return;
    const restaurantId = restaurantQuery.data?.id;
    if (!restaurantId) return;
    if (cart.items.length === 0) return;

    setPlacingOrder(true);
    setCheckoutError(null);

    try {
      const { data: insertedOrder, error: orderError } = await supabase
        .from("orders")
        .insert({
          restaurant_id: restaurantId,
          status: "pending",
          currency_code: restaurantQuery.data?.currency_code || "INR",
          tax_cents: 0,
          tip_cents: 0,
          discount_cents: cart.discountCents,
          subtotal_cents: cart.subtotalCents,
          total_cents: cart.totalCents,
        })
        .select("id, order_token")
        .single();

      if (orderError) throw orderError;
      if (!insertedOrder?.id || !insertedOrder?.order_token) {
        throw new Error("Order created without a token.");
      }

      const orderItemsPayload = cart.items.map((i) => ({
        restaurant_id: restaurantId,
        order_id: insertedOrder.id,
        menu_item_id: i.menu_item_id,
        name_snapshot: i.name,
        quantity: i.quantity,
        unit_price_cents: i.price_cents,
        line_total_cents: i.price_cents * i.quantity,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload);
      if (itemsError) throw itemsError;

      setPlacedOrderId(insertedOrder.id);
      setPlacedOrderToken(insertedOrder.order_token);
      cart.clear();
      setCartOpen(true);
      toast({
        title: "Order placed",
        description: "Save your order token to track status.",
      });
    } catch (e: any) {
      setCheckoutError(e?.message ?? "Could not place order.");
    } finally {
      setPlacingOrder(false);
    }
  };

  useEffect(() => {
    const name = restaurantQuery.data?.name;
    document.title = name ? `${name} Menu` : "Menu";
  }, [restaurantQuery.data?.name]);

  useEffect(() => {
    if (cart.itemCount === 0 && !placedOrderToken) setCartOpen(false);
  }, [cart.itemCount, placedOrderToken]);

  if (!slug) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-10 max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
          <p className="mt-2 text-muted-foreground">
            Add a restaurant slug in the URL like:{" "}
            <span className="font-mono">/r/your-restaurant-slug/menu</span>
          </p>
          <Card className="mt-6 p-6">
            <p className="text-sm text-muted-foreground">
              This page is read-only and intended for guests.
            </p>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 max-w-3xl">
          <div className="flex items-center gap-4">
            {restaurantQuery.data?.logo_url ? (
              <img
                src={restaurantQuery.data.logo_url}
                alt={`${restaurantQuery.data.name} logo`}
                className="h-12 w-12 rounded-md object-cover border"
                loading="lazy"
              />
            ) : (
              <div
                className="h-12 w-12 rounded-md border bg-muted"
                aria-hidden="true"
              />
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight truncate">
                {restaurantQuery.data?.name ?? "Menu"}
              </h1>
              {restaurantQuery.data?.description ? (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {restaurantQuery.data.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-3xl pb-28">
        {loading ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">Loading menu…</p>
          </Card>
        ) : errorMessage ? (
          <Card className="p-6">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </Card>
        ) : categoriesWithItems.length === 0 ? (
          <Card className="p-6">
            <p className="text-sm text-muted-foreground">
              No active menu items yet.
            </p>
          </Card>
        ) : (
          <div className="space-y-10">
            {categoriesWithItems.map((category) => (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <h2
                      id={`cat-${category.id}`}
                      className="text-lg font-semibold tracking-tight"
                    >
                      {category.name}
                    </h2>
                    {category.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {category.items.map((item) => (
                    <Card key={item.id} className="p-4">
                      <div className="flex gap-4">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="h-20 w-20 rounded-md object-cover border"
                            loading="lazy"
                          />
                        ) : null}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium truncate">{item.name}</p>
                              {item.description ? (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {item.description}
                                </p>
                              ) : null}
                            </div>
                            <p className="font-medium tabular-nums whitespace-nowrap">
                              {formatMoney(item.price_cents, item.currency_code)}
                            </p>
                          </div>

                          <div className="mt-3 flex items-center justify-between gap-3">
                            {item.sku ? (
                              <p className="text-xs text-muted-foreground font-mono truncate">
                                {item.sku}
                              </p>
                            ) : (
                              <span />
                            )}

                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setSelectedItem(item);
                                setItemDialogOpen(true);
                              }}
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {/* Floating Cart */}
      <Drawer open={cartOpen} onOpenChange={setCartOpen}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className="fixed bottom-4 right-4 z-40"
            aria-label="Open cart"
            onClick={() => setCartOpen(true)}
          >
            <div className="relative">
              <Button size="lg" className="shadow-lg">
                <ShoppingBag className="h-4 w-4" />
                Cart
              </Button>
              {cart.itemCount > 0 ? (
                <span className="absolute -top-2 -right-2">
                  <Badge variant="secondary" className="min-w-6 justify-center">
                    {cart.itemCount}
                  </Badge>
                </span>
              ) : null}
            </div>
          </button>
        </DrawerTrigger>

        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>Cart</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-4 overflow-auto">
            {cart.items.length === 0 ? (
              placedOrderToken ? (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Order placed</p>
                  <p className="mt-2 font-mono text-sm break-all">{placedOrderToken}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyButton value={placedOrderToken} label="Copy token" />
                    {trackUrl ? <CopyButton value={trackUrl} label="Copy tracking link" /> : null}
                    {placedOrderToken ? (
                      <Link to={`/track?token=${encodeURIComponent(placedOrderToken)}`}>
                        <Button variant="secondary" size="sm">Track</Button>
                      </Link>
                    ) : null}
                  </div>
                  {checkoutError ? (
                    <p className="mt-3 text-sm text-destructive">{checkoutError}</p>
                  ) : null}
                </Card>
              ) : (
                <Card className="p-6">
                  <p className="text-sm text-muted-foreground">Your cart is empty.</p>
                </Card>
              )
            ) : (
              <div className="space-y-3">
                {cart.items.map((line) => (
                  <Card key={line.menu_item_id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{line.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {formatMoney(line.price_cents, currencyCode)} each
                        </p>
                      </div>

                      <p className="font-medium tabular-nums whitespace-nowrap">
                        {formatMoney(line.price_cents * line.quantity, currencyCode)}
                      </p>
                    </div>

                    <Separator className="my-3" />

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => cart.decrement(line.cart_id)}
                          aria-label={`Decrease ${line.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="min-w-8 text-center tabular-nums">{line.quantity}</span>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => cart.increment(line.cart_id)}
                          aria-label={`Increase ${line.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>

                      <Button
                        variant="ghost"
                        onClick={() => cart.removeItem(line.cart_id)}
                        className="text-muted-foreground"
                      >
                        Remove
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <DrawerFooter>
            {cart.items.length > 0 ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="font-medium tabular-nums">{formatMoney(cart.subtotalCents, currencyCode)}</p>
                </div>
                <Button
                  disabled={cart.items.length === 0 || placingOrder || !restaurantQuery.data?.id}
                  onClick={placeOrder}
                >
                  {placingOrder ? "Placing…" : "Place order"}
                </Button>
                {checkoutError ? (
                  <p className="text-sm text-destructive">{checkoutError}</p>
                ) : null}
              </>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
              {cart.items.length > 0 ? (
                <Button
                  variant="ghost"
                  onClick={cart.clear}
                  disabled={cart.items.length === 0}
                  className="text-muted-foreground"
                >
                  Clear
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPlacedOrderId(null);
                    setPlacedOrderToken(null);
                    setCheckoutError(null);
                  }}
                  disabled={!placedOrderToken}
                  className="text-muted-foreground"
                >
                  Done
                </Button>
              )}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Menu Item Dialog for Variants/Addons */}
      <MenuItemDialog
        item={selectedItem}
        open={itemDialogOpen}
        onOpenChange={setItemDialogOpen}
        onAddToCart={(cartItem) => {
          cart.addItem(cartItem);
          setCartOpen(true);
        }}
        restaurantId={restaurantQuery.data?.id ?? ""}
        themeColor={restaurantQuery.data?.theme_color}
      />
    </main>
  );
}
