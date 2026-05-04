import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Minus, Plus, ShoppingBag, Flame, Users, MessageCircle, Leaf, Drumstick, Search, X, CreditCard, Banknote } from "lucide-react";
import { useRestaurantCart } from "../hooks/useRestaurantCart";
import { useCollaborativeCart } from "../hooks/useCollaborativeCart";
import { MenuItemDialog } from "../components/MenuItemDialog";
import { TablePresence } from "../components/TablePresence";
import { SplitBillView } from "../components/SplitBillView";
import { Turnstile } from "@/components/security/Turnstile";
import { formatMoney } from "@/lib/formatting";

type RestaurantRow = Tables<"restaurants">;
type CategoryRow = Tables<"categories">;
type MenuItemRow = Tables<"menu_items">;

type CategoryWithItems = CategoryRow & { items: MenuItemRow[] };

export default function PublicMenu() {
  const { toast } = useToast();
  const { restaurantSlug } = useParams();
  const [searchParams] = useSearchParams();
  const slug = (restaurantSlug ?? "").trim();

  const tableLabel = searchParams.get("table") ?? null;
  const useCollabCart = !!tableLabel;

  // 1. Restaurant query — must be first (collabCart + fetchUpsell depend on it)
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

  // 2. Carts — now safe to reference restaurantQuery.data
  const cart = useRestaurantCart(slug);
  const collabCart = useCollaborativeCart(
    restaurantQuery.data?.id ?? "",
    tableLabel ?? ""
  );

  // Use collaborative cart when table param is present, else regular cart
  const activeCart = useCollabCart && collabCart.initialized ? collabCart : cart;

  const [cartOpen, setCartOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItemRow | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);

  // Search + Category Jump
  const [menuSearch, setMenuSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);

  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedOrderToken, setPlacedOrderToken] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");

  // Stable callback for Turnstile — avoids re-render loops inside Drawer portal
  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
    setCheckoutError(null);
  }, []);

  // Smart menu ranking
  const [rankedIds, setRankedIds] = useState<string[] | null>(null);
  const [popularIds, setPopularIds] = useState<string[]>([]);

  // Upsell suggestions
  type UpsellSuggestion = { id: string; name: string; price_cents: number; image_url?: string; co_order_count?: number };
  const [upsellItems, setUpsellItems] = useState<UpsellSuggestion[]>([]);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [upsellForItem, setUpsellForItem] = useState<string | null>(null);

  // Dietary filter state
  const [dietaryFilter, setDietaryFilter] = useState<'all' | 'veg' | 'nonveg'>('all');

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const onlinePaymentsEnabled = !!(restaurantQuery.data as any)?.online_payments_enabled;

  const fetchUpsell = useCallback(async (itemId: string, restaurantId: string) => {
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/menu-upsell?item_id=${itemId}&restaurant_id=${restaurantId}`,
        { headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }
      );
      const data = await resp.json();
      if (data.suggestions?.length > 0) {
        setUpsellItems(data.suggestions);
        setUpsellForItem(itemId);
        setUpsellOpen(true);
      }
    } catch { /* non-critical, ignore */ }
  }, [restaurantQuery.data?.currency_code]);


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
        .is("deleted_at", null)
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
    return restaurantQuery.data?.currency_code ?? "INR";
  }, [restaurantQuery.data]);

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
    if (activeCart.items.length === 0) return;

    if (!turnstileToken) {
      setCheckoutError("Please complete the security check before placing your order.");
      return;
    }

    setPlacingOrder(true);
    setCheckoutError(null);

    try {
      const orderPayload = {
        restaurant_id: restaurantId,
        table_label: activeCart.tableLabel ?? undefined,
        items: activeCart.items.map((i) => ({
          menu_item_id: i.menu_item_id,
          quantity: i.quantity,
          variant_id: i.variant_id,
          addons: i.addons?.map((a) => ({ id: a.id })) ?? [],
          notes: i.notes,
        })),
        coupon_code: cart.couponCode ?? undefined,
        turnstileToken,
        customer_phone: customerPhone.trim() || undefined,
        customer_name: customerName.trim() || undefined,
      };

      let data: any;

      if (paymentMethod === 'online' && onlinePaymentsEnabled) {
        // === ONLINE PAYMENT FLOW ===
        // Validate amount
        if (activeCart.subtotalCents <= 0) {
          throw new Error("Cannot pay online for ₹0 orders. Please use cash.");
        }

        // 1. Create Razorpay order
        const { data: rzpData, error: rzpError } = await supabase.functions.invoke("create-razorpay-order", {
          body: {
            restaurant_id: restaurantId,
            amount_cents: activeCart.subtotalCents,
            currency: currencyCode,
            turnstileToken,
          },
        });

        // Surface the actual error
        if (rzpError) {
          const errMsg = typeof rzpError === 'object' && rzpError?.message
            ? rzpError.message
            : "Payment gateway unreachable. Is the edge function deployed?";
          throw new Error(errMsg);
        }
        if (rzpData?.error) {
          throw new Error(rzpData.error);
        }
        if (!rzpData?.razorpay_order_id) {
          throw new Error("No order ID returned from payment gateway");
        }

        // 2. Load Razorpay.js if needed
        if (!(window as any).Razorpay) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://checkout.razorpay.com/v1/checkout.js';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load payment gateway'));
            document.head.appendChild(s);
          });
        }

        // 3. Open Razorpay popup
        data = await new Promise<any>((resolve, reject) => {
          const options = {
            key: rzpData.key_id,
            amount: rzpData.amount,
            currency: rzpData.currency,
            name: restaurantQuery.data?.name || 'Restaurant',
            description: `Order from ${restaurantQuery.data?.name || 'Restaurant'}`,
            order_id: rzpData.razorpay_order_id,
            handler: async (response: any) => {
              try {
                // 4. Verify payment + place order
                const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-payment", {
                  body: {
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    order_payload: orderPayload,
                  },
                });
                if (verifyError || !verifyData?.id) {
                  reject(new Error(verifyData?.error || 'Payment verification failed'));
                } else {
                  resolve(verifyData);
                }
              } catch (e) {
                reject(e);
              }
            },
            modal: {
              ondismiss: () => reject(new Error('Payment cancelled')),
            },
            prefill: {
              contact: customerPhone.trim() || undefined,
              name: customerName.trim() || undefined,
            },
            theme: { color: '#1a1a2e' },
          };
          const rzp = new (window as any).Razorpay(options);
          rzp.open();
        });
      } else {
        // === CASH FLOW (existing) ===
        const { data: cashData, error } = await supabase.functions.invoke("place-order", {
          body: orderPayload,
        });
        if (error) throw error;
        data = cashData;
      }

      if (!data?.id || !data?.order_token) {
        throw new Error("Order created without a token.");
      }

      setPlacedOrderId(data.id);
      setPlacedOrderToken(data.order_token);
      activeCart.clear();
      setCartOpen(true);
      toast({
        title: paymentMethod === 'online' ? "Payment successful! 🎉" : "Order placed! 🎉",
        description: paymentMethod === 'online'
          ? "Your order has been paid and confirmed."
          : customerPhone ? "Receipt sent to your WhatsApp!" : "Save your order token to track status.",
      });
    } catch (e: any) {
      console.error("Place order error:", e);
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
    if (activeCart.itemCount === 0 && !placedOrderToken) setCartOpen(false);
  }, [activeCart.itemCount, placedOrderToken]);

  // Fetch smart menu ranking after restaurant loads
  useEffect(() => {
    const restaurantId = restaurantQuery.data?.id;
    if (!restaurantId) return;
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/smart-menu-rank?restaurant_id=${restaurantId}`, {
      headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    })
      .then(r => r.json())
      .then(d => {
        if (d.ranked_ids) setRankedIds(d.ranked_ids);
        if (d.popular_ids) setPopularIds(d.popular_ids);
      })
      .catch(() => {}); // Non-critical, graceful degradation
  }, [restaurantQuery.data?.id]);

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

  // IntersectionObserver for active category tracking
  useEffect(() => {
    const sections = document.querySelectorAll("[data-category-id]");
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveCategory(entry.target.getAttribute("data-category-id"));
          }
        }
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 }
    );
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [categoriesWithItems]);

  return (
    <main className="min-h-screen w-full bg-background">
      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="w-full max-w-3xl mx-auto px-4 py-4">
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

      {/* Category Jump Bar + Search */}
      {categoriesWithItems.length > 0 && (
        <div className="sticky top-[73px] z-[9] border-b bg-background/95 backdrop-blur">
          <div className="w-full max-w-3xl mx-auto px-4">
            {/* Search toggle */}
            {searchOpen ? (
              <div className="flex items-center gap-2 py-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="Search menu items..."
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSearchOpen(false); setMenuSearch(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 py-2" ref={categoryBarRef}>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSearchOpen(true)}>
                  <Search className="h-4 w-4" />
                </Button>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-0.5">
                  {categoriesWithItems.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        const el = document.getElementById(`section-${cat.id}`);
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }}
                      className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        activeCategory === cat.id
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl mx-auto px-4 py-8 pb-28">
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
          <div className="space-y-6">
            {/* Dietary Filters */}
            {(() => {
              const s = restaurantQuery.data?.settings as any;
              const enabled = s && typeof s === 'object' && s.dietary_filters_enabled;
              if (!enabled) return null;
              return (
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant={dietaryFilter === 'all' ? 'default' : 'outline'} className="rounded-full" onClick={() => setDietaryFilter('all')}>All</Button>
                  <Button size="sm" variant={dietaryFilter === 'veg' ? 'default' : 'outline'} className="rounded-full text-green-600 border-green-200" onClick={() => setDietaryFilter('veg')}><Leaf className="mr-1 h-3.5 w-3.5" />Veg</Button>
                  <Button size="sm" variant={dietaryFilter === 'nonveg' ? 'default' : 'outline'} className="rounded-full text-red-600 border-red-200" onClick={() => setDietaryFilter('nonveg')}><Drumstick className="mr-1 h-3.5 w-3.5" />Non-Veg</Button>
                </div>
              );
            })()}

            {categoriesWithItems.map((category) => {
              // Apply search filter
              let filteredItems = category.items;
              if (menuSearch.trim()) {
                const q = menuSearch.toLowerCase();
                filteredItems = filteredItems.filter((item: any) =>
                  (item.name || '').toLowerCase().includes(q) ||
                  (item.description || '').toLowerCase().includes(q)
                );
              }
              // Apply dietary filter
              if (dietaryFilter !== 'all') {
                filteredItems = filteredItems.filter((item: any) => {
                const name = (item.name || '').toLowerCase();
                const desc = (item.description || '').toLowerCase();
                const text = name + ' ' + desc;
                if (dietaryFilter === 'veg') return text.includes('veg') && !text.includes('non-veg') && !text.includes('nonveg') || text.includes('paneer') || text.includes('dal') || text.includes('salad');
                if (dietaryFilter === 'nonveg') return text.includes('chicken') || text.includes('mutton') || text.includes('fish') || text.includes('egg') || text.includes('prawn') || text.includes('meat') || text.includes('non-veg') || text.includes('nonveg');
                return true;
              });
              }
              if (filteredItems.length === 0) return null;
              return (
              <section key={category.id} id={`section-${category.id}`} data-category-id={category.id} aria-labelledby={`cat-${category.id}`}>
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
                  {filteredItems.map((item) => (
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
                          <p className="font-medium truncate">
                            {item.name}
                            {popularIds.includes(item.id) && (
                              <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-orange-500">
                                <Flame className="h-3 w-3" /> Hot
                              </span>
                            )}
                          </p>
                              {item.description ? (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {item.description}
                                </p>
                              ) : null}
                            </div>
                            <p className="font-medium tabular-nums whitespace-nowrap">
                              {formatMoney(item.price_cents, restaurantQuery.data?.currency_code)}
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
              );
            })}
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
              {activeCart.itemCount > 0 ? (
              <span className="absolute -top-2 -right-2">
                <Badge variant="secondary" className="min-w-6 justify-center">
                  {activeCart.itemCount}
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
            {/* Collaborative cart presence */}
            {useCollabCart && collabCart.participants.length > 1 && (
              <div className="mb-3">
                <TablePresence
                  participants={collabCart.participants}
                  isLeader={collabCart.isLeader}
                  tableLabel={tableLabel ?? ""}
                />
              </div>
            )}
            {activeCart.items.length === 0 ? (
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
                {activeCart.items.map((line) => (
                  <Card key={line.cart_id} className="p-4">
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
                        <Button size="icon" variant="outline"
                          onClick={() => activeCart.decrement(line.cart_id)}
                          aria-label={`Decrease ${line.name}`}>
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="min-w-8 text-center tabular-nums">{line.quantity}</span>
                        <Button size="icon" variant="outline"
                          onClick={() => activeCart.increment(line.cart_id)}
                          aria-label={`Increase ${line.name}`}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="ghost"
                        onClick={() => activeCart.removeItem(line.cart_id)}
                        className="text-muted-foreground">
                        Remove
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Split Bill — only in collaborative mode with 2+ participants */}
          {useCollabCart && collabCart.participants.length > 1 && activeCart.items.length > 0 && (
            <div className="px-4 pb-2 border-t pt-3">
              <SplitBillView
                items={activeCart.items}
                participants={collabCart.participants}
                deviceToken={collabCart.deviceToken}
                currencyCode={currencyCode}
                onClaim={collabCart.claimItem}
                onUnclaim={collabCart.unclaimItem}
                onSplitEvenly={collabCart.splitEvenly}
                getMyBill={collabCart.getMyBill}
                getBillByParticipant={collabCart.getBillByParticipant}
              />
            </div>
          )}

          <DrawerFooter>
            {activeCart.items.length > 0 ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Subtotal</p>
                    <p className="font-medium tabular-nums">
                      {formatMoney(activeCart.subtotalCents, currencyCode)}
                    </p>
                  </div>
                </div>

                {/* Payment method selector */}
                {onlinePaymentsEnabled && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                    <p className="text-xs text-muted-foreground font-medium">Payment Method</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('cash')}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === 'cash'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted bg-background text-muted-foreground hover:border-border'
                        }`}
                      >
                        <Banknote className="h-4 w-4" /> Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethod('online')}
                        className={`flex items-center justify-center gap-2 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === 'online'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted bg-background text-muted-foreground hover:border-border'
                        }`}
                      >
                        <CreditCard className="h-4 w-4" /> Pay Online
                      </button>
                    </div>
                  </div>
                )}

                {/* WhatsApp contact capture */}
                <div className="border rounded-lg p-3 space-y-3 bg-muted/40">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    📱 Get receipt on WhatsApp (optional)
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name</Label>
                      <Input
                        placeholder="Your name"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">WhatsApp number</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        type="tel"
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Security check */}
                {!turnstileToken ? (
                  <div className="space-y-1">
                    <Turnstile
                      onSuccess={handleTurnstileSuccess}
                      action="place_order"
                      className="mt-2 flex justify-center"
                    />
                    <p className="text-xs text-center text-muted-foreground">Complete security check to place order</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-green-600 justify-center py-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    Security verified
                  </div>
                )}

                <Button
                  disabled={activeCart.items.length === 0 || placingOrder || !restaurantQuery.data?.id
                    || !turnstileToken
                    || (useCollabCart && !collabCart.isLeader)}
                  onClick={placeOrder}
                >
                  {placingOrder ? "Processing…" :
                    useCollabCart && !collabCart.isLeader ? "Waiting for table leader…" :
                    !turnstileToken ? "Verifying…" :
                    paymentMethod === 'online' && onlinePaymentsEnabled ? `Pay ${formatMoney(activeCart.subtotalCents, currencyCode)}` :
                    "Place order"}
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
              {activeCart.items.length > 0 ? (
                <Button variant="ghost" onClick={activeCart.clear}
                  disabled={activeCart.items.length === 0}
                  className="text-muted-foreground">Clear</Button>
              ) : (
                <Button variant="ghost"
                  onClick={() => { setPlacedOrderId(null); setPlacedOrderToken(null); setCheckoutError(null); }}
                  disabled={!placedOrderToken}
                  className="text-muted-foreground">Done</Button>
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
          activeCart.addItem(cartItem);
          setCartOpen(false);
          // Trigger upsell after adding
          if (restaurantQuery.data?.id) {
            fetchUpsell(cartItem.menu_item_id, restaurantQuery.data.id);
          }
        }}
        restaurantId={restaurantQuery.data?.id ?? ""}
        themeColor={restaurantQuery.data?.theme_color}
        currencyCode={restaurantQuery.data?.currency_code}
      />

      {/* Upsell Bottom Sheet: "People also order..." */}
      {upsellOpen && upsellItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setUpsellOpen(false)}>
          <div
            className="w-full max-w-lg bg-background border-t rounded-t-2xl shadow-2xl p-4 pb-8 space-y-3 animate-in slide-in-from-bottom-4 duration-300"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-semibold text-sm">🍽️ People also order...</p>
              <button onClick={() => setUpsellOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {upsellItems.map((suggestion: any) => (
                <div key={suggestion.id} className="border rounded-xl p-2 space-y-1 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    activeCart.addItem({
                      cart_id: `${suggestion.id}-upsell-${Date.now()}`,
                      menu_item_id: suggestion.id,
                      name: suggestion.name,
                      price_cents: suggestion.price_cents,
                      quantity: 1,
                      variant_id: undefined,
                      addons: [],
                      notes: "",
                    });
                    setUpsellOpen(false);
                    toast({ title: `Added ${suggestion.name} to cart` });
                  }}>
                  {suggestion.image_url && (
                    <img src={suggestion.image_url} alt={suggestion.name}
                      className="w-full h-16 object-cover rounded-lg" />
                  )}
                  <p className="text-xs font-medium line-clamp-2">{suggestion.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(suggestion.price_cents, restaurantQuery.data?.currency_code)}
                  </p>
                  <Button size="sm" className="w-full h-6 text-xs" variant="secondary">
                    <Plus className="h-3 w-3 mr-1" /> Add
                  </Button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => { setUpsellOpen(false); setCartOpen(true); }}>
              View Cart ({activeCart.itemCount} items)
            </Button>
          </div>
        </div>
      )}
      {/* WhatsApp Floating Button */}
      {(() => {
        const s = restaurantQuery.data?.settings as any;
        const waNum = s && typeof s === 'object' ? s.whatsapp_number : null;
        if (!waNum) return null;
        return (
          <a href={`https://wa.me/${waNum.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I'd like to place an order from ${restaurantQuery.data?.name || 'your restaurant'}`)}`} target="_blank" rel="noopener noreferrer" className="fixed bottom-24 right-4 z-40 h-14 w-14 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center hover:bg-green-600 hover:scale-110 transition-all" aria-label="Order via WhatsApp">
            <MessageCircle className="h-7 w-7" />
          </a>
        );
      })()}
    </main>
  );
}
