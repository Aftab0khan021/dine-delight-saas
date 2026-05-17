import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Minus, Trash2, ShoppingCart, Search, CheckCircle2, Store, ShoppingBag, Truck, X, CreditCard, Banknote, Smartphone, StickyNote } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { formatMoney, shortId } from "@/lib/formatting";
import { generateKOTHtml } from "../components/orders/KOTTemplate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { FeatureGate } from "../components/FeatureGate";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = { id: string; name: string; sort_order: number };

type Variant = { id: string; name: string; price_cents: number; is_active: boolean; is_default: boolean };

type Addon = { id: string; name: string; price_cents: number; is_active: boolean };

type MenuItem = {
  id: string;
  name: string;
  price_cents: number;
  image_url: string | null;
  category_id: string | null;
  food_type: string | null;
  is_active: boolean;
  is_sold_out?: boolean;
};

type CartItem = {
  cart_id: string;
  menu_item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  addons: { id: string; name: string; price_cents: number }[];
  notes: string;
};

type OrderType = "dine_in" | "pickup" | "delivery";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function foodTypeDot(type: string | null) {
  if (type === "veg") return <span className="inline-block h-3 w-3 rounded-sm border-2 border-green-600 bg-green-500 shrink-0" title="Veg" />;
  if (type === "non_veg") return <span className="inline-block h-3 w-3 rounded-sm border-2 border-red-600 bg-red-500 shrink-0" title="Non-Veg" />;
  // QO-5: Egg type yellow dot
  if (type === "egg") return <span className="inline-block h-3 w-3 rounded-sm border-2 border-yellow-500 bg-yellow-400 shrink-0" title="Contains Egg" />;
  return null;
}

type PaymentMethod = "cash" | "card" | "upi";

function cartId(item: Omit<CartItem, "cart_id" | "quantity" | "notes">) {
  return [item.menu_item_id, item.variant_id ?? "nv", ...item.addons.map(a => a.id).sort()].join("|");
}

// ─── Item Picker Dialog ───────────────────────────────────────────────────────

function ItemPickerDialog({
  item,
  variants,
  addons,
  currency,
  onAdd,
  onClose,
}: {
  item: MenuItem;
  variants: Variant[];
  addons: Addon[];
  currency: string;
  onAdd: (ci: Omit<CartItem, "cart_id" | "quantity">, qty: number) => void;
  onClose: () => void;
}) {
  const activeVariants = variants.filter(v => v.is_active);
  const activeAddons = addons.filter(a => a.is_active);

  const defaultVariant = activeVariants.find(v => v.is_default) ?? activeVariants[0] ?? null;
  const [selectedVariant, setSelectedVariant] = useState<Variant | null>(defaultVariant);
  const [selectedAddons, setSelectedAddons] = useState<Addon[]>([]);
  const [notes, setNotes] = useState("");
  // QO-6: Multi-quantity
  const [qty, setQty] = useState(1);

  const basePrice = selectedVariant ? selectedVariant.price_cents : item.price_cents;
  const addonTotal = selectedAddons.reduce((s, a) => s + a.price_cents, 0);
  const unitPrice = basePrice + addonTotal;

  function toggleAddon(addon: Addon) {
    setSelectedAddons(prev =>
      prev.some(a => a.id === addon.id) ? prev.filter(a => a.id !== addon.id) : [...prev, addon]
    );
  }

  function handleAdd() {
    onAdd({
      menu_item_id: item.id,
      name: item.name,
      unit_price: unitPrice,
      variant_id: selectedVariant?.id,
      variant_name: selectedVariant?.name,
      addons: selectedAddons.map(a => ({ id: a.id, name: a.name, price_cents: a.price_cents })),
      notes,
    }, qty);
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {foodTypeDot(item.food_type)}
            <span className="truncate">{item.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Variants */}
          {activeVariants.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Size / Variant</p>
              <div className="grid grid-cols-2 gap-2">
                {activeVariants.map(v => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVariant(v)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      selectedVariant?.id === v.id
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <div>{v.name}</div>
                    <div className="text-xs text-muted-foreground">{formatMoney(v.price_cents, currency)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Addons */}
          {activeAddons.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add-ons</p>
              <div className="space-y-1">
                {activeAddons.map(a => {
                  const checked = selectedAddons.some(s => s.id === a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleAddon(a)}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                        checked ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      )}
                    >
                      <span>{a.name}</span>
                      <span className="text-muted-foreground">+{formatMoney(a.price_cents, currency)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">Special Instructions (optional)</Label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. No onions, extra spicy…"
              className="h-8 text-sm"
              maxLength={120}
            />
          </div>
        </div>

        {/* QO-6: Quantity stepper */}
        <div className="flex items-center gap-3 pt-2 border-t">
          <div className="flex items-center gap-1.5">
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
              <Minus className="h-3 w-3" />
            </button>
            <span className="w-6 text-center text-sm font-semibold">{qty}</span>
            <button onClick={() => setQty(q => Math.min(50, q + 1))} className="h-7 w-7 rounded border flex items-center justify-center hover:bg-muted">
              <Plus className="h-3 w-3" />
            </button>
          </div>
          <span className="font-semibold text-sm">{formatMoney(unitPrice * qty, currency)}</span>
          <Button size="sm" className="ml-auto" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" /> Add {qty > 1 ? `(${qty})` : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function QuickOrder() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const currency = restaurant?.currency_code ?? "INR";
  const restaurantId = restaurant?.id;

  // ── Menu data — all queries disabled until restaurant is loaded ──
  const catsQuery = useQuery({
    queryKey: ["admin", "quick-order", "categories", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name, sort_order")
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const itemsQuery = useQuery({
    queryKey: ["admin", "quick-order", "items", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("id, name, price_cents, image_url, category_id, food_type, is_active, is_sold_out")
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("sort_order");
      if (error) throw error;
      return data as MenuItem[];
    },
  });

  const variantsQuery = useQuery({
    queryKey: ["admin", "quick-order", "variants", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_item_variants")
        .select("id, menu_item_id, name, price_cents, is_active, is_default")
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as (Variant & { menu_item_id: string })[];
    },
  });

  const addonsQuery = useQuery({
    queryKey: ["admin", "quick-order", "addons", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_item_addons")
        .select("id, menu_item_id, name, price_cents, is_active")
        .eq("restaurant_id", restaurantId!)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as (Addon & { menu_item_id: string })[];
    },
  });

  // ── Tax settings from restaurant ──
  const taxSettings = useMemo(() => {
    const s = (restaurant?.settings as any) ?? {};
    return {
      rate: Number(s.tax_rate ?? 0) / 100,
      label: String(s.tax_label ?? "Tax"),
    };
  }, [restaurant?.settings]);

  // ── State ──
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerItem, setPickerItem] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<OrderType>("dine_in");
  const [tableLabel, setTableLabel] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [placing, setPlacing] = useState(false);
  const [successToken, setSuccessToken] = useState<string | null>(null);
  // QO-9: Payment method
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  // QO-4: Order-level notes
  const [orderNotes, setOrderNotes] = useState("");
  // QO-18: Confirm dialog
  const [showConfirm, setShowConfirm] = useState(false);
  // QO-13/14: Last placed order data for KOT print and "add another"
  const [lastOrderData, setLastOrderData] = useState<any>(null);
  // QO-12: Tip
  const [tipCents, setTipCents] = useState(0);
  // QO-7: Image zoom
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  // QO-15: Order history sidebar
  const [showHistory, setShowHistory] = useState(false);

  // QO-15: Recent orders query
  const recentOrdersQuery = useQuery({
    queryKey: ["admin", "quick-order", "recent", restaurantId],
    enabled: !!restaurantId && showHistory,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, placed_at, table_label, total_cents, order_type, customer_name")
        .eq("restaurant_id", restaurantId!)
        .order("placed_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return data ?? [];
    },
  });

  // QO-2: Frequently ordered items (top 8 by order count)
  const freqQuery = useQuery({
    queryKey: ["admin", "quick-order", "frequent", restaurantId],
    enabled: !!restaurantId,
    staleTime: 5 * 60_000, // cache for 5 min
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("menu_item_id, menu_items!inner(id, name, price_cents, image_url, food_type, is_active, is_sold_out)")
        .eq("menu_items.restaurant_id", restaurantId!)
        .eq("menu_items.is_active", true)
        .limit(500);
      if (error) return [];
      // Count occurrences per menu_item_id
      const counts: Record<string, { count: number; item: any }> = {};
      for (const row of (data ?? [])) {
        const mi = (row as any).menu_items;
        if (!mi || mi.is_sold_out) continue;
        if (!counts[row.menu_item_id]) counts[row.menu_item_id] = { count: 0, item: mi };
        counts[row.menu_item_id].count++;
      }
      return Object.values(counts)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
        .map(c => c.item as MenuItem);
    },
  });

  // ── Derived (all useMemo must be BEFORE any early return) ──
  const categories = catsQuery.data ?? [];
  const allItems = itemsQuery.data ?? [];
  const frequentItems = freqQuery.data ?? [];

  const filteredItems = useMemo(() => {
    let items = allItems.filter(i => i.is_sold_out !== true);
    if (selectedCat) items = items.filter(i => i.category_id === selectedCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [allItems, selectedCat, search]);

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);
  const taxCents = Math.round(subtotal * taxSettings.rate);
  const total = subtotal + taxCents + tipCents;

  // Guard: show spinner while restaurant context is loading (placed after ALL hooks)
  if (!restaurantId) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  // ── Cart helpers ──
  function addToCart(ci: Omit<CartItem, "cart_id" | "quantity">, qty: number = 1) {
    const id = cartId(ci);
    setCart(prev => {
      const idx = prev.findIndex(c => c.cart_id === id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
        return next;
      }
      return [...prev, { ...ci, cart_id: id, quantity: qty }];
    });
  }

  function changeQty(cart_id: string, delta: number) {
    setCart(prev =>
      prev
        .map(c => c.cart_id === cart_id ? { ...c, quantity: c.quantity + delta } : c)
        .filter(c => c.quantity > 0)
    );
  }

  function removeItem(cart_id: string) {
    setCart(prev => prev.filter(c => c.cart_id !== cart_id));
  }

  function resetAll(keepTable = false) {
    setCart([]);
    if (!keepTable) setTableLabel("");
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setOrderType("dine_in");
    setSuccessToken(null);
    setPaymentMethod("cash");
    setOrderNotes("");
    setLastOrderData(null);
    setShowConfirm(false);
    setTipCents(0);
  }

  // ── Place order ──
  async function handlePlaceOrder() {
    if (cart.length === 0) {
      toast({ title: "Cart is empty", variant: "destructive" });
      return;
    }
    if (orderType === "dine_in" && !tableLabel.trim()) {
      toast({ title: "Please enter a table number / label", variant: "destructive" });
      return;
    }
    if (orderType === "delivery" && !deliveryAddress.trim()) {
      toast({ title: "Please enter a delivery address", variant: "destructive" });
      return;
    }

    setPlacing(true);
    setShowConfirm(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Not authenticated");

      // QO-17: Get staff user info
      const { data: { user } } = await supabase.auth.getUser();

      const payload = {
        restaurant_id: restaurant!.id,
        via_staff: true,
        payment_method: paymentMethod,  // QO-9
        order_type: orderType,
        table_label: orderType === "dine_in" ? tableLabel.trim() || null : null,
        delivery_address: orderType === "delivery" ? deliveryAddress.trim() : null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        notes: orderNotes.trim() || null,  // QO-4
        items: cart.map(c => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          variant_id: c.variant_id,
          addons: c.addons.map(a => ({ id: a.id })),
          notes: c.notes || null,
        })),
        tax_cents: taxCents,
        tax_label: taxSettings.label,
        tax_rate_pct: Math.round(taxSettings.rate * 100),
        tip_cents: tipCents,  // QO-12
        extra_charges: [],
        // QO-17: Staff metadata
        metadata: {
          via_staff: true,
          staff_user_id: user?.id ?? null,
          staff_email: user?.email ?? null,
        },
      };

      const { data, error } = await supabase.functions.invoke("place-order", {
        body: payload,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(error.message);
      if (!data?.id) throw new Error("Order was not created");

      const token = data.order_token ?? data.id.slice(0, 8).toUpperCase();
      setSuccessToken(token);

      // QO-13: Build order data for KOT print
      const kotOrder = {
        id: data.id,
        dailyToken: null,
        placed_at: new Date().toISOString(),
        order_type: orderType,
        table_label: orderType === "dine_in" ? tableLabel.trim() : null,
        delivery_address: orderType === "delivery" ? deliveryAddress.trim() : null,
        item_details: cart.map(c => ({
          name_snapshot: c.name,
          quantity: c.quantity,
          variant_name: c.variant_name,
          addons: c.addons,
          notes: c.notes,
        })),
      };
      setLastOrderData(kotOrder);

      // QO-13: Auto-print KOT
      try {
        const html = generateKOTHtml(kotOrder, restaurant?.name || "Restaurant");
        const w = window.open('', '_blank', 'width=420,height=650,scrollbars=yes');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      } catch { /* Don't fail order on print error */ }

      setCart([]);
      toast({ title: "✅ Order placed!", description: `Token: ${token}` });
    } catch (e: any) {
      toast({ title: "Failed to place order", description: e.message, variant: "destructive" });
    } finally {
      setPlacing(false);
    }
  }

  // ── Success screen ──
  if (successToken) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <h2 className="text-2xl font-bold">Order Placed!</h2>
          <p className="text-muted-foreground">The order has been sent to the kitchen.</p>
          <div className="mt-2 rounded-xl bg-muted px-6 py-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Order Token</p>
            <p className="text-3xl font-mono font-bold tracking-wider">{successToken}</p>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap justify-center">
          <Button variant="outline" onClick={() => resetAll()}>New Order</Button>
          {/* QO-14: Add another for same table */}
          {tableLabel && (
            <Button variant="outline" onClick={() => resetAll(true)}>
              Another Order · {tableLabel}
            </Button>
          )}
          {/* QO-13: Reprint KOT */}
          {lastOrderData && (
            <Button variant="outline" onClick={() => {
              const html = generateKOTHtml(lastOrderData, restaurant?.name || "Restaurant");
              const w = window.open('', '_blank', 'width=420,height=650,scrollbars=yes');
              if (w) { w.document.open(); w.document.write(html); w.document.close(); }
            }}>
              🖨️ Reprint KOT
            </Button>
          )}
          <Button onClick={() => navigate("/admin/orders")}>View Orders</Button>
        </div>
      </div>
    );
  }

  return (
    <FeatureGate featureKey="online_ordering" featureName="Quick Order (Staff POS)" description="Place orders on behalf of customers directly from the admin panel.">
    <div className="flex flex-col gap-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quick Order</h1>
          <p className="text-sm text-muted-foreground">Place orders on behalf of customers — no phone required.</p>
        </div>
        {/* QO-15: Order history toggle */}
        <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)} className="gap-1.5">
          📋 {showHistory ? "Hide" : "Recent Orders"}
        </Button>
      </div>

      {/* QO-15: Recent orders panel */}
      {showHistory && (
        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Recent Orders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-48 overflow-y-auto">
            {(recentOrdersQuery.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">No recent orders</p>
            ) : (recentOrdersQuery.data ?? []).map((o: any) => (
              <div key={o.id} className="flex items-center justify-between text-xs border-b last:border-0 pb-1">
                <div>
                  <span className="font-medium">{shortId(o.id)}</span>
                  <span className="text-muted-foreground ml-2">{new Date(o.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  {o.customer_name && <span className="text-muted-foreground ml-1">· {o.customer_name}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] h-4 px-1">{o.status}</Badge>
                  <span className="font-medium">{formatMoney(o.total_cents, currency)}</span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 items-start">

        {/* ── Left: Menu Browser ── */}
        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search menu items…"
              className="pl-9"
            />
          </div>

          {/* QO-2: Frequently ordered items */}
          {frequentItems.length > 0 && !search.trim() && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Popular</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {frequentItems.map(fi => (
                  <button
                    key={fi.id}
                    onClick={() => {
                      const hasV = (variantsQuery.data ?? []).some(v => v.menu_item_id === fi.id && v.is_active);
                      const hasA = (addonsQuery.data ?? []).some(a => a.menu_item_id === fi.id && a.is_active);
                      if (!hasV && !hasA) {
                        addToCart({ menu_item_id: fi.id, name: fi.name, unit_price: fi.price_cents, addons: [], notes: "" });
                        toast({ title: `Added ${fi.name}` });
                      } else {
                        setPickerItem(fi);
                      }
                    }}
                    className="flex items-center gap-1.5 shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary hover:bg-primary/5"
                  >
                    {foodTypeDot(fi.food_type)}
                    <span className="truncate max-w-[100px]">{fi.name}</span>
                    <span className="text-muted-foreground">{formatMoney(fi.price_cents, currency)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category chips */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCat(null)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                !selectedCat ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
              )}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCat(c.id === selectedCat ? null : c.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  selectedCat === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/50"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Items grid */}
          {itemsQuery.isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              No items found.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredItems.map(item => {
                // QO-1: Check if item has variants or addons
                const hasVariants = (variantsQuery.data ?? []).some(v => v.menu_item_id === item.id && v.is_active);
                const hasAddons = (addonsQuery.data ?? []).some(a => a.menu_item_id === item.id && a.is_active);
                const isSimple = !hasVariants && !hasAddons;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      if (isSimple) {
                        // QO-1: Direct add to cart — skip dialog
                        addToCart({
                          menu_item_id: item.id,
                          name: item.name,
                          unit_price: item.price_cents,
                          addons: [],
                          notes: "",
                        });
                        toast({ title: `Added ${item.name}` });
                      } else {
                        setPickerItem(item);
                      }
                    }}
                    className="group relative flex flex-col items-start rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-sm active:scale-[0.98]"
                  >
                    {item.image_url && (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="mb-2 h-14 w-full rounded-lg object-cover cursor-zoom-in"
                        onClick={(e) => { e.stopPropagation(); setZoomImage(item.image_url); }}
                      />
                    )}
                    <div className="flex items-start gap-1.5 w-full">
                      {foodTypeDot(item.food_type)}
                      <span className="text-sm font-medium leading-tight line-clamp-2">{item.name}</span>
                    </div>
                    <span className="mt-1 text-xs text-muted-foreground">{formatMoney(item.price_cents, currency)}</span>
                  <Plus className="absolute top-2 right-2 h-4 w-4 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: Cart & Checkout ── */}
        <Card className="shadow-sm sticky top-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Cart
              {cart.length > 0 && (
                <Badge variant="secondary" className="ml-auto">{cart.reduce((s, c) => s + c.quantity, 0)} items</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Cart items */}
            {cart.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No items added yet.</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {cart.map(item => (
                  <div key={item.cart_id} className="flex items-start gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      {item.variant_name && <p className="text-xs text-muted-foreground">{item.variant_name}</p>}
                      {item.addons.length > 0 && (
                        <p className="text-xs text-muted-foreground">+{item.addons.map(a => a.name).join(", ")}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatMoney(item.unit_price, currency)} each</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => changeQty(item.cart_id, -1)} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted">
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-5 text-center text-xs font-semibold">{item.quantity}</span>
                      <button onClick={() => changeQty(item.cart_id, 1)} className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted">
                        <Plus className="h-3 w-3" />
                      </button>
                      <button onClick={() => removeItem(item.cart_id)} className="h-6 w-6 rounded flex items-center justify-center hover:bg-destructive/10 hover:text-destructive ml-0.5">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cart.length > 0 && (
              <>
                <Separator />
                {/* Bill summary */}
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatMoney(subtotal, currency)}</span>
                  </div>
                  {taxCents > 0 && (
                    <div className="flex justify-between">
                      <span>{taxSettings.label} ({Math.round(taxSettings.rate * 100)}%)</span>
                      <span>{formatMoney(taxCents, currency)}</span>
                    </div>
                  )}
                  {tipCents > 0 && (
                    <div className="flex justify-between">
                      <span>Tip</span>
                      <span>{formatMoney(tipCents, currency)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-foreground text-sm pt-0.5 border-t border-dashed">
                    <span>Total</span>
                    <span>{formatMoney(total, currency)}</span>
                  </div>
                </div>

                {/* QO-12: Tip input */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Tip (optional)</Label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 10, 15, 20].map(pct => {
                      const tipVal = pct === 0 ? 0 : Math.round(subtotal * pct / 100);
                      const isActive = tipCents === tipVal;
                      return (
                        <button
                          key={pct}
                          onClick={() => setTipCents(tipVal)}
                          className={cn(
                            "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
                            isActive ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                          )}
                        >
                          {pct === 0 ? "No tip" : `${pct}% (${formatMoney(tipVal, currency)})`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* Order type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Order Type</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: "dine_in", label: "Dine-In", icon: Store },
                  { value: "pickup", label: "Pickup", icon: ShoppingBag },
                  { value: "delivery", label: "Delivery", icon: Truck },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setOrderType(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors",
                      orderType === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table label (dine-in) */}
            {orderType === "dine_in" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Table Number / Label <span className="text-destructive">*</span></Label>
                <Input
                  value={tableLabel}
                  onChange={e => setTableLabel(e.target.value)}
                  placeholder="e.g. A1, 12, Rooftop-3"
                  className="h-8 text-sm"
                  maxLength={20}
                />
              </div>
            )}

            {/* Delivery address */}
            {orderType === "delivery" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery Address <span className="text-destructive">*</span></Label>
                <Input
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Customer's full address"
                  className="h-8 text-sm"
                  maxLength={300}
                />
              </div>
            )}

            {/* Optional customer info */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Name (optional)</Label>
                <Input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  className="h-8 text-sm"
                  maxLength={60}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Phone (optional)</Label>
                <Input
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+91…"
                  className="h-8 text-sm"
                  maxLength={20}
                  type="tel"
                />
              </div>
            </div>

            {/* QO-9: Payment method */}
            <div className="space-y-1.5">
              <Label className="text-xs">Payment Method</Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: "cash" as PaymentMethod, label: "Cash", icon: Banknote },
                  { value: "card" as PaymentMethod, label: "Card", icon: CreditCard },
                  { value: "upi" as PaymentMethod, label: "UPI", icon: Smartphone },
                ]).map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setPaymentMethod(value)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium transition-colors",
                      paymentMethod === value ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* QO-4: Order-level notes */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <StickyNote className="h-3 w-3" /> Order Notes (optional)
              </Label>
              <Textarea
                value={orderNotes}
                onChange={e => setOrderNotes(e.target.value)}
                placeholder="e.g. Birthday table, add candles…"
                className="text-sm min-h-[48px] resize-none"
                maxLength={300}
                rows={2}
              />
            </div>

            {/* QO-18: Confirm or Place */}
            <Button
              className="w-full"
              disabled={cart.length === 0 || placing}
              onClick={() => setShowConfirm(true)}
            >
              {placing ? "Placing…" : `Place Order · ${formatMoney(total, currency)}`}
            </Button>

            {cart.length > 0 && (
              <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setCart([])}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear cart
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Item picker dialog */}
      {pickerItem && (
        <ItemPickerDialog
          item={pickerItem}
          variants={(variantsQuery.data ?? []).filter(v => v.menu_item_id === pickerItem.id)}
          addons={(addonsQuery.data ?? []).filter(a => a.menu_item_id === pickerItem.id)}
          currency={currency}
          onAdd={addToCart}
          onClose={() => setPickerItem(null)}
        />
      )}

      {/* QO-18: Confirm dialog */}
      {showConfirm && (
        <Dialog open onOpenChange={() => setShowConfirm(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm Order</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm max-h-[50vh] overflow-y-auto">
              {cart.map(item => (
                <div key={item.cart_id} className="flex justify-between gap-2">
                  <span>{item.quantity}× {item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                  <span className="text-muted-foreground shrink-0">{formatMoney(item.unit_price * item.quantity, currency)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Total</span>
                <span>{formatMoney(total, currency)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {orderType === "dine_in" && tableLabel && `Table ${tableLabel} · `}
                {paymentMethod.toUpperCase()}
                {customerName && ` · ${customerName}`}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirm(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handlePlaceOrder} disabled={placing}>
                {placing ? "Placing…" : "Confirm & Place"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* QO-7: Image zoom dialog */}
      {zoomImage && (
        <Dialog open onOpenChange={() => setZoomImage(null)}>
          <DialogContent className="max-w-md p-2">
            <img src={zoomImage} alt="Item preview" className="w-full rounded-lg object-contain max-h-[70vh]" />
          </DialogContent>
        </Dialog>
      )}
    </div>
    </FeatureGate>
  );
}
