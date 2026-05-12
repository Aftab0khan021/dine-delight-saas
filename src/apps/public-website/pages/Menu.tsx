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
import { Minus, Plus, ShoppingBag, Flame, Users, MessageCircle, Leaf, Drumstick, Search, X, CreditCard, Banknote, ShieldAlert, Moon, Sun, Truck, Store, User, Tag, CheckCircle2, Smartphone, Copy, Split, Home, Grid2x2, List, Share2, Wifi, WifiOff, Zap, Star } from "lucide-react";
import { useRestaurantCart } from "../hooks/useRestaurantCart";
import { useCollaborativeCart } from "../hooks/useCollaborativeCart";
import { MenuItemDialog } from "../components/MenuItemDialog";
import { TablePresence } from "../components/TablePresence";
import { SplitBillView } from "../components/SplitBillView";
import { Turnstile } from "@/components/security/Turnstile";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { formatMoney, toCents } from "@/lib/formatting";
import { usePublicFeatureAccess } from "../hooks/usePublicFeatureAccess";
import confetti from "canvas-confetti";

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
  const [splitPeople, setSplitPeople] = useState(2);
  const [showSplitCalc, setShowSplitCalc] = useState(false);

  // Search + Category Jump
  const [menuSearch, setMenuSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const categoryBarRef = useRef<HTMLDivElement>(null);
  const cartBtnRef = useRef<HTMLButtonElement>(null);

  // M1: Grid / List view mode
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('dd-menu-view') as 'list' | 'grid') || 'list'
  );
  const setView = (m: 'list' | 'grid') => { setViewMode(m); localStorage.setItem('dd-menu-view', m); };

  // M3: Fly-to-cart animation
  const [flyAnim, setFlyAnim] = useState<{ x: number; y: number; src: string } | null>(null);
  const [cartBounce, setCartBounce] = useState(false);

  // M18: Offline banner
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // M10: Availability countdown
  const [nowTime, setNowTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`;
  });
  useEffect(() => {
    const t = setInterval(() => {
      const n = new Date();
      setNowTime(`${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}`);
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedOrderToken, setPlacedOrderToken] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);

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

  // Allergen exclusion filter — load custom list from restaurant settings
  const ALLERGEN_OPTIONS = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    if (s && typeof s === 'object' && Array.isArray(s.custom_allergens) && s.custom_allergens.length > 0) {
      return s.custom_allergens as string[];
    }
    return ['Gluten', 'Dairy', 'Nuts', 'Shellfish', 'Soy', 'Egg', 'Fish', 'Sesame'];
  }, [restaurantQuery.data?.settings]);
  const [excludeAllergens, setExcludeAllergens] = useState<string[]>([]);

  // SEO
  useSEO({
    title: restaurantQuery.data ? `Menu — ${restaurantQuery.data.name} | Dine Delight` : "Menu | Dine Delight",
    description: restaurantQuery.data ? `Browse the menu and order from ${restaurantQuery.data.name}. Fresh food, easy ordering.` : undefined,
    ogImage: (restaurantQuery.data as any)?.logo_url || undefined,
  });

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online' | 'upi'>('cash');
  const [upiApp, setUpiApp] = useState<'google_pay' | 'phonepe' | 'paytm' | null>(null);
  const onlinePaymentsEnabled = !!(restaurantQuery.data as any)?.online_payments_enabled;

  // Feature flags — gate public features by subscription
  const { isFeatureEnabled } = usePublicFeatureAccess(restaurantQuery.data?.id);
  const deliveryEnabled = isFeatureEnabled('delivery_zones');
  const couponsEnabled = isFeatureEnabled('coupons');
  const loyaltyFlagEnabled = isFeatureEnabled('loyalty_program');
  const onlinePaymentsFlagEnabled = isFeatureEnabled('online_payments');

  // Online payments require BOTH: restaurant toggle ON + subscription flag ON
  const canUseOnlinePayments = onlinePaymentsEnabled && onlinePaymentsFlagEnabled;

  // Order type: dine_in locked when coming via table QR, else pickup/delivery
  const [orderType, setOrderType] = useState<'dine_in' | 'pickup' | 'delivery'>(
    tableLabel ? 'dine_in' : 'pickup'
  );

  // Active coupons for offers banner
  const { data: menuCoupons } = useQuery({
    queryKey: ["public-menu", "coupons", restaurantQuery.data?.id],
    enabled: !!restaurantQuery.data?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons")
        .select("id, code, description, discount_type, discount_value, min_order_cents, max_discount_cents, expires_at")
        .eq("restaurant_id", restaurantQuery.data!.id)
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
        .order("discount_value", { ascending: false })
        .limit(6);
      return data || [];
    },
  });
  const [copiedOffer, setCopiedOffer] = useState<string | null>(null);

  // Auto-apply best coupon when cart has items
  useEffect(() => {
    if (!menuCoupons || menuCoupons.length === 0 || activeCart.items.length === 0 || activeCart.coupon) return;
    // Find the best coupon that meets min order
    let bestDiscount = 0;
    let bestCoupon: any = null;
    for (const c of menuCoupons) {
      if (c.min_order_cents && activeCart.subtotalCents < c.min_order_cents) continue;
      let discount = 0;
      if (c.discount_type === 'percentage') {
        discount = Math.round((activeCart.subtotalCents * c.discount_value) / 100);
        if (c.max_discount_cents) discount = Math.min(discount, c.max_discount_cents);
      } else {
        discount = c.discount_value;
      }
      if (discount > bestDiscount) {
        bestDiscount = discount;
        bestCoupon = c;
      }
    }
    if (bestCoupon && bestDiscount > 0) {
      activeCart.applyCoupon({
        code: bestCoupon.code,
        discount_type: 'fixed',
        discount_value: bestDiscount,
      });
    }
  }, [menuCoupons, activeCart.subtotalCents, activeCart.items.length]);

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
    ? toCents(tipAmount)
    : tipConfig?.mode === 'both'
      ? (tipPercent > 0 ? Math.round((activeCart.subtotalCents * tipPercent) / 100) : toCents(tipAmount))
      : Math.round((activeCart.subtotalCents * tipPercent) / 100);



  // Tax & Bill Charges — dynamic from restaurant settings
  const taxSettings = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    return { rate: (s?.tax_rate ?? 5) / 100, label: s?.tax_label || 'GST' };
  }, [restaurantQuery.data?.settings]);
  const gstCents = Math.round(activeCart.subtotalCents * taxSettings.rate);

  // Additional bill charges (CGST, SGST, service charge, packing, delivery, etc.)
  type BillCharge = { label: string; type: 'percentage' | 'flat'; value: number };
  const billCharges: BillCharge[] = useMemo(() => {
    const s = restaurantQuery.data?.settings as any;
    return Array.isArray(s?.bill_charges) ? s.bill_charges.filter((c: any) => c.label && c.value > 0) : [];
  }, [restaurantQuery.data?.settings]);

  const billChargeAmounts = useMemo(() => {
    return billCharges.map(c => ({
      label: c.label,
      cents: c.type === 'percentage'
        ? Math.round(activeCart.subtotalCents * c.value / 100)
        : toCents(c.value), // flat amount in rupees → cents
    }));
  }, [billCharges, activeCart.subtotalCents]);

  const totalExtraChargesCents = billChargeAmounts.reduce((sum, c) => sum + c.cents, 0);

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

    // UPI requires name + phone for verification
    if (paymentMethod === 'upi') {
      if (!customerName.trim() || customerName.trim().length < 2) {
        setCheckoutError("Please enter your name for UPI payment verification.");
        return;
      }
      if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) {
        setCheckoutError("Please enter a valid phone number for UPI payment verification.");
        return;
      }
    }

    // Delivery requires address
    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      setCheckoutError("Please enter your delivery address.");
      return;
    }

    setPlacingOrder(true);
    setCheckoutError(null);

    try {
      const orderPayload = {
        restaurant_id: restaurantId,
        table_label: activeCart.tableLabel ?? undefined,
        order_type: orderType,
        delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : undefined,
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
        // Bill breakdown — stored alongside total_cents for receipt/tracking
        tax_cents: gstCents,
        tax_label: taxSettings.label,
        tax_rate_pct: Math.round(taxSettings.rate * 100),
        tip_cents: tipCents,
        extra_charges: billChargeAmounts.map(c => ({ label: c.label, cents: c.cents })),
      };

      let data: any;

      if (paymentMethod === 'online' && canUseOnlinePayments) {
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
      } else if (paymentMethod === 'upi') {
        // === UPI PAYMENT FLOW ===

        if (canUseOnlinePayments) {
          // ─── RAZORPAY UPI (auto-verified, like Swiggy/Zomato) ───
          if (activeCart.subtotalCents <= 0) throw new Error("Cannot pay ₹0 via UPI.");

          const totalAmountCents = activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents;
          const { data: rzpData, error: rzpError } = await supabase.functions.invoke("create-razorpay-order", {
            body: { restaurant_id: restaurantId, amount_cents: totalAmountCents, currency: currencyCode, turnstileToken },
          });
          if (rzpError) throw new Error(typeof rzpError === 'object' && rzpError?.message ? rzpError.message : "Payment gateway error.");
          if (rzpData?.error) throw new Error(rzpData.error);
          if (!rzpData?.razorpay_order_id) throw new Error("No order ID from gateway.");

          if (!(window as any).Razorpay) {
            await new Promise<void>((resolve, reject) => {
              const s = document.createElement('script');
              s.src = 'https://checkout.razorpay.com/v1/checkout.js';
              s.onload = () => resolve();
              s.onerror = () => reject(new Error('Failed to load payment SDK'));
              document.head.appendChild(s);
            });
          }

          // Open Razorpay in UPI-only mode (PhonePe, GPay, Paytm buttons)
          data = await new Promise<any>((resolve, reject) => {
            const rzp = new (window as any).Razorpay({
              key: rzpData.key_id,
              amount: rzpData.amount,
              currency: rzpData.currency,
              name: restaurantQuery.data?.name || 'Restaurant',
              description: `Order from ${restaurantQuery.data?.name || 'Restaurant'}`,
              order_id: rzpData.razorpay_order_id,
              handler: async (response: any) => {
                try {
                  const { data: v, error: vErr } = await supabase.functions.invoke("verify-payment", {
                    body: {
                      razorpay_order_id: response.razorpay_order_id,
                      razorpay_payment_id: response.razorpay_payment_id,
                      razorpay_signature: response.razorpay_signature,
                      order_payload: { ...orderPayload, payment_method: 'upi' },
                    },
                  });
                  if (vErr || !v?.id) reject(new Error(v?.error || 'Payment verification failed'));
                  else resolve(v);
                } catch (e) { reject(e); }
              },
              modal: { ondismiss: () => reject(new Error('Payment cancelled')) },
              prefill: { contact: customerPhone.trim() || undefined, name: customerName.trim() || undefined, method: 'upi' },
              config: {
                display: {
                  blocks: {
                    upi: {
                      name: 'Pay via UPI',
                      instruments: [{ 
                        method: 'upi', 
                        flows: ['intent', 'collect'], 
                        apps: upiApp ? [upiApp] : ['google_pay', 'phonepe', 'paytm'] 
                      }],
                    },
                  },
                  sequence: ['block.upi'],
                  preferences: { show_default_blocks: false },
                },
              },
              theme: { color: '#1a1a2e' },
            });
            rzp.open();
          });

        } else {
          throw new Error("UPI payments require Razorpay. Please enable Online Payments in admin settings.");
        }
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
      fireConfetti(); // M15
      toast({
        title: (paymentMethod === 'online' || (paymentMethod === 'upi' && canUseOnlinePayments)) ? "Payment successful! 🎉" : "Order placed! 🎉",
        description: (paymentMethod === 'online' || (paymentMethod === 'upi' && canUseOnlinePayments))
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

  // M7: Cart restore toast
  const cartRestoreShown = useRef(false);
  useEffect(() => {
    if (cartRestoreShown.current) return;
    const timer = setTimeout(() => {
      if (activeCart.itemCount > 0 && !placedOrderToken) {
        cartRestoreShown.current = true;
        toast({
          title: `🛒 You have ${activeCart.itemCount} item${activeCart.itemCount > 1 ? 's' : ''} in your cart`,
          description: "Ready to complete your order?",
          action: <button onClick={() => setCartOpen(true)} className="text-xs font-semibold underline">View Cart</button> as any,
        });
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [activeCart.itemCount]);

  // M17: '/' keyboard shortcut for search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // M3: Fly-to-cart handler
  const flyToCart = useCallback((e: React.MouseEvent, imgSrc?: string | null) => {
    const fromRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const toRect = cartBtnRef.current?.getBoundingClientRect();
    if (!toRect) return;
    setFlyAnim({
      x: fromRect.left + fromRect.width / 2,
      y: fromRect.top + fromRect.height / 2,
      src: imgSrc || '',
    });
    setCartBounce(true);
    setTimeout(() => { setFlyAnim(null); setCartBounce(false); }, 700);
  }, []);

  // M15: Confetti on first order
  const fireConfetti = useCallback(() => {
    if (localStorage.getItem('dd-ordered-before')) return;
    localStorage.setItem('dd-ordered-before', '1');
    confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#f97316','#eab308','#22c55e','#3b82f6'] });
  }, []);

  // M9: Fuzzy search helper
  const fuzzyMatch = useCallback((text: string, query: string): boolean => {
    const t = text.toLowerCase();
    const q = query.toLowerCase();
    if (t.includes(q)) return true;
    let ti = 0;
    for (let qi = 0; qi < q.length; qi++) {
      const idx = t.indexOf(q[qi], ti);
      if (idx === -1) return false;
      ti = idx + 1;
    }
    return true;
  }, []);

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

      {/* M3: Fly-to-cart overlay */}
      {flyAnim && (
        <div
          className="fly-to-cart-dot"
          style={{
            position: 'fixed',
            left: flyAnim.x - 20,
            top: flyAnim.y - 20,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: flyAnim.src ? `url(${flyAnim.src}) center/cover` : 'hsl(var(--primary))',
            border: '2px solid hsl(var(--primary))',
            zIndex: 9999,
            pointerEvents: 'none',
            animation: 'flyToCart 0.65s cubic-bezier(0.25,0.46,0.45,0.94) forwards',
            '--tx': `${(cartBtnRef.current?.getBoundingClientRect().left ?? 0) + 24 - flyAnim.x}px`,
            '--ty': `${(cartBtnRef.current?.getBoundingClientRect().top ?? 0) + 24 - flyAnim.y}px`,
          } as React.CSSProperties}
        />
      )}

      {/* M18: Offline banner */}
      {!isOnline && (
        <div className="w-full bg-amber-500 text-white text-xs font-medium text-center py-1.5 flex items-center justify-center gap-1.5">
          <WifiOff className="h-3.5 w-3.5" /> You're offline — showing cached menu. Cart is saved locally.
        </div>
      )}

      <header className="border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="w-full max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* Home button */}
          {slug && (
            <Link to={`/r/${slug}`} className="h-9 w-9 shrink-0 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="Restaurant Home">
              <Home className="h-4 w-4" />
            </Link>
          )}

          {/* Logo + name */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {restaurantQuery.data?.logo_url ? (
              <img src={restaurantQuery.data.logo_url} alt={`${restaurantQuery.data.name} logo`} className="h-10 w-10 rounded-md object-cover border shrink-0" loading="lazy" />
            ) : (
              <div className="h-10 w-10 rounded-md border bg-muted shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight truncate">{restaurantQuery.data?.name ?? "Menu"}</h1>
              {restaurantQuery.data?.description ? (
                <p className="text-xs text-muted-foreground line-clamp-1">{restaurantQuery.data.description}</p>
              ) : null}
            </div>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* M1: Grid/List toggle */}
            <button onClick={() => setView(viewMode === 'list' ? 'grid' : 'list')} className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors" title={viewMode === 'list' ? 'Grid view' : 'List view'}>
              {viewMode === 'list' ? <Grid2x2 className="h-4 w-4" /> : <List className="h-4 w-4" />}
            </button>
            {/* M11: My Orders */}
            {restaurantQuery.data?.slug && localStorage.getItem('dd-phone') && (
              <Link to={`/r/${restaurantQuery.data.slug}/account`} className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="My Orders">
                <ShoppingBag className="h-4 w-4" />
              </Link>
            )}
            {/* Account */}
            {restaurantQuery.data?.slug && !localStorage.getItem('dd-phone') && (
              <Link to={`/r/${restaurantQuery.data.slug}/account`} className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors" title="My Account">
                <User className="h-4 w-4" />
              </Link>
            )}
            {/* Dark mode */}
            <button onClick={() => setDarkMode(!darkMode)} className="h-9 w-9 rounded-full bg-card border shadow-sm flex items-center justify-center hover:scale-110 transition-transform" aria-label="Toggle dark mode">
              {darkMode ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </header>


      {/* M6: Prep/Delivery time */}
      {(() => {
        const s = restaurantQuery.data?.settings as any;
        const prep = s?.prep_time_minutes;
        const del = s?.delivery_time_minutes;
        if (!prep && !del) return null;
        return (
          <div className="w-full max-w-3xl mx-auto px-4 pt-2">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              {prep && <span className="flex items-center gap-1">🕐 Pickup ready in ~{prep} min</span>}
              {deliveryEnabled && del && <span className="flex items-center gap-1">🚚 Delivery ~{del} min</span>}
            </div>
          </div>
        );
      })()}

      {/* Order Type Selector */}
      <div className="w-full max-w-3xl mx-auto px-4 pt-3">
        {tableLabel ? (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground bg-muted rounded-lg px-4 py-2.5">
            <Store className="h-4 w-4 shrink-0" />
            <span>Dine-In · Table <strong className="text-foreground">{tableLabel}</strong></span>
            <span className="ml-auto text-xs text-muted-foreground/70 font-normal">Order mode locked</span>
          </div>
        ) : (
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            {([['pickup', 'Pickup', ShoppingBag], ...(deliveryEnabled ? [['delivery', 'Delivery', Truck]] : [])] as const).map(([type, label, Icon]) => (
              <button key={type} onClick={() => setOrderType(type as any)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition-colors ${orderType === type ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Offers Banner — only when coupons feature is enabled */}
      {couponsEnabled && menuCoupons && menuCoupons.length > 0 && (
        <div className="w-full max-w-3xl mx-auto px-4 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Tag className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold">Available Offers</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
            {menuCoupons.map((c: any) => (
              <div key={c.id} className="snap-start shrink-0 w-[200px] rounded-xl border bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 border-amber-200 dark:border-amber-800 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded-full">
                    {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value / 100} OFF`}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{c.description || 'Special Discount'}</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono font-bold bg-white dark:bg-background rounded px-1.5 py-0.5 border flex-1 truncate">{c.code}</code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(c.code); setCopiedOffer(c.code); setTimeout(() => setCopiedOffer(null), 1500); }}
                    className="h-6 w-6 rounded border flex items-center justify-center hover:bg-muted text-muted-foreground"
                  >
                    {copiedOffer === c.code ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      <div className="w-full max-w-3xl mx-auto px-4 py-6 pb-28">
        {/* M13: Skeleton loaders */}
        {loading ? (
          <div className={`gap-3 ${viewMode === 'grid' ? 'grid grid-cols-2' : 'space-y-3'}`}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`rounded-xl border bg-card animate-pulse ${viewMode === 'grid' ? 'p-3 space-y-2' : 'p-4 flex gap-4'}`}>
                {viewMode === 'grid' ? (
                  <><div className="h-32 rounded-lg bg-muted" /><div className="h-4 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-1/2" /><div className="h-8 bg-muted rounded" /></>
                ) : (
                  <><div className="h-20 w-20 rounded-md bg-muted shrink-0" /><div className="flex-1 space-y-2"><div className="h-4 bg-muted rounded w-3/4" /><div className="h-3 bg-muted rounded w-full" /><div className="h-8 bg-muted rounded w-20 ml-auto" /></div></>
                )}
              </div>
            ))}
          </div>
        ) : errorMessage ? (
          <Card className="p-6"><p className="text-sm text-destructive">{errorMessage}</p></Card>
        ) : categoriesWithItems.length === 0 ? (
          <Card className="p-6"><p className="text-sm text-muted-foreground">No active menu items yet.</p></Card>
        ) : (
          <div className="space-y-6">
            {/* Dietary Filters — always visible */}
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

            {categoriesWithItems.map((category) => {
              // M9: Fuzzy search filter
              let filteredItems = category.items;
              if (menuSearch.trim()) {
                filteredItems = filteredItems.filter((item: any) =>
                  fuzzyMatch(item.name || '', menuSearch) ||
                  fuzzyMatch(item.description || '', menuSearch)
                );
              }
              if (dietaryFilter !== 'all') {
                filteredItems = filteredItems.filter((item: any) => {
                  const ft = item.food_type || 'veg';
                  if (dietaryFilter === 'veg') return ft === 'veg';
                  if (dietaryFilter === 'nonveg') return ft === 'nonveg' || ft === 'egg';
                  return true;
                });
              }
              if (excludeAllergens.length > 0) {
                filteredItems = filteredItems.filter((item: any) => {
                  const ia: string[] = Array.isArray(item.allergens) ? item.allergens : [];
                  return !excludeAllergens.some(a => ia.includes(a));
                });
              }
              if (filteredItems.length === 0) return null;

              // M10: Availability countdown
              const cat = category as any;
              let countdownLabel: string | null = null;
              if (cat.available_from && cat.available_to) {
                const [eh, em] = cat.available_to.split(':').map(Number);
                const [nh, nm] = nowTime.split(':').map(Number);
                const minsLeft = (eh * 60 + em) - (nh * 60 + nm);
                if (minsLeft > 0 && minsLeft <= 60) countdownLabel = `⏳ Ends in ${minsLeft} min`;
                else if (minsLeft > 60) countdownLabel = `🕐 Available till ${cat.available_to}`;
              }

              return (
                <section key={category.id} id={`section-${category.id}`} data-category-id={category.id} aria-labelledby={`cat-${category.id}`}>
                  <div className="flex items-baseline justify-between gap-3 mb-4">
                    <div className="min-w-0">
                      <h2 id={`cat-${category.id}`} className="text-lg font-semibold tracking-tight">{category.name}</h2>
                      {category.description && <p className="mt-0.5 text-sm text-muted-foreground">{category.description}</p>}
                      {countdownLabel && <span className="text-xs text-amber-600 font-medium">{countdownLabel}</span>}
                    </div>
                  </div>

                  {/* M1: Grid or List layout */}
                  <div className={viewMode === 'grid' ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
                    {filteredItems.map((item) => {
                      const inCart = activeCart.items.find(i => i.menu_item_id === item.id);
                      const isNew = item.created_at && (Date.now() - new Date(item.created_at).getTime()) < 7 * 86400_000;
                      const isSpecial = (item as any).is_daily_special;
                      const isBestseller = popularIds.includes(item.id);
                      const hasVariants = !!(item as any).variants?.length || !!(item as any).addons?.length;

                      const handleAdd = (e: React.MouseEvent) => {
                        navigator.vibrate?.(30); // M14 haptic
                        flyToCart(e, item.image_url); // M3 fly animation
                        if (!hasVariants) {
                          activeCart.addItem({
                            menu_item_id: item.id,
                            name: item.name,
                            price_cents: item.price_cents,
                            addons: [],
                          });
                        } else {
                          setSelectedItem(item);
                          setItemDialogOpen(true);
                        }
                      };

                      // M16: Share dish
                      const handleShare = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        const url = `${window.location.origin}/r/${slug}/menu?item=${item.id}`;
                        if (navigator.share) navigator.share({ title: item.name, url });
                        else { navigator.clipboard.writeText(url); toast({ title: 'Link copied!' }); }
                      };

                      if (viewMode === 'grid') {
                        return (
                          <div key={item.id} className="relative rounded-xl border bg-card overflow-hidden flex flex-col shadow-sm hover:shadow-md transition-shadow">
                            {/* Badges */}
                            <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
                              {isBestseller && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-orange-500 text-white px-1.5 py-0.5 rounded-full">🔥 Bestseller</span>}
                              {isSpecial && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full">⚡ Special</span>}
                              {isNew && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold bg-green-500 text-white px-1.5 py-0.5 rounded-full">🆕 New</span>}
                            </div>
                            <button className="absolute top-2 right-2 z-10 h-6 w-6 rounded-full bg-black/40 flex items-center justify-center" onClick={handleShare}><Share2 className="h-3 w-3 text-white" /></button>
                            {(() => {
                              const images: string[] = [item.image_url, ...((item as any).additional_images || [])].filter(Boolean);
                              if (images.length > 0) {
                                return (
                                  <div className="relative">
                                    <img src={images[0]} alt={item.name} className="h-36 w-full object-cover cursor-pointer" onClick={() => setLightboxImg(images[0])} />
                                    {images.length > 1 && (
                                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                        {images.map((_: string, i: number) => (
                                          <span key={i} className="w-1.5 h-1.5 rounded-full bg-white/80 shadow-sm" />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return (
                                <div className="h-36 bg-muted flex items-center justify-center text-3xl">
                                  {item.food_type === 'nonveg' ? '🍗' : item.food_type === 'egg' ? '🥚' : '🥗'}
                                </div>
                              );
                            })()}
                            <div className="p-3 flex flex-col flex-1">
                              <div className="flex items-center gap-1 mb-1">
                                <span className={`h-2 w-2 rounded-sm shrink-0 ${item.food_type === 'nonveg' ? 'bg-red-500' : item.food_type === 'egg' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                                <p className="text-sm font-semibold truncate flex-1">{item.name}</p>
                              </div>
                              {item.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-1">{item.description}</p>}
                              {/* Tags */}
                              {item.tags && (item.tags as string[]).length > 0 && (
                                <div className="flex gap-1 flex-wrap mb-1">
                                  {(item.tags as string[]).slice(0, 2).map((t: string) => <span key={t} className="text-[9px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{t}</span>)}
                                </div>
                              )}
                              {/* Allergen chips */}
                              {item.allergens && (item.allergens as string[]).length > 0 && (
                                <div className="flex gap-1 flex-wrap mb-1">
                                  {(item.allergens as string[]).slice(0, 3).map((a: string) => <span key={a} className="text-[8px] bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full px-1 py-0.5">🛡️ {a}</span>)}
                                </div>
                              )}
                              <div className="mt-auto flex items-center justify-between gap-2">
                                <p className="text-sm font-bold">{formatMoney(item.price_cents, currencyCode)}</p>
                                {inCart ? (
                                  <div className="flex items-center gap-1">
                                    <button onClick={() => { navigator.vibrate?.(20); activeCart.decrement(inCart.cart_id); }} className="h-7 w-7 rounded-full border flex items-center justify-center text-sm font-bold hover:bg-muted"><Minus className="h-3 w-3" /></button>
                                    <span className="w-5 text-center text-sm font-semibold">{inCart.quantity}</span>
                                    <button onClick={handleAdd} className="h-7 w-7 rounded-full border flex items-center justify-center text-sm font-bold hover:bg-muted"><Plus className="h-3 w-3" /></button>
                                  </div>
                                ) : (
                                  <button onClick={handleAdd} className="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity">+ Add</button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      // List card
                      return (
                        <Card key={item.id} className="p-4">
                          <div className="flex gap-4">
                            <div className="relative shrink-0">
                              {item.image_url ? (
                                <div className="relative">
                                  <img src={item.image_url} alt={item.name} className="h-20 w-20 rounded-md object-cover border cursor-pointer hover:opacity-80 transition-opacity" loading="lazy" onClick={() => setLightboxImg(item.image_url)} />
                                  {((item as any).additional_images?.length || 0) > 0 && (
                                    <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[8px] font-bold px-1 rounded-tl">
                                      +{(item as any).additional_images.length}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                              {/* M5: Badges */}
                              {(isBestseller || isSpecial || isNew) && (
                                <div className="absolute -top-1 -left-1 flex flex-col gap-0.5">
                                  {isBestseller && <span className="text-[8px] font-bold bg-orange-500 text-white px-1 py-0.5 rounded">🔥</span>}
                                  {isSpecial && <span className="text-[8px] font-bold bg-amber-500 text-white px-1 py-0.5 rounded">⚡</span>}
                                  {isNew && <span className="text-[8px] font-bold bg-green-500 text-white px-1 py-0.5 rounded">🆕</span>}
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium truncate flex items-center gap-1.5">
                                    <span className={`inline-block h-2.5 w-2.5 rounded-sm shrink-0 border ${item.food_type === 'nonveg' ? 'bg-red-500 border-red-600' : item.food_type === 'egg' ? 'bg-yellow-500 border-yellow-600' : 'bg-green-500 border-green-600'}`} />
                                    {item.name}
                                    {isBestseller && <span className="text-xs text-orange-500 flex items-center gap-0.5"><Flame className="h-3 w-3" />Hot</span>}
                                    {isSpecial && <span className="text-xs text-amber-500 flex items-center gap-0.5"><Zap className="h-3 w-3" />Special</span>}
                                    {item.spice_level > 0 && <span className="text-xs">{'🌶️'.repeat(Math.min(item.spice_level, 3))}</span>}
                                  </p>
                                  {item.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{item.description}</p>}
                                  {item.tags && item.tags.length > 0 && (
                                    <div className="mt-1 flex gap-1 flex-wrap">
                                      {item.tags.slice(0, 3).map((t: string) => <span key={t} className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">{t}</span>)}
                                    </div>
                                  )}
                                  {/* Allergen info chips */}
                                  {item.allergens && (item.allergens as string[]).length > 0 && (
                                    <div className="mt-1 flex gap-1 flex-wrap">
                                      {(item.allergens as string[]).slice(0, 4).map((a: string) => <span key={a} className="text-[9px] bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-full px-1.5 py-0.5">🛡️ {a}</span>)}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-medium tabular-nums whitespace-nowrap">{formatMoney(item.price_cents, currencyCode)}</p>
                                  {/* M16: Share */}
                                  <button onClick={handleShare} className="mt-1 text-muted-foreground hover:text-primary transition-colors"><Share2 className="h-3.5 w-3.5" /></button>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center justify-end">
                                {/* M3: Inline qty OR Add button */}
                                {inCart ? (
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => { navigator.vibrate?.(20); activeCart.decrement(inCart.cart_id); }} className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"><Minus className="h-4 w-4" /></button>
                                    <span className="min-w-6 text-center font-semibold">{inCart.quantity}</span>
                                    <button onClick={handleAdd} className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"><Plus className="h-4 w-4" /></button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="secondary" onClick={handleAdd}>Add</Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
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
            ref={cartBtnRef}
            type="button"
            className={`fixed bottom-4 right-4 z-40 transition-transform duration-150 ${cartBounce ? 'scale-125' : 'scale-100'}`}
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

        <DrawerContent className="max-h-[85vh] flex flex-col">
          <DrawerHeader className="text-left shrink-0">
            <DrawerTitle>Cart</DrawerTitle>
          </DrawerHeader>

          <div className="px-4 pb-4 flex-1 overflow-y-auto min-h-0">
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
                <Card className="p-6 text-center space-y-3">
                  <div className="text-3xl">🎉</div>
                  <p className="font-semibold text-lg">Order Placed!</p>
                  <p className="font-mono text-xs text-muted-foreground break-all bg-muted rounded p-2">{placedOrderToken}</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <CopyButton value={placedOrderToken} label="Copy token" />
                    {trackUrl ? <CopyButton value={trackUrl} label="Copy tracking link" /> : null}
                    {placedOrderToken && (
                      <Link to={`/track?token=${encodeURIComponent(placedOrderToken)}`}>
                        <Button variant="secondary" size="sm">Track Order</Button>
                      </Link>
                    )}
                    {/* M12: WhatsApp deep link */}
                    {(() => {
                      const wp = (restaurantQuery.data?.settings as any)?.whatsapp_number;
                      if (!wp) return null;
                      const msg = encodeURIComponent(`My order token: ${placedOrderToken}`);
                      return (
                        <a href={`https://wa.me/${wp.replace(/\D/g,'')}?text=${msg}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="sm" className="gap-1.5 text-green-600 border-green-200">
                            <MessageCircle className="h-3.5 w-3.5" /> View on WhatsApp
                          </Button>
                        </a>
                      );
                    })()}
                  </div>
                  {checkoutError && <p className="text-sm text-destructive">{checkoutError}</p>}
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

          <DrawerFooter className="shrink-0 max-h-[50vh] overflow-y-auto border-t">
            {activeCart.items.length > 0 ? (
              <>
                {/* ═══ BILL / INVOICE ═══ */}
                <div className="rounded-lg border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm uppercase tracking-wider text-muted-foreground">Bill Summary</h3>
                    <span className="text-[10px] text-muted-foreground">{activeCart.itemCount} items</span>
                  </div>
                  <Separator />
                  {/* Itemized List */}
                  <div className="space-y-1.5">
                    {activeCart.items.map((line) => (
                      <div key={line.cart_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{line.quantity}×</span>
                          <span className="truncate">{line.name}</span>
                        </div>
                        <span className="tabular-nums font-medium shrink-0 ml-2">{formatMoney(line.price_cents * line.quantity, currencyCode)}</span>
                      </div>
                    ))}
                  </div>
                  <Separator className="border-dashed" />
                  {/* Subtotal */}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-medium tabular-nums">{formatMoney(activeCart.subtotalCents, currencyCode)}</span>
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
                {/* Tax, Charges, Discount, Total — inside bill card */}
                  {tipCents > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tip</span>
                      <span className="tabular-nums">{formatMoney(tipCents, currencyCode)}</span>
                    </div>
                  )}
                  {/* Primary Tax */}
                  {taxSettings.rate > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>{taxSettings.label} ({Math.round(taxSettings.rate * 100)}%)</span>
                      <span className="tabular-nums">{formatMoney(gstCents, currencyCode)}</span>
                    </div>
                  )}
                  {/* Additional Charges */}
                  {billChargeAmounts.map((charge, idx) => (
                    <div key={idx} className="flex justify-between text-sm text-muted-foreground">
                      <span>{charge.label} {billCharges[idx]?.type === 'percentage' ? `(${billCharges[idx].value}%)` : ''}</span>
                      <span className="tabular-nums">{formatMoney(charge.cents, currencyCode)}</span>
                    </div>
                  ))}
                  {/* Discount */}
                  {activeCart.discountCents > 0 && (
                    <div className="flex justify-between text-sm text-green-600 font-medium">
                      <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> Coupon Discount {activeCart.coupon?.code && <code className="text-[10px] bg-green-100 dark:bg-green-900/30 px-1 rounded">{activeCart.coupon.code}</code>}</span>
                      <span className="tabular-nums">−{formatMoney(activeCart.discountCents, currencyCode)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-base">Grand Total</span>
                    <span className="font-bold text-lg tabular-nums">{formatMoney(activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents, currencyCode)}</span>
                  </div>
                  {activeCart.discountCents > 0 && (
                    <p className="text-xs text-green-600 text-right font-medium">🎉 You save {formatMoney(activeCart.discountCents, currencyCode)}!</p>
                  )}

                  {/* ── Split Bill Calculator ── */}
                  <div className="border-t pt-3 mt-1">
                    <button
                      onClick={() => setShowSplitCalc(v => !v)}
                      className="flex items-center justify-between w-full text-sm text-muted-foreground hover:text-foreground transition-colors group"
                    >
                      <span className="flex items-center gap-1.5">
                        <Split className="h-3.5 w-3.5" />
                        Split Bill
                      </span>
                      <span className="text-xs text-primary group-hover:underline">
                        {showSplitCalc ? 'Hide' : 'Calculate'}
                      </span>
                    </button>

                    {showSplitCalc && (
                      <div className="mt-3 rounded-lg border bg-muted/40 p-3 space-y-3">
                        <p className="text-xs text-muted-foreground">How many people are splitting the bill?</p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setSplitPeople(p => Math.max(2, p - 1))}
                            className="h-8 w-8 rounded-full border flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="flex-1 text-center font-bold text-lg tabular-nums">{splitPeople}</span>
                          <button
                            onClick={() => setSplitPeople(p => Math.min(20, p + 1))}
                            className="h-8 w-8 rounded-full border flex items-center justify-center text-muted-foreground hover:bg-accent transition-colors"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" /> Per person
                          </span>
                          <span className="text-base font-bold text-primary tabular-nums">
                            {formatMoney(
                              Math.ceil((activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents) / splitPeople),
                              currencyCode
                            )}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground text-center">
                          Total {formatMoney(activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents, currencyCode)} ÷ {splitPeople} people
                        </p>
                      </div>
                    )}
                  </div>

                </div>

                {/* Order mode summary (read-only — selected via top-of-page selector) */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground border rounded-lg px-3 py-2 bg-muted/30">
                  {orderType === 'dine_in' && <><Store className="h-3.5 w-3.5" /><span>Dine-In · Table <strong>{tableLabel}</strong></span></>}
                  {orderType === 'pickup' && <><ShoppingBag className="h-3.5 w-3.5" /><span>Pickup Order</span></>}
                  {orderType === 'delivery' && <><Truck className="h-3.5 w-3.5" /><span>Delivery Order</span></>}
                </div>

                {/* Payment method selector */}
                {canUseOnlinePayments && (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/40">
                    <p className="text-xs text-muted-foreground font-medium">Select Payment Method</p>
                    
                    {/* Main Methods */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => { setPaymentMethod('cash'); setUpiApp(null); }}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === 'cash'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted bg-background text-muted-foreground hover:border-border'
                        }`}
                      >
                        <Banknote className="h-4 w-4" /> Cash
                      </button>
                      <button
                        type="button"
                        onClick={() => { setPaymentMethod('online'); setUpiApp(null); }}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border-2 p-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === 'online'
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-muted bg-background text-muted-foreground hover:border-border'
                        }`}
                      >
                        <CreditCard className="h-4 w-4" /> Card
                      </button>
                    </div>

                    {/* Branded UPI Methods */}
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Pay via UPI</p>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => { setPaymentMethod('upi'); setUpiApp('google_pay'); }}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 text-[10px] font-bold transition-all ${
                            paymentMethod === 'upi' && upiApp === 'google_pay'
                              ? 'border-[#4285F4] bg-[#4285F4]/10 text-[#4285F4]'
                              : 'border-muted bg-background text-muted-foreground hover:border-border'
                          }`}
                        >
                          <div className="h-5 w-5 rounded-full bg-[#4285F4] flex items-center justify-center text-white text-[8px]">G</div>
                          GPay
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPaymentMethod('upi'); setUpiApp('phonepe'); }}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 text-[10px] font-bold transition-all ${
                            paymentMethod === 'upi' && upiApp === 'phonepe'
                              ? 'border-[#5f259f] bg-[#5f259f]/10 text-[#5f259f]'
                              : 'border-muted bg-background text-muted-foreground hover:border-border'
                          }`}
                        >
                          <div className="h-5 w-5 rounded-full bg-[#5f259f] flex items-center justify-center text-white text-[8px]">P</div>
                          PhonePe
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPaymentMethod('upi'); setUpiApp('paytm'); }}
                          className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 p-2 text-[10px] font-bold transition-all ${
                            paymentMethod === 'upi' && upiApp === 'paytm'
                              ? 'border-[#00baf2] bg-[#00baf2]/10 text-[#00baf2]'
                              : 'border-muted bg-background text-muted-foreground hover:border-border'
                          }`}
                        >
                          <div className="h-5 w-5 rounded-full bg-[#00baf2] flex items-center justify-center text-white text-[8px]">Py</div>
                          Paytm
                        </button>
                      </div>
                    </div>

                    {paymentMethod === 'upi' && (
                      <div className="mt-1 p-2 rounded-md bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-center">
                        <p className="text-[10px] text-blue-700 dark:text-blue-300 font-medium italic">
                          Clicking "Place Order" will open your {upiApp === 'google_pay' ? 'Google Pay' : upiApp === 'phonepe' ? 'PhonePe' : 'Paytm'} app directly.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Customer Details */}
                <div className="border rounded-lg p-3 space-y-3 bg-muted/40">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    📱 {paymentMethod === 'upi' ? 'Customer Details (required for UPI)' : 'Get receipt on WhatsApp (optional)'}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name {paymentMethod === 'upi' && <span className="text-destructive">*</span>}</Label>
                      <Input
                        placeholder="Your name"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        className={`h-8 text-sm ${paymentMethod === 'upi' && !customerName.trim() ? 'border-destructive' : ''}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone {paymentMethod === 'upi' && <span className="text-destructive">*</span>}</Label>
                      <Input
                        placeholder="+91 98765 43210"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        type="tel"
                        className={`h-8 text-sm ${paymentMethod === 'upi' && (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 10) ? 'border-destructive' : ''}`}
                      />
                    </div>
                  </div>
                  {paymentMethod === 'upi' && (!customerName.trim() || !customerPhone.trim()) && (
                    <p className="text-[11px] text-destructive">Name and phone are required for UPI payment verification</p>
                  )}
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
                      maxLength={500}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm min-h-[60px] resize-none"
                    />
                  </div>
                )}

                {/* Loyalty Points */}
                {loyaltyFlagEnabled && loyaltyConfig && customerPhone && customerPhone.length >= 10 && (
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
                        ✓ You can redeem {loyaltyConfig.min_redeem_points} pts for {formatMoney(toCents(loyaltyConfig.min_redeem_points / loyaltyConfig.points_to_currency), currencyCode)} off!
                      </p>
                    )}
                  </div>
                )}

                {/* Coupon Code — only when coupons feature is enabled */}
                {couponsEnabled && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/40">
                  <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Have a coupon?
                  </p>
                  {activeCart.coupon ? (
                    <div className="flex items-center justify-between bg-green-50 dark:bg-green-950/20 rounded-md px-3 py-2 border border-green-200 dark:border-green-800">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-bold text-green-700 dark:text-green-300">{activeCart.coupon.code}</span>
                        <span className="text-xs text-green-600">(-{formatMoney(activeCart.discountCents, currencyCode)})</span>
                      </div>
                      <button onClick={() => { activeCart.removeCoupon(); setCouponInput(""); setCouponError(null); }} className="text-xs text-red-500 hover:text-red-700 font-medium">Remove</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter coupon code"
                        value={couponInput}
                        onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                        className="h-8 text-sm font-mono tracking-wider uppercase"
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 px-4 text-xs"
                        disabled={!couponInput || couponLoading}
                        onClick={async () => {
                          if (!couponInput || !restaurantQuery.data?.id) return;
                          setCouponLoading(true);
                          setCouponError(null);
                          try {
                            const { data, error } = await supabase.rpc('validate_coupon', {
                              _restaurant_id: restaurantQuery.data.id,
                              _coupon_code: couponInput,
                              _order_total_cents: activeCart.subtotalCents,
                            });
                            if (error) throw error;
                            const result = data?.[0] || data;
                            if (result?.valid) {
                              activeCart.applyCoupon({
                                code: couponInput,
                                discount_type: 'fixed',
                                discount_value: result.discount_cents,
                              });
                              toast({ title: "Coupon Applied!", description: `You save ${formatMoney(result.discount_cents, currencyCode)}` });
                            } else {
                              setCouponError(result?.message || 'Invalid coupon');
                            }
                          } catch (err: any) {
                            setCouponError(err.message || 'Could not validate coupon');
                          } finally {
                            setCouponLoading(false);
                          }
                        }}
                      >
                        {couponLoading ? '...' : 'Apply'}
                      </Button>
                    </div>
                  )}
                  {couponError && <p className="text-xs text-destructive">{couponError}</p>}
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
                    paymentMethod === 'upi' && canUseOnlinePayments ? `Pay ${formatMoney(activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents, currencyCode)} via UPI` :
                    paymentMethod === 'online' && canUseOnlinePayments ? `Pay ${formatMoney(activeCart.totalCents + gstCents + totalExtraChargesCents + tipCents, currencyCode)}` :
                    "Place Order"}
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
