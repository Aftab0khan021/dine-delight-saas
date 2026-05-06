-- =============================================================
-- Tier B Migration: order_reviews, customer_profiles, loyalty,
--                   referrals, otp_verifications
-- Run this in Supabase SQL Editor
-- =============================================================

-- 1. Order Reviews
CREATE TABLE IF NOT EXISTS order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id) ON DELETE CASCADE,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_phone text,
  rating int CHECK (rating >= 1 AND rating <= 5) NOT NULL,
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can insert reviews" ON order_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read reviews" ON order_reviews FOR SELECT USING (true);
CREATE INDEX IF NOT EXISTS idx_order_reviews_restaurant ON order_reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_order_reviews_order ON order_reviews(order_id);

-- 2. Customer Profiles
CREATE TABLE IF NOT EXISTS customer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  name text,
  email text,
  birthday date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE customer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can manage profiles" ON customer_profiles FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_customer_profiles_phone ON customer_profiles(phone);

-- 3. Loyalty Points
CREATE TABLE IF NOT EXISTS loyalty_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  points int DEFAULT 0,
  lifetime_points int DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(customer_phone, restaurant_id)
);
ALTER TABLE loyalty_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read points" ON loyalty_points FOR SELECT USING (true);
CREATE POLICY "System can manage points" ON loyalty_points FOR ALL USING (true) WITH CHECK (true);

-- 4. Loyalty Transactions
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone text NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id),
  points_change int NOT NULL,
  reason text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read own txns" ON loyalty_transactions FOR SELECT USING (true);
CREATE POLICY "System can insert txns" ON loyalty_transactions FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_loyalty_txns_phone ON loyalty_transactions(customer_phone, restaurant_id);

-- 5. Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
  referrer_phone text NOT NULL,
  referee_phone text NOT NULL,
  referrer_reward_cents int DEFAULT 0,
  referee_reward_cents int DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can insert referrals" ON referrals FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can read referrals" ON referrals FOR SELECT USING (true);

-- 6. OTP Verifications
CREATE TABLE IF NOT EXISTS otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  otp_code text NOT NULL,
  restaurant_id uuid REFERENCES restaurants(id),
  channel text DEFAULT 'sms',
  verified boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE otp_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "System manage OTP" ON otp_verifications FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_verifications(phone, otp_code);

-- Auto-cleanup expired OTPs (older than 10 min)
-- You can schedule this via pg_cron or run manually
-- DELETE FROM otp_verifications WHERE expires_at < now();
