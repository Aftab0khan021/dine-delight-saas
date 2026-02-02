CREATE OR REPLACE FUNCTION redeem_coupon(
  p_coupon_code text,
  p_restaurant_id uuid,
  p_order_total_cents integer
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_coupon record;
  v_discount_cents integer := 0;
  v_new_usage_count integer;
BEGIN
  -- 1. Lock the coupon row for update to prevent race conditions
  SELECT * INTO v_coupon
  FROM coupons
  WHERE code = p_coupon_code
    AND restaurant_id = p_restaurant_id
    AND is_active = true
  FOR UPDATE; 

  -- 2. Validate
  IF v_coupon IS NULL THEN
    RETURN json_build_object('valid', false, 'error', 'Invalid coupon');
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RETURN json_build_object('valid', false, 'error', 'Coupon expired');
  END IF;

  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN
    RETURN json_build_object('valid', false, 'error', 'Usage limit reached');
  END IF;

  IF v_coupon.min_order_cents IS NOT NULL AND p_order_total_cents < v_coupon.min_order_cents THEN
    RETURN json_build_object('valid', false, 'error', 'Minimum order amount not met');
  END IF;

  -- 3. Calculate Discount
  IF v_coupon.discount_type = 'fixed' THEN
    v_discount_cents := LEAST(v_coupon.discount_value, p_order_total_cents);
  ELSIF v_coupon.discount_type = 'percentage' THEN
    v_discount_cents := ROUND((p_order_total_cents * v_coupon.discount_value) / 100);
    IF v_coupon.max_discount_cents IS NOT NULL THEN
      v_discount_cents := LEAST(v_discount_cents, v_coupon.max_discount_cents);
    END IF;
  END IF;

  -- 4. Increment Usage
  UPDATE coupons
  SET usage_count = coalesce(usage_count, 0) + 1
  WHERE id = v_coupon.id
  RETURNING usage_count INTO v_new_usage_count;

  -- 5. Return Success
  RETURN json_build_object(
    'valid', true,
    'discount_cents', v_discount_cents,
    'coupon_id', v_coupon.id,
    'coupon_code', v_coupon.code,
    'discount_type', v_coupon.discount_type,
    'usage_count', v_new_usage_count
  );
END;
$$;
