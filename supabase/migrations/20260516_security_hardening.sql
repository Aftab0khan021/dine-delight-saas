-- =============================================================================
-- Security Hardening Batch — 2026-05-16
-- Fixes: C1, C2, H2, H5
-- Every change is backward-compatible — no edge function or app flow is broken.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- C1 — customer_profiles: Remove anon UPDATE (most dangerous, not needed)
--      Anon SELECT + INSERT kept — needed for OTP customer dashboard lookups.
--      All profile UPDATES happen via service-role edge functions.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can update own profile" ON customer_profiles;

-- Tighten anon INSERT: require phone to be non-null (prevents blank-row spam)
DROP POLICY IF EXISTS "Anon can insert profile" ON customer_profiles;
CREATE POLICY "Anon can insert profile"
  ON customer_profiles FOR INSERT
  WITH CHECK (auth.role() = 'anon' AND phone IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- C2 — order_reviews: Require the submitted order_id to belong to a real order
--      This prevents anyone from inserting reviews for non-existent orders.
--      The UNIQUE index on order_id (already exists) limits 1 review per order.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can insert one review per order" ON order_reviews;
CREATE POLICY "Public can insert one review per order"
  ON order_reviews FOR INSERT
  WITH CHECK (
    -- order_id must refer to a real order that exists in the orders table
    EXISTS (
      SELECT 1 FROM orders o
      WHERE o.id = order_reviews.order_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- H2 — loyalty_points / loyalty_transactions: Restrict world-readable SELECT
--      Only authenticated restaurant staff and service role can read.
--      Customers access their own loyalty data via the order-lookup edge fn.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read points"        ON loyalty_points;
DROP POLICY IF EXISTS "Anyone can read transactions"  ON loyalty_transactions;

-- Authenticated users (admins) can read points for their own restaurant
CREATE POLICY "Authenticated can read points"
  ON loyalty_points FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.restaurant_id = loyalty_points.restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

-- Service role (edge functions) can read all loyalty data
CREATE POLICY "Service role reads points"
  ON loyalty_points FOR SELECT
  USING (auth.role() = 'service_role');

-- Same for loyalty_transactions
CREATE POLICY "Authenticated can read transactions"
  ON loyalty_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.restaurant_id = loyalty_transactions.restaurant_id
    )
    OR EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
    )
  );

CREATE POLICY "Service role reads transactions"
  ON loyalty_transactions FOR SELECT
  USING (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────────────────────
-- H5 — orders / order_items: Remove anon INSERT policies
--      All order placement goes through the place-order edge function which
--      uses the SERVICE ROLE key and therefore bypasses RLS entirely.
--      Anon INSERT is not needed and allows bypassing all edge fn validations.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public users can insert orders"       ON public.orders;
DROP POLICY IF EXISTS "orders_public_insert_pending"         ON public.orders;
DROP POLICY IF EXISTS "Public users can insert order items"  ON public.order_items;

-- Re-create a restrictive INSERT only for authenticated staff (QuickOrder page)
-- Staff orders still go through the edge function (via_staff=true) with JWT auth.
-- This policy is a safety net only — the edge function remains the enforced path.
CREATE POLICY "Authenticated staff can insert orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    status = 'pending'
    AND restaurant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.restaurant_id = orders.restaurant_id
    )
  );

CREATE POLICY "Authenticated staff can insert order items"
  ON public.order_items FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.restaurant_id = order_items.restaurant_id
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- H6 helper — decrement_coupon_usage: Atomic safe decrement for rollback
--      Called by place-order edge function when order insertion fails after
--      the redeem_coupon RPC has already incremented usage_count.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION decrement_coupon_usage(p_coupon_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE coupons
  SET usage_count = GREATEST(0, COALESCE(usage_count, 1) - 1)
  WHERE id = p_coupon_id;
$$;

COMMENT ON FUNCTION decrement_coupon_usage IS
  'Safely decrements coupon usage_count by 1 (floor 0). Called on order failure rollback.';
