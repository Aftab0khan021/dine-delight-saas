import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, ShoppingBag, ArrowLeft, ImageOff, Plus, Minus, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantCart } from "../hooks/useRestaurantCart";
import { MenuItemDialog } from "../components/MenuItemDialog";

// --- Types ---
type Category = { id: string; name: string; sort_order: number };
type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export default function PublicMenu() {
  const { restaurantSlug } = useParams();
  const slug = (restaurantSlug ?? "").trim();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableParam = searchParams.get("table");
  const { toast } = useToast();

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [couponInput, setCouponInput] = useState(""); // [NEW]
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false); // [NEW]

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Customization Dialog State
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

  // --- Cart Hook ---
  const { items: cartItems, addItem, increment, decrement, clear, itemCount, subtotalCents, discountCents, totalCents, coupon, applyCoupon, removeCoupon, tableLabel, setTableLabel } = useRestaurantCart(slug);

  // Capture table param
  useEffect(() => {
    if (tableParam && tableParam !== tableLabel) {
      setTableLabel(tableParam);
    }
  }, [tableParam, tableLabel, setTableLabel]);

  // 1. Fetch Restaurant
  const { data: restaurant, isLoading: loadingRest } = useQuery({
    queryKey: ["public", "menu-restaurant", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id, name, settings, is_accepting_orders").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Restaurant not found");
      return data;
    },
  });

  // 2. Fetch Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["public", "menu-categories", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name, sort_order").eq("restaurant_id", restaurant!.id).is("deleted_at", null).order("sort_order");
      return data as Category[];
    },
  });

  // 3. Fetch Items
  const { data: items = [] } = useQuery({
    queryKey: ["public", "menu-items", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase.from("menu_items").select("*").eq("restaurant_id", restaurant!.id).eq("is_active", true).is("deleted_at", null).order("sort_order");
      return data as MenuItem[];
    },
  });

  // 4. Fetch availability status for cart items
  const { data: cartItemsAvailability = [] } = useQuery({
    queryKey: ["public", "cart-items-availability", restaurant?.id, cartItems.map(i => i.menu_item_id)],
    enabled: !!restaurant?.id && cartItems.length > 0,
    queryFn: async () => {
      const itemIds = cartItems.map(i => i.menu_item_id);
      const { data } = await supabase
        .from("menu_items")
        .select("id, is_active")
        .in("id", itemIds);
      return data || [];
    },
  });

  // Check if any cart items are unavailable
  const hasUnavailableItems = useMemo(() => {
    return cartItems.some(cartItem => {
      const menuItem = cartItemsAvailability.find(mi => mi.id === cartItem.menu_item_id);
      return menuItem && !menuItem.is_active;
    });
  }, [cartItems, cartItemsAvailability]);

  // --- Filtering ---
  const filteredItems = useMemo(() => {
    let filtered = items;
    if (search.trim()) filtered = filtered.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    if (activeCategory !== "all") filtered = filtered.filter(i => i.category_id === activeCategory);
    return filtered;
  }, [items, search, activeCategory]);

  const groupedItems = useMemo(() => {
    if (activeCategory !== "all") return null;
    const groups: Record<string, MenuItem[]> = {};
    categories.forEach(c => { groups[c.id] = []; });
    groups["uncategorized"] = [];
    filteredItems.forEach(item => {
      const catId = item.category_id || "uncategorized";
      if (!groups[catId]) groups[catId] = [];
      groups[catId].push(item);
    });
    return groups;
  }, [filteredItems, categories, activeCategory]);



  // --- Coupon Handler ---
  const handleApplyCoupon = async () => {
    if (!couponInput.trim() || !restaurant) return;
    setIsValidatingCoupon(true);

    try {
      // Validate via Supabase Query (assuming public read access on verified coupons or via RLS)
      // Note: Ideally this should be an edge function for better security/hiding logic
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('restaurant_id', restaurant.id)
        .eq('code', couponInput.trim())
        .eq('is_active', true)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        toast({ title: "Invalid Coupon", description: "This coupon code does not exist.", variant: "destructive" });
        return;
      }

      // Check Expiry
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        toast({ title: "Expired Coupon", description: "This coupon has expired.", variant: "destructive" });
        return;
      }

      // Check Usage Limit
      if (data.usage_limit !== null && (data.usage_count || 0) >= data.usage_limit) {
        toast({ title: "Coupon Limit Reached", description: "This coupon has reached its usage limit.", variant: "destructive" });
        return;
      }

      // Check Min Order
      if (data.min_order_cents && subtotalCents < data.min_order_cents) {
        toast({
          title: "Minimum Order Required",
          description: `You need to spend ${formatMoney(data.min_order_cents)} to use this coupon.`,
          variant: "destructive"
        });
        return;
      }

      // Success
      applyCoupon(data);
      setCouponInput("");
      toast({ title: "Coupon Applied!", description: `You saved with ${data.code}.` });

    } catch (err) {
      console.error(err);
      toast({ title: "Error", description: "Could not validate coupon.", variant: "destructive" });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  // --- Checkout Handler (SECURE FIX FOR 401) ---
  const handlePlaceOrder = async () => {
    if (!restaurant) return;
    setIsPlacingOrder(true);

    try {
      // 1. Retrieve Config (URL & Anon Key)
      // We look in environment variables first, then fallback to the active client config.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || (supabase as any).supabaseUrl;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || (supabase as any).supabaseKey;

      if (!supabaseUrl || !anonKey) {
        throw new Error("Configuration Error: Missing Supabase URL or Key.");
      }

      // CRITICAL FIX: We use the 'anonKey' for the Authorization header.
      // This ensures the Supabase Gateway accepts the request as a valid Public API call,
      // avoiding the 401 Unauthorized error caused by User Token conflicts.
      // The Edge Function itself handles security via IP Rate Limiting and Service Role checks.

      // DEBUG: Show user what we are sending
      /*
      toast({
        title: "Debug Info",
        description: `Sending Table: ${tableLabel || "None"}`,
      });
      */

      const finalTableLabel = tableLabel || searchParams.get("table");

      const response = await fetch(`${supabaseUrl}/functions/v1/place-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": anonKey,              // Required by Gateway
          "Authorization": `Bearer ${anonKey}` // Authenticates as Public/Anon Client
        },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          items: cartItems.map(i => ({
            menu_item_id: i.menu_item_id,
            quantity: i.quantity,
            variant_id: i.variant_id || null, // [NEW] Variant support
            addons: i.addons || [],           // [NEW] Addon support
            notes: i.notes || null
          })),
          table_label: finalTableLabel, // Add table label to order
          coupon_code: coupon?.code || null // [NEW] Send coupon code
        })
      });

      // 3. Handle Response
      let data;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Server Error (${response.status}): ${text}`);
      }

      if (!response.ok) {
        throw new Error(data.error || `Request failed with status ${response.status}`);
      }

      // 4. Success
      clear();
      setIsCartOpen(false);

      if (data?.order_token) {
        navigate(`/track?token=${data.order_token}`);
      } else {
        toast({ title: "Order Placed", description: "Your order has been received!" });
      }

    } catch (err: any) {
      console.error("Order Error:", err);
      toast({
        title: "Order Failed",
        description: err.message || "Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsPlacingOrder(false);
    }
  };

  if (loadingRest) return <div className="h-screen flex items-center justify-center">Loading menu...</div>;
  if (!restaurant) return <div className="h-screen flex items-center justify-center">Restaurant not found.</div>;

  const themeColor = (restaurant.settings as any)?.theme?.primary_color || "#0f172a";

  return (
    <div className="min-h-screen bg-background pb-20">

      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="container max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to={`/r/${slug}`} className="p-2 -ml-2 hover:bg-muted rounded-full text-muted-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
            <h1 className="font-semibold text-lg truncate">{restaurant.name}</h1>
          </div>
          <Sheet open={isCartOpen} onOpenChange={setIsCartOpen}>
            <SheetTrigger asChild>
              <div className="relative p-2 cursor-pointer">
                <ShoppingBag className="h-6 w-6 text-foreground" />
                {itemCount > 0 && <span className="absolute top-0 right-0 h-5 w-5 text-[10px] font-bold flex items-center justify-center rounded-full text-white ring-2 ring-background" style={{ backgroundColor: themeColor }}>{itemCount}</span>}
              </div>
            </SheetTrigger>
            <SheetContent className="flex flex-col w-full sm:max-w-md">
              <SheetHeader><SheetTitle>Your Order</SheetTitle>
                {tableLabel && <div className="text-sm text-muted-foreground">Table: <span className="font-semibold text-foreground">{tableLabel}</span></div>}
              </SheetHeader>
              <div className="flex-1 overflow-hidden mt-4">
                {cartItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-2"><ShoppingBag className="h-12 w-12 opacity-20" /><p>Your cart is empty.</p></div>
                ) : (
                  <ScrollArea className="h-full pr-4">
                    <div className="space-y-4">
                      {cartItems.map((item) => {
                        const menuItem = cartItemsAvailability.find(mi => mi.id === item.menu_item_id);
                        const isUnavailable = menuItem && !menuItem.is_active;

                        return (
                          <div key={item.menu_item_id} className={`flex items-start justify-between gap-3 ${isUnavailable ? 'opacity-60' : ''}`}>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{item.name}</div>
                              {item.variant_name && <div className="text-xs text-muted-foreground">Size: {item.variant_name}</div>}
                              {item.addons && item.addons.length > 0 && (
                                <div className="text-xs text-muted-foreground mt-0.5">
                                  {item.addons.map(a => a.name).join(", ")}
                                </div>
                              )}
                              {isUnavailable && (
                                <div className="text-xs text-destructive font-medium mt-0.5">Unavailable</div>
                              )}
                              <div className="text-sm text-muted-foreground">{formatMoney(item.price_cents)}</div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2 border rounded-md p-0.5">
                                <button onClick={() => decrement(item.cart_id)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground"><Minus className="h-3 w-3" /></button>
                                <span className="text-sm w-4 text-center font-medium">{item.quantity}</span>
                                <button onClick={() => increment(item.cart_id)} className="h-6 w-6 flex items-center justify-center hover:bg-muted rounded text-muted-foreground"><Plus className="h-3 w-3" /></button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
              {cartItems.length > 0 && (
                <div className="pt-4 space-y-4">
                  {/* Coupon Section */}
                  <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                    {coupon ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          🎉 Coupon Applied: {coupon.code}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={removeCoupon}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Coupon Code"
                          className="h-8 text-sm"
                          value={search} // Re-using search state for temp coupon input is bad, let's create a local state
                          onChange={(e) => setSearch(e.target.value)} // Wait, search is for items. I need a new state.
                        />
                        {/* STOP: I need to add state for coupon input inside the component first */}
                      </div>
                    )}
                  </div>

                  {/* Coupon Section */}
                  <div className="bg-muted/30 p-3 rounded-lg space-y-2">
                    {coupon ? (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-green-600 font-medium flex items-center gap-1">
                          🎉 Coupon Applied: {coupon.code}
                        </span>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={removeCoupon}>
                          <Minus className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Coupon Code"
                          className="h-9 text-sm"
                          value={couponInput}
                          onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleApplyCoupon();
                          }}
                        />
                        <Button size="sm" variant="secondary" className="h-9 px-3" onClick={handleApplyCoupon} disabled={!couponInput || isValidatingCoupon}>
                          {isValidatingCoupon ? <Loader2 className="h-4 w-4 animate-spin" /> : "Apply"}
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator />
                  {hasUnavailableItems && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-sm text-destructive">
                      ⚠️ Some items are no longer available. Please remove them to continue.
                    </div>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground text-sm"><span>Subtotal</span><span>{formatMoney(subtotalCents)}</span></div>
                    {discountCents > 0 && (
                      <div className="flex items-center justify-between text-green-600 text-sm font-medium"><span>Discount</span><span>-{formatMoney(discountCents)}</span></div>
                    )}
                    <div className="flex items-center justify-between font-bold text-lg"><span>Total</span><span>{formatMoney(totalCents)}</span></div>
                  </div>

                  <Button className="w-full h-12 text-base font-bold" size="lg" style={{ backgroundColor: themeColor }} onClick={handlePlaceOrder} disabled={isPlacingOrder || hasUnavailableItems}>
                    {isPlacingOrder ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Placing Order...</> : "Place Order"}
                  </Button>
                </div>
              )}
            </SheetContent>
          </Sheet>
        </div>
        <div className="w-full overflow-x-auto whitespace-nowrap scrollbar-hide border-t bg-muted/30">
          <div className="container max-w-3xl mx-auto px-4 py-2 flex gap-2">
            <button onClick={() => setActiveCategory("all")} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeCategory === "all" ? "text-white shadow-sm" : "bg-background text-muted-foreground border hover:bg-muted"}`} style={activeCategory === "all" ? { backgroundColor: themeColor, borderColor: themeColor } : {}}>All</button>
            {categories.map(cat => (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${activeCategory === cat.id ? "text-white shadow-sm" : "bg-background text-muted-foreground border hover:bg-muted"}`} style={activeCategory === cat.id ? { backgroundColor: themeColor, borderColor: themeColor } : {}}>{cat.name}</button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="container max-w-3xl mx-auto px-4 py-6 space-y-8">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input placeholder="Search items..." className="pl-10 bg-card" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        {activeCategory === "all" && groupedItems ? (
          categories.map(cat => {
            const catItems = groupedItems[cat.id];
            if (!catItems?.length) return null;
            return (
              <div key={cat.id} className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <h2 className="font-bold text-lg">{cat.name}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {catItems.map(item => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
            {filteredItems.map(item => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
              />
            ))}
            {!filteredItems.length && <p className="col-span-full text-center text-muted-foreground py-10">No items found.</p>}
          </div>
        )}
        {activeCategory === "all" && groupedItems?.["uncategorized"]?.length ? (
          <div className="space-y-3">
            <h2 className="font-bold text-lg">Other</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {groupedItems["uncategorized"].map(item => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  onAdd={() => { setCustomizingItem(item); setIsCustomizeOpen(true); }}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>
      <MenuItemDialog
        open={isCustomizeOpen}
        onOpenChange={setIsCustomizeOpen}
        item={customizingItem}
        restaurantId={restaurant?.id || ""}
        themeColor={themeColor}
        onAddToCart={(item) => {
          addItem(item);
          toast({ title: "Added", description: `${item.name} added to cart.` });
        }}
      />
    </div>
  );
}

function MenuItemCard({ item, onAdd }: { item: MenuItem, onAdd: () => void }) {
  return (
    <Card className="flex overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex-1 p-4 flex flex-col justify-between">
        <div><div className="font-semibold line-clamp-1">{item.name}</div><div className="text-xs text-muted-foreground line-clamp-2 mt-1">{item.description || "No description available."}</div></div>
        <div className="font-bold text-sm mt-3 flex items-center justify-between"><span>{formatMoney(item.price_cents)}</span><Button size="sm" variant="outline" className="h-7 px-3 text-xs rounded-full" onClick={onAdd}>Add</Button></div>
      </div>
      {item.image_url ? <div className="w-28 bg-muted shrink-0 relative"><img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /></div> : <div className="w-24 bg-muted/50 shrink-0 flex items-center justify-center text-muted-foreground/30"><ImageOff className="h-6 w-6" /></div>}
    </Card>
  );
}