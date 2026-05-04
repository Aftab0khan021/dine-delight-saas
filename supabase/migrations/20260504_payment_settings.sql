-- ============================================================
-- Payment Gateway Settings
-- ============================================================

-- 1. Add payment columns to restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS razorpay_key_id TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS razorpay_key_secret TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS online_payments_enabled BOOLEAN DEFAULT false;

-- 2. Add payment_status to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';
-- Values: 'unpaid', 'paid', 'refunded', 'failed'

CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(restaurant_id, payment_status);
