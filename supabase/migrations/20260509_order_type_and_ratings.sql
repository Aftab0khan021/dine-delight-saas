-- ============================================================
-- Order Type + Rating Columns
-- ============================================================

-- 1. Add order_type to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_type TEXT CHECK (order_type IN ('dine_in', 'pickup', 'delivery')) DEFAULT 'dine_in';

-- 1b. Add delivery_address for delivery orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_order_type
  ON public.orders(restaurant_id, order_type);

COMMENT ON COLUMN public.orders.order_type IS 'How the customer wants to receive their order: dine_in, pickup, or delivery';
COMMENT ON COLUMN public.orders.delivery_address IS 'Full delivery address for delivery orders';

-- 2. Add rating columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS review_text TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.rating IS '1-5 star rating from customer after order completion';
COMMENT ON COLUMN public.orders.review_text IS 'Optional text feedback from customer';
COMMENT ON COLUMN public.orders.reviewed_at IS 'When the customer submitted their rating';
