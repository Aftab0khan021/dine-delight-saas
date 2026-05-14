-- ═══════════════════════════════════════════════════════════════
-- Performance Optimization Migration
-- Adds indexes, pre-computed rating, and a public menu RPC
-- Safe to run on production — all operations are idempotent
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. SCHEMA: Per-item time scheduling
-- ─────────────────────────────────────────────────────────────
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS available_from TIME;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS available_to TIME;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS preparation_time_min INTEGER;

-- ─────────────────────────────────────────────────────────────
-- 1. PERFORMANCE INDEXES
-- ─────────────────────────────────────────────────────────────

-- Orders: Every admin panel page queries by restaurant_id + date
-- Used by: Dashboard, Orders page, Analytics, Kitchen Display
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_placed
  ON orders(restaurant_id, placed_at DESC);

-- Orders: Kitchen/orders filtered by active statuses
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status
  ON orders(restaurant_id, status)
  WHERE status IN ('pending', 'in_progress', 'ready');

-- Order Items: Fetched in bulk by order_id (prevents N+1)
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

-- Menu Items: Fetched on every public page load (active items only)
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_active
  ON menu_items(restaurant_id, sort_order)
  WHERE is_active = true;

-- Reservations: Filtered by restaurant + date range
CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date
  ON reservations(restaurant_id, reservation_date, reservation_time);

-- Coupons: Looked up by code + restaurant during checkout
CREATE INDEX IF NOT EXISTS idx_coupons_restaurant_code
  ON coupons(restaurant_id, code);

-- Categories: Fetched on every menu page load
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_active
  ON categories(restaurant_id, sort_order)
  WHERE is_active = true;

-- Ingredients: Inventory page loads all for a restaurant
CREATE INDEX IF NOT EXISTS idx_ingredients_restaurant
  ON ingredients(restaurant_id, name);

-- Subscriptions: Feature access view joins on active subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_restaurant_active
  ON subscriptions(restaurant_id)
  WHERE status = 'active';

-- Orders: Rating queries for restaurant profile
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_rating
  ON orders(restaurant_id)
  WHERE rating IS NOT NULL;

-- Restaurants: Slug lookup for public pages
CREATE INDEX IF NOT EXISTS idx_restaurants_slug
  ON restaurants(slug);

-- Orders: Customer order history lookup (CustomerDashboard + reorder)
CREATE INDEX IF NOT EXISTS idx_orders_customer_phone
  ON orders(customer_phone, restaurant_id, placed_at DESC);

-- Customer Reviews: Restaurant profile reviews query
CREATE INDEX IF NOT EXISTS idx_customer_reviews_restaurant
  ON customer_reviews(restaurant_id, is_approved, created_at DESC);

-- Reservations: Customer phone lookup for tracking
CREATE INDEX IF NOT EXISTS idx_reservations_customer_phone
  ON reservations(customer_phone, restaurant_id);

-- ─── ADMIN-SIDE INDEXES ──────────────────────────────────────

-- User Roles: Looked up on EVERY admin page load (restaurant-context.tsx)
CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON user_roles(user_id, role);

-- Activity Logs: Admin audit log page + auto-logging on mutations
CREATE INDEX IF NOT EXISTS idx_activity_logs_restaurant
  ON activity_logs(restaurant_id, created_at DESC);

-- Staff Categories: Loaded on every staff login
CREATE INDEX IF NOT EXISTS idx_staff_categories_restaurant
  ON staff_categories(restaurant_id);

-- Customer Profiles: Phone lookup for customer dashboard
CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone
  ON customer_profiles(phone);

-- Menu Item Variants: Loaded for each item dialog open
CREATE INDEX IF NOT EXISTS idx_menu_item_variants_item
  ON menu_item_variants(menu_item_id)
  WHERE is_active = true;

-- Menu Item Addons: Loaded for each item dialog open
CREATE INDEX IF NOT EXISTS idx_menu_item_addons_item
  ON menu_item_addons(menu_item_id)
  WHERE is_active = true;


-- ─────────────────────────────────────────────────────────────
-- 2. PRE-COMPUTED AVERAGE RATING
-- Avoids scanning thousands of order rows on every profile view
-- ─────────────────────────────────────────────────────────────

-- Add rating columns to restaurants (safe — IF NOT EXISTS is handled by DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'avg_rating'
  ) THEN
    ALTER TABLE restaurants ADD COLUMN avg_rating NUMERIC(3,1);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'restaurants' AND column_name = 'rating_count'
  ) THEN
    ALTER TABLE restaurants ADD COLUMN rating_count INTEGER DEFAULT 0;
  END IF;
END $$;

-- Backfill existing ratings
UPDATE restaurants r SET
  avg_rating = sub.avg_r,
  rating_count = sub.cnt
FROM (
  SELECT restaurant_id,
         ROUND(AVG(rating)::numeric, 1) AS avg_r,
         COUNT(*) AS cnt
  FROM orders
  WHERE rating IS NOT NULL
  GROUP BY restaurant_id
) sub
WHERE r.id = sub.restaurant_id;

-- Trigger function to auto-update on new/changed ratings
CREATE OR REPLACE FUNCTION update_restaurant_rating()
RETURNS TRIGGER AS $$
BEGIN
  -- Only recalculate if rating was actually set or changed
  IF NEW.rating IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.rating IS DISTINCT FROM NEW.rating) THEN
    UPDATE restaurants SET
      avg_rating = (
        SELECT ROUND(AVG(rating)::numeric, 1)
        FROM orders
        WHERE restaurant_id = NEW.restaurant_id AND rating IS NOT NULL
      ),
      rating_count = (
        SELECT COUNT(*)
        FROM orders
        WHERE restaurant_id = NEW.restaurant_id AND rating IS NOT NULL
      )
    WHERE id = NEW.restaurant_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first to make idempotent)
DROP TRIGGER IF EXISTS trg_update_restaurant_rating ON orders;
CREATE TRIGGER trg_update_restaurant_rating
  AFTER INSERT OR UPDATE OF rating ON orders
  FOR EACH ROW EXECUTE FUNCTION update_restaurant_rating();


-- ─────────────────────────────────────────────────────────────
-- 3. PUBLIC MENU RPC
-- Single database round-trip for the entire public menu page
-- Replaces 5 separate queries with 1
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_public_menu(p_slug TEXT)
RETURNS JSON AS $$
DECLARE
  r_id UUID;
  result JSON;
BEGIN
  -- Get restaurant ID from slug
  SELECT id INTO r_id FROM restaurants WHERE slug = p_slug;
  IF r_id IS NULL THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  SELECT json_build_object(
    'restaurant', (
      SELECT row_to_json(r) FROM (
        SELECT id, name, slug, logo_url, description, settings,
               is_accepting_orders, is_holiday_mode, holiday_mode_message,
               operating_hours, currency_code, cuisine_types,
               online_payments_enabled, avg_rating, rating_count
        FROM restaurants WHERE id = r_id
      ) r
    ),
    'categories', (
      SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.sort_order), '[]'::json)
      FROM (
        SELECT id, name, description, sort_order, available_from, available_to
        FROM categories
        WHERE restaurant_id = r_id AND is_active = true AND deleted_at IS NULL
      ) c
    ),
    'items', (
      SELECT COALESCE(json_agg(row_to_json(i) ORDER BY i.sort_order), '[]'::json)
      FROM (
        SELECT id, name, description, price_cents, image_url, category_id,
               food_type, is_active, sort_order, is_daily_special,
               available_from, available_to, allergens, spice_level,
               preparation_time_min, additional_images
        FROM menu_items
        WHERE restaurant_id = r_id AND is_active = true AND deleted_at IS NULL
      ) i
    ),
    'coupons', (
      SELECT COALESCE(json_agg(row_to_json(cp)), '[]'::json)
      FROM (
        SELECT id, code, description, discount_type, discount_value,
               min_order_cents, max_discount_cents, expires_at,
               usage_count, usage_limit
        FROM coupons
        WHERE restaurant_id = r_id
          AND is_active = true
          AND (expires_at IS NULL OR expires_at >= NOW())
          AND (usage_limit IS NULL OR usage_count < usage_limit)
        ORDER BY discount_value DESC
        LIMIT 6
      ) cp
    ),
    'features', (
      SELECT COALESCE(json_agg(json_build_object(
        'feature_key', feature_key,
        'is_enabled', is_enabled
      )), '[]'::json)
      FROM restaurant_feature_access
      WHERE restaurant_id = r_id
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
