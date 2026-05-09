-- Customer Reviews Table
-- Reviews appear immediately (is_approved = true by default)
-- Admin can hide/show via the is_approved flag

CREATE TABLE IF NOT EXISTS customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  customer_name text NOT NULL,
  customer_phone text,
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text text,
  is_approved boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_reviews_restaurant
  ON customer_reviews (restaurant_id, is_approved, created_at DESC);

ALTER TABLE customer_reviews ENABLE ROW LEVEL SECURITY;

-- Public can read approved reviews
CREATE POLICY "Public read approved reviews"
  ON customer_reviews FOR SELECT
  USING (is_approved = true);

-- Anyone can submit a review
CREATE POLICY "Anyone can insert a review"
  ON customer_reviews FOR INSERT
  WITH CHECK (true);

-- Only restaurant admin can update (approve/hide)
CREATE POLICY "Admin can update reviews"
  ON customer_reviews FOR UPDATE
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_roles
      WHERE user_id = auth.uid()
      AND role = 'restaurant_admin'::app_role
    )
  );
