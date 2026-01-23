import { useCallback, useEffect, useMemo, useState } from "react";

export type CartAddon = {
  id: string;
  name: string;
  price_cents: number;
};

export type CartItem = {
  cart_id: string; // Unique ID for this cart entry (combo of item+variant+addons)
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
  variant_id?: string;
  variant_name?: string;
  addons: CartAddon[];
  notes?: string;
};

type CartState = {
  items: CartItem[];
  tableLabel?: string | null;
  couponCode?: string | null; // Placeholder for future
};

function storageKey(slug: string) {
  return `cart:${slug}:v2`; // Bump version to clear old carts
}

function generateCartId(item: Omit<CartItem, "cart_id" | "quantity">) {
  const parts = [
    item.menu_item_id,
    item.variant_id || "novar",
    ...item.addons.map(a => a.id).sort(),
    (item.notes || "").trim()
  ];
  return parts.join("|");
}

function safeParseCart(raw: string | null): CartState {
  if (!raw) return { items: [], tableLabel: null };
  try {
    const parsed = JSON.parse(raw) as Partial<CartState>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items
        .map((i: any) => ({
          cart_id: i.cart_id || generateCartId(i),
          menu_item_id: String(i.menu_item_id ?? ""),
          name: String(i.name ?? ""),
          price_cents: Number(i.price_cents ?? 0),
          quantity: Math.max(0, Number(i.quantity ?? 0)),
          variant_id: i.variant_id,
          variant_name: i.variant_name,
          addons: Array.isArray(i.addons) ? i.addons : [],
          notes: i.notes
        }))
        .filter((i) => i.menu_item_id && i.quantity > 0),
      tableLabel: parsed.tableLabel || null,
      couponCode: parsed.couponCode || null
    };
  } catch {
    return { items: [], tableLabel: null };
  }
}

export function useRestaurantCart(restaurantSlug: string) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [tableLabel, setTableLabel] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState<string | null>(null);

  // load when slug changes
  useEffect(() => {
    if (!restaurantSlug) {
      setItems([]);
      setTableLabel(null);
      return;
    }
    const saved = safeParseCart(localStorage.getItem(storageKey(restaurantSlug)));
    setItems(saved.items);
    if (saved.tableLabel) setTableLabel(saved.tableLabel);
    if (saved.couponCode) setCouponCode(saved.couponCode);
  }, [restaurantSlug]);

  // persist
  useEffect(() => {
    if (!restaurantSlug) return;
    const state: CartState = { items, tableLabel, couponCode };
    localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(state));
  }, [items, tableLabel, couponCode, restaurantSlug]);

  const addItem = useCallback(
    (payload: Omit<CartItem, "cart_id" | "quantity"> & { quantity?: number }) => {
      setItems((prev) => {
        const id = generateCartId(payload);
        const existingIdx = prev.findIndex((i) => i.cart_id === id);

        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = {
            ...next[existingIdx],
            quantity: next[existingIdx].quantity + (payload.quantity || 1)
          };
          return next;
        }

        return [...prev, { ...payload, cart_id: id, quantity: payload.quantity || 1 }];
      });
    },
    [],
  );

  const increment = useCallback((cart_id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.cart_id === cart_id ? { ...i, quantity: i.quantity + 1 } : i)),
    );
  }, []);

  const decrement = useCallback((cart_id: string) => {
    setItems((prev) =>
      prev
        .map((i) => (i.cart_id === cart_id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((cart_id: string) => {
    setItems((prev) => prev.filter((i) => i.cart_id !== cart_id));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setTableLabel(null);
    setCouponCode(null);
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  // Calculate subtotal including variant price overrides and addons
  const subtotalCents = useMemo(
    () => items.reduce((sum, i) => {
      // NOTE: i.price_cents should already be the final unit price (variant or base + addons)
      // But let's act robustly. 
      // Theoretically, the 'price_cents' passed to addItem should be the calculated unit price.
      return sum + i.price_cents * i.quantity;
    }, 0),
    [items],
  );

  // Coupon Logic
  const [coupon, setCoupon] = useState<any | null>(null);

  const applyCoupon = useCallback((couponData: any) => {
    setCoupon(couponData);
    setCouponCode(couponData.code);
  }, []);

  const removeCoupon = useCallback(() => {
    setCoupon(null);
    setCouponCode(null);
  }, []);

  const discountCents = useMemo(() => {
    if (!coupon) return 0;

    // Validate min order
    if (coupon.min_order_cents && subtotalCents < coupon.min_order_cents) {
      return 0;
    }

    if (coupon.discount_type === 'percentage') {
      let discount = Math.round((subtotalCents * coupon.discount_value) / 100);
      if (coupon.max_discount_cents) {
        discount = Math.min(discount, coupon.max_discount_cents);
      }
      return discount;
    } else if (coupon.discount_type === 'fixed') {
      return Math.min(coupon.discount_value, subtotalCents);
    }
    return 0;
  }, [coupon, subtotalCents]);

  const totalCents = Math.max(0, subtotalCents - discountCents);

  return {
    items,
    tableLabel,
    setTableLabel,
    couponCode,
    setCouponCode,
    coupon,        // [NEW]
    applyCoupon,   // [NEW]
    removeCoupon,  // [NEW]
    addItem,
    increment,
    decrement,
    removeItem,
    clear,
    itemCount,
    subtotalCents,
    discountCents, // [NEW]
    totalCents     // [NEW]
  };
}
