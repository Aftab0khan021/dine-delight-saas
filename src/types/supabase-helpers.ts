// ─── Extended order type for dashboard/kitchen queries ───────────────────────
// The Supabase generated types don't include computed/join fields from .select().
// These interfaces extend them for type-safe access without `as any`.

export interface OrderWithDetails {
  id: string;
  status: string;
  total_cents: number;
  subtotal_cents?: number;
  tax_cents?: number;
  tip_cents?: number;
  discount_cents?: number;
  placed_at: string;
  payment_method?: string;
  order_type?: string;
  order_token?: string;
  table_label?: string | null;
  customer_phone?: string | null;
  customer_name?: string | null;
  delivery_address?: string | null;
  rating?: number | null;
  review_text?: string | null;
  reviewed_at?: string | null;
  ip_address?: string | null;
  currency_code?: string;
  coupon_code?: string | null;
  bill_breakdown?: Record<string, unknown>;
  restaurant_id?: string;
  created_at?: string;
  order_items?: OrderItemDetail[];
  restaurants?: { name?: string } | null;
}

export interface OrderItemDetail {
  id?: string;
  name_snapshot: string;
  quantity: number;
  unit_price_cents?: number;
  line_total_cents: number;
  menu_item_id?: string;
  variant_id?: string | null;
  addons?: unknown[];
  notes?: string | null;
}

// ─── Extended menu item type for public menu page ────────────────────────────

export interface MenuItemExtended {
  id: string;
  name: string;
  description?: string | null;
  price_cents: number;
  image_url?: string | null;
  additional_images?: string[];
  category_id?: string | null;
  food_type?: string | null;
  is_active?: boolean;
  is_sold_out?: boolean;
  is_daily_special?: boolean;
  spice_level?: number;
  tags?: string[];
  sort_order?: number;
  variants?: { id: string; name: string; price_cents: number; is_active: boolean; is_default?: boolean }[];
  addons?: { id: string; name: string; price_cents: number; is_active: boolean }[];
}

// ─── Extended restaurant type for public pages ───────────────────────────────

export interface RestaurantPublic {
  id: string;
  name: string;
  slug?: string;
  logo_url?: string | null;
  banner_url?: string | null;
  description?: string | null;
  currency_code?: string;
  is_accepting_orders?: boolean;
  cuisine_types?: string[];
  online_payments_enabled?: boolean;
  max_variants_per_item?: number;
  settings?: Record<string, unknown> | null;
}

// ─── Supabase realtime payload helper ────────────────────────────────────────

export interface RealtimePayload<T = Record<string, unknown>> {
  new: T;
  old: T;
  eventType: "INSERT" | "UPDATE" | "DELETE";
}
