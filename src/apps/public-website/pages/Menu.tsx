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
import { useSEO } from "@/hooks/useSEO";
import { CopyButton } from "@/apps/admin-panel/components/qr/CopyButton";
import { Minus, Plus, ShoppingBag, Flame, Users, MessageCircle, Leaf, Drumstick, Search, X, CreditCard, Banknote, ShieldAlert, Moon, Sun, Truck, Store } from "lucide-react";
import { useRestaurantCart } from "../hooks/useRestaurantCart";
import { useCollaborativeCart } from "../hooks/useCollaborativeCart";
import { MenuItemDialog } from "../components/MenuItemDialog";
import { TablePresence } from "../components/TablePresence";
import { SplitBillView } from "../components/SplitBillView";
import { Turnstile } from "@/components/security/Turnstile";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
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
  const [deliveryAddress, setDeliveryAddress] = useState("");

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

  // Allergen exclusion filter
  const [excludeAllergens, setExcludeAllergens] = useState<string[]>([]);
  const ALLERGEN_OPTIONS = ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Soy', 'Egg'];

  // SEO
  useSEO({
    title: restaurantQuery.data ? `Menu — ${restaurantQuery.data.name} | Dine Delight` : "Menu | Dine Delight",
    description: restaurantQuery.data ? `Browse the menu and order from ${restaurantQuery.data.name}. Fresh food, easy ordering.` : undefined,
    ogImage: (restaurantQuery.data as any)?.logo_url || undefined,
  });

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('cash');
  const onlinePaymentsEnabled = !!(restaurantQuery.data as any)?.online_payments_enabled;

  // Dark mode
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("dd-dark") === "1");
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("dd-dark", darkMode ? "1" : "0");
  }, [darkMode]);

  // Tip selector — reads config from restaurant settings
  const tipConfig = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    if (!s?.tip_config?.enabled) return null;
    return s.tip_config as { mode: string; percentage_options?: number[]; amount_options?: number[] };
  }, [restaurantQuery.data?.settings]);
  const [tipPercent, setTipPercent] = useState<number>(0);
  const [tipAmount, setTipAmount] = useState<number>(0);
  const tipCents = tipConfig?.mode === 'amount'
    ? tipAmount * 100
    : tipConfig?.mode === 'both'
      ? (tipPercent > 0 ? Math.round((activeCart.subtotalCents * tipPercent) / 100) : tipAmount * 100)
      : Math.round((activeCart.subtotalCents * tipPercent) / 100);

  // Order type
  const [orderType, setOrderType] = useState<'dine_in' | 'pickup' | 'delivery'>('dine_in');

  // GST — dynamic from restaurant settings
  const taxSettings = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    return { rate: (s?.tax_rate ?? 5) / 100, label: s?.tax_label || 'GST' };
  }, [restaurantQuery.data?.settings]);
  const gstCents = Math.round(activeCart.subtotalCents * taxSettings.rate);

  // Image lightbox
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  // Reorder from history
  const [reorderPhone, setReorderPhone] = useState('');
  const [reorderHistory, setReorderHistory] = useState<any[]>([]);
  const [reorderLoading, setReorderLoading] = useState(false);
  const fetchReorderHistory = useCallback(async () => {
    if (!reorderPhone || reorderPhone.length < 10 || !restaurantQuery.data?.id) return;
    setReorderLoading(true);
    try {
      const { data } = await supabase
        .from('orders')
        .select('id, total_cents, placed_at, order_items(id, menu_item_id, name_snapshot, quantity, unit_price_cents)')
        .eq('restaurant_id', restaurantQuery.data.id)
        .eq('customer_phone', reorderPhone)
        .order('placed_at', { ascending: false })
        .limit(5);
      setReorderHistory(data || []);
    } catch { /* ignore */ }
    setReorderLoading(false);
  }, [reorderPhone, restaurantQuery.data?.id]);

  // Loyalty points
  const loyaltyConfig = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    if (!s?.loyalty_config?.enabled) return null;
    return s.loyalty_config as { points_per_100_spent: number; points_to_currency: number; min_redeem_points: number };
  }, [restaurantQuery.data?.settings]);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);
  useEffect(() => {
    if (!loyaltyConfig || !customerPhone || customerPhone.length < 10 || !restaurantQuery.data?.id) return;
    supabase
      .from('loyalty_points')
      .select('points')
      .eq('customer_phone', customerPhone)
      .eq('restaurant_id', restaurantQuery.data.id)
      .maybeSingle()
      .then(({ data }) => setLoyaltyPoints(data?.points ?? 0));
  }, [loyaltyConfig, customerPhone, restaurantQuery.data?.id]);

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

    // Filter categories by time-based scheduling (available_from/available_to)
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const timeFiltered = categories.filter((c: any) => {
      if (c.available_from && c.available_to) {
        return currentTime >= c.available_from && currentTime <= c.available_to;
      }
      return true; // No schedule = always visible
    });

    const result: CategoryWithItems[] = timeFiltered
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
      <PWAInstallPrompt />
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

      {/* Dark mode toggle */}
      <button onClick={() => setDarkMode(!darkMode)} className="fixed top-4 right-4 z-50 h-10 w-10 rounded-full bg-card border shadow-lg flex items-center justify-center hover:scale-110 transition-transform" aria-label="Toggle dark mode">
        {darkMode ? <Sun className="h-5 w-5 text-amber-400" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Order Type Selector */}
      <div className="w-full max-w-3xl mx-auto px-4 pt-3">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {([['dine_in', 'Dine In', Store], ['pickup', 'Pickup', ShoppingBag], ['delivery', 'Delivery', Truck]] as const).map(([type, label, Icon]) => (
            <button key={type} onClick={() => setOrderType(type as any)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${orderType === type ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Icon className="h-3.5 w-3.5" />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Reorder from History */}
      <div className="w-full max-w-3xl mx-auto px-4 pt-3">
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-1">
            <ShoppingBag className="h-4 w-4" /> Reorder from past orders
          </summary>
          <div className="mt-2 space-y-2 pb-2">
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={reorderPhone}
                onChange={e => setReorderPhone(e.target.value)}
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <button onClick={fetchReorderHistory} disabled={reorderLoading || reorderPhone.length < 10}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50">
                {reorderLoading ? '...' : 'Find'}
              </button>
            </div>
            {reorderHistory.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {reorderHistory.map((order: any) => (
                  <div key={order.id} className="rounded-lg border bg-card p-3 space-y-1.5">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{new Date(order.placed_at).toLocaleDateString()}</span>
                      <span>{formatMoney(order.total_cents, currencyCode)}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {order.order_items?.map((item: any) => (
                        <button key={item.id}
                          onClick={() => {
                            activeCart.addItem({
                              cart_id: `reorder-${item.menu_item_id}-${Date.now()}`,
                              menu_item_id: item.menu_item_id,
                              name: item.name_snapshot,
                              quantity: item.quantity,
                              unit_price_cents: item.unit_price_cents,
                            });
                            toast({ title: `Added ${item.name_snapshot}` });
                          }}
                          className="text-xs rounded-md border px-2 py-1 hover:bg-muted transition-colors">
                          +{item.quantity}x {item.name_snapshot}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {reorderHistory.length === 0 && reorderPhone.length >= 10 && !reorderLoading && (
              <p className="text-xs text-muted-foreground text-center py-2">No past orders found for this number</p>
            )}
          </div>
        </details>
      </div>

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
                <div className="space-y-2">
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant={dietaryFilter === 'all' ? 'default' : 'outline'} className="rounded-full" onClick={() => setDietaryFilter('all')}>All</Button>
                    <Button size="sm" variant={dietaryFilter === 'veg' ? 'default' : 'outline'} className="rounded-full text-green-600 border-green-200" onClick={() => setDietaryFilter('veg')}><Leaf className="mr-1 h-3.5 w-3.5" />Veg</Button>
                    <Button size="sm" variant={dietaryFilter === 'nonveg' ? 'default' : 'outline'} className="rounded-full text-red-600 border-red-200" onClick={() => setDietaryFilter('nonveg')}><Drumstick className="mr-1 h-3.5 w-3.5" />Non-Veg</Button>
                  </div>
                  {/* Allergen Exclusion Filter */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><ShieldAlert className="h-3 w-3" />Exclude:</span>
                    {ALLERGEN_OPTIONS.map(a => {
                      const active = excludeAllergens.includes(a);
                      return (
                        <button
                          key={a}
                          onClick={() => setExcludeAllergens(prev => active ? prev.filter(x => x !== a) : [...prev, a])}
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-destructive/10 border-destructive/30 text-destructive'
                              : 'border-muted text-muted-foreground hover:border-border'
                          }`}
                        >
                          {active ? '✕ ' : ''}{a}
                        </button>
                      );
                    })}
                  </div>
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
                  const ft = item.food_type || 'veg';
                  if (dietaryFilter === 'veg') return ft === 'veg';
                  if (dietaryFilter === 'nonveg') return ft === 'nonveg' || ft === 'egg';
                  return true;
                });
              }
              // Apply allergen exclusion filter
              if (excludeAllergens.length > 0) {
                filteredItems = filteredItems.filter((item: any) => {
                  const itemAllergens: string[] = Array.isArray(item.allergens) ? item.allergens : [];
                  return !excludeAllergens.some(a => itemAllergens.includes(a));
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
                            className="h-20 w-20 rounded-md object-cover border cursor-pointer hover:opacity-80 transition-opacity"
                            loading="lazy"
                            onClick={() => setLightboxImg(item.image_url)}
                          />
                        ) : null}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                          <p className="font-medium truncate flex items-center gap-1.5">
                            <span className={`inline-block h-2.5 w-2.5 rounded-sm shrink-0 border ${
                              item.food_type === 'nonveg' ? 'bg-red-500 border-red-600'
                              : item.food_type === 'egg' ? 'bg-yellow-500 border-yellow-600'
                              : 'bg-green-500 border-green-600'
                            }`} />
                            {item.name}
                            {popularIds.includes(item.id) && (
                              <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-orange-500">
                                <Flame className="h-3 w-3" /> Hot
                              </span>
                            )}
                            {(item.spice_level > 0) && <span className="text-xs">{'🌶️'.repeat(Math.min(item.spice_level, 3))}</span>}
                          </p>
                              {item.description ? (
                                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                                  {item.description}
                                </p>
                              ) : null}
                              {(item.tags && item.tags.length > 0) && (
                                <div className="mt-1 flex gap-1 flex-wrap">
                                  {item.tags.slice(0, 3).map((t: string) => (
                                    <span key={t} className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{t}</span>
                                  ))}
                                </div>
                              )}
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

                {/* Tip for Staff — dynamic from settings */}
                {tipConfig && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                  <p className="text-xs text-muted-foreground font-medium">Tip for Staff</p>
                  {(tipConfig.mode === 'percentage' || tipConfig.mode === 'both') && (
                    <div className="flex gap-1.5 flex-wrap">
                      <button onClick={() => { setTipPercent(0); setTipAmount(0); }}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tipPercent === 0 && tipAmount === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-muted text-muted-foreground'}`}>None</button>
                      {(tipConfig.percentage_options || [10, 15, 20]).map(pct => (
                        <button key={pct} onClick={() => { setTipPercent(pct); setTipAmount(0); }}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tipPercent === pct ? 'border-primary bg-primary/10 text-primary' : 'border-muted text-muted-foreground'}`}>
                          {pct}%
                        </button>
                      ))}
                    </div>
                  )}
                  {(tipConfig.mode === 'amount' || tipConfig.mode === 'both') && (
                    <div className="flex gap-1.5 flex-wrap">
                      {tipConfig.mode === 'amount' && (
                        <button onClick={() => { setTipAmount(0); setTipPercent(0); }}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tipAmount === 0 && tipPercent === 0 ? 'border-primary bg-primary/10 text-primary' : 'border-muted text-muted-foreground'}`}>None</button>
                      )}
                      {(tipConfig.amount_options || [20, 50, 100]).map(amt => (
                        <button key={amt} onClick={() => { setTipAmount(amt); setTipPercent(0); }}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${tipAmount === amt ? 'border-primary bg-primary/10 text-primary' : 'border-muted text-muted-foreground'}`}>
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  )}
                  {tipCents > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tip</span>
                      <span className="font-medium">{formatMoney(tipCents, currencyCode)}</span>
                    </div>
                  )}
                </div>
                )}

                {/* Tax Breakdown — dynamic label + rate */}
                <div className="space-y-1.5 text-sm border-t pt-2">
                  <div className="flex justify-between text-muted-foreground">
                    <span>{taxSettings.label} ({Math.round(taxSettings.rate * 100)}%)</span>
                    <span>{formatMoney(gstCents, currencyCode)}</span>
                  </div>
                  {activeCart.discountCents > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{formatMoney(activeCart.discountCents, currencyCode)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-1 border-t">
                    <span>Grand Total</span>
                    <span>{formatMoney(activeCart.totalCents + gstCents + tipCents, currencyCode)}</span>
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

                {/* Delivery Address — only when delivery selected */}
                {orderType === 'delivery' && (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                    <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                      📍 Delivery Address
                    </p>
                    <textarea
                      placeholder="Enter your full delivery address..."
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                    />
                  </div>
                )}

                {/* Loyalty Points */}
                {loyaltyConfig && customerPhone && customerPhone.length >= 10 && (
                  <div className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1">⭐ Loyalty Points</span>
                      {loyaltyPoints !== null && <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{loyaltyPoints} pts</span>}
                    </div>
                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      You'll earn ~{Math.round((activeCart.subtotalCents / 10000) * loyaltyConfig.points_per_100_spent)} points on this order
                    </p>
                    {loyaltyPoints !== null && loyaltyPoints >= loyaltyConfig.min_redeem_points && (
                      <p className="text-[11px] text-green-600 font-medium">
                        ✓ You can redeem {loyaltyConfig.min_redeem_points} pts for {formatMoney(Math.round((loyaltyConfig.min_redeem_points / loyaltyConfig.points_to_currency) * 100), currencyCode)} off!
                      </p>
                    )}
                  </div>
                )}

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
      {/* ═══ Sticky Cart Bar ═══ */}
      {activeCart.itemCount > 0 && !cartOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-3 bg-background/95 backdrop-blur-lg border-t shadow-[0_-4px_20px_rgba(0,0,0,0.1)]">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => setCartOpen(true)}
              className="w-full flex items-center justify-between bg-primary text-primary-foreground rounded-xl px-5 py-3.5 font-medium shadow-lg hover:opacity-90 transition-opacity"
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-5 w-5" />
                <span>{activeCart.itemCount} {activeCart.itemCount === 1 ? 'item' : 'items'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>{formatMoney(activeCart.totalCents, restaurantQuery.data?.currency_code)}</span>
                <span className="text-sm opacity-80">View Cart →</span>
              </div>
            </button>
          </div>
        </div>
      )}
      {/* WhatsApp Floating Button */}
      {(() => {
        const s = restaurantQuery.data?.settings as any;
        const waNum = s && typeof s === 'object' ? s.whatsapp_number : null;
        if (!waNum) return null;
        return (
          <a href={`https://wa.me/${waNum.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi! I'd like to place an order from ${restaurantQuery.data?.name || 'your restaurant'}`)}`} target="_blank" rel="noopener noreferrer" className={`fixed ${activeCart.itemCount > 0 && !cartOpen ? 'bottom-24' : 'bottom-6'} right-4 z-40 h-14 w-14 rounded-full bg-green-500 text-white shadow-lg flex items-center justify-center hover:bg-green-600 hover:scale-110 transition-all`} aria-label="Order via WhatsApp">
            <MessageCircle className="h-7 w-7" />
          </a>
        );
      })()}

      {/* Image Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <button className="absolute top-4 right-4 text-white hover:text-gray-300 z-10" onClick={() => setLightboxImg(null)}><X className="h-8 w-8" /></button>
          <img src={lightboxImg} alt="Item" className="max-h-[85vh] max-w-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </main>
  );
}
