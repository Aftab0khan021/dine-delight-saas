import { useCallback, useEffect, useMemo, useState } from "react";

export type CartItem = {
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  tableLabel?: string | null;
};

function storageKey(slug: string) {
  return `cart:${slug}`;
}

function safeParseCart(raw: string | null): CartState {
  if (!raw) return { items: [], tableLabel: null };
  try {
    const parsed = JSON.parse(raw) as Partial<CartState>;
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    return {
      items: items
        .map((i: any) => ({
          menu_item_id: String(i.menu_item_id ?? ""),
          name: String(i.name ?? ""),
          price_cents: Number(i.price_cents ?? 0),
          quantity: Math.max(0, Number(i.quantity ?? 0)),
        }))
        .filter((i) => i.menu_item_id && i.quantity > 0),
      tableLabel: parsed.tableLabel || null,
    };
  } catch {
    return { items: [], tableLabel: null };
  }
}

export function useRestaurantCart(restaurantSlug: string) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [tableLabel, setTableLabel] = useState<string | null>(null);

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
  }, [restaurantSlug]);

  // persist
  useEffect(() => {
    if (!restaurantSlug) return;
    const state: CartState = { items, tableLabel };
    localStorage.setItem(storageKey(restaurantSlug), JSON.stringify(state));
  }, [items, tableLabel, restaurantSlug]);

  const addItem = useCallback(
    (payload: { menu_item_id: string; name: string; price_cents: number }) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.menu_item_id === payload.menu_item_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
          return next;
        }
        return [...prev, { ...payload, quantity: 1 }];
      });
    },
    [],
  );

  const increment = useCallback((menu_item_id: string) => {
    setItems((prev) =>
      prev.map((i) => (i.menu_item_id === menu_item_id ? { ...i, quantity: i.quantity + 1 } : i)),
    );
  }, []);

  const decrement = useCallback((menu_item_id: string) => {
    setItems((prev) =>
      prev
        .map((i) => (i.menu_item_id === menu_item_id ? { ...i, quantity: i.quantity - 1 } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const removeItem = useCallback((menu_item_id: string) => {
    setItems((prev) => prev.filter((i) => i.menu_item_id !== menu_item_id));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    setTableLabel(null);
  }, []);

  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const subtotalCents = useMemo(
    () => items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0),
    [items],
  );

  return {
    items,
    tableLabel,
    setTableLabel,
    addItem,
    increment,
    decrement,
    removeItem,
    clear,
    itemCount,
    subtotalCents,
  };
}
