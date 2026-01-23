-- ============================================================
-- Phase 1: Discount System (Coupons & Manual Discounts)
-- Migration: Add coupon management and discount tracking
-- ============================================================

-- Discount coupons table
CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value INTEGER NOT NULL,
  min_order_cents INTEGER DEFAULT 0,
  max_discount_cents INTEGER,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT coupon_discount_value_positive CHECK (discount_value > 0),
  CONSTRAINT coupon_min_order_nonnegative CHECK (min_order_cents >= 0),
  CONSTRAINT coupon_code_nonempty CHECK (length(trim(code)) > 0),
  CONSTRAINT coupon_percentage_valid CHECK (
    discount_type != 'percentage' OR (discount_value > 0 AND discount_value <= 100)
  )
);

-- Unique code per restaurant (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS coupons_unique_code_per_restaurant 
ON public.coupons (restaurant_id, UPPER(code)) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS coupons_restaurant_active_idx 
ON public.coupons (restaurant_id, is_active, expires_at);

CREATE INDEX IF NOT EXISTS coupons_code_lookup_idx 
ON public.coupons (restaurant_id, UPPER(code)) WHERE is_active = true;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_coupons_updated_at ON public.coupons;
CREATE TRIGGER tr_coupons_updated_at 
BEFORE UPDATE ON public.coupons 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies (all restaurant admins can manage coupons)
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupons_select_access" ON public.coupons;
CREATE POLICY "coupons_select_access" 
ON public.coupons FOR SELECT TO authenticated 
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "coupons_write_admin" ON public.coupons;
CREATE POLICY "coupons_write_admin" 
ON public.coupons FOR ALL TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id)) 
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- ============================================================
-- Update orders table for discount and payment tracking
-- ============================================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS coupon_code TEXT,
ADD COLUMN IF NOT EXISTS discount_cents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount_type TEXT CHECK (discount_type IN ('coupon', 'manual', NULL)),
ADD COLUMN IF NOT EXISTS discount_reason TEXT,
ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'upi', 'card', 'online', NULL));

-- Update total calculation constraint to include discount
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_money_nonnegative;
ALTER TABLE public.orders ADD CONSTRAINT orders_money_nonnegative 
CHECK (
  subtotal_cents >= 0 AND 
  tax_cents >= 0 AND 
  tip_cents >= 0 AND 
  total_cents >= 0 AND 
  discount_cents >= 0
);

CREATE INDEX IF NOT EXISTS orders_coupon_idx 
ON public.orders (coupon_id) WHERE coupon_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_payment_method_idx 
ON public.orders (restaurant_id, payment_method, created_at DESC) WHERE payment_method IS NOT NULL;

-- Function to validate and apply coupon
CREATE OR REPLACE FUNCTION public.validate_coupon(
  _restaurant_id UUID,
  _coupon_code TEXT,
  _order_total_cents INTEGER
)
RETURNS TABLE (
  valid BOOLEAN,
  coupon_id UUID,
  discount_cents INTEGER,
  message TEXT
) AS $$
DECLARE
  v_coupon RECORD;
  v_discount INTEGER;
BEGIN
  -- Find active coupon
  SELECT * INTO v_coupon
  FROM public.coupons
  WHERE restaurant_id = _restaurant_id
    AND UPPER(code) = UPPER(_coupon_code)
    AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (expires_at IS NULL OR expires_at >= now())
    AND (usage_limit IS NULL OR usage_count < usage_limit);

  -- Coupon not found or invalid
  IF v_coupon.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'Invalid or expired coupon code';
    RETURN;
  END IF;

  -- Check minimum order value
  IF _order_total_cents < v_coupon.min_order_cents THEN
    RETURN QUERY SELECT 
      false, 
      NULL::UUID, 
      0, 
      format('Minimum order value is %s', (v_coupon.min_order_cents::FLOAT / 100)::TEXT);
    RETURN;
  END IF;

  -- Calculate discount
  IF v_coupon.discount_type = 'percentage' THEN
    v_discount := (_order_total_cents * v_coupon.discount_value / 100)::INTEGER;
    -- Apply max discount cap if set
    IF v_coupon.max_discount_cents IS NOT NULL AND v_discount > v_coupon.max_discount_cents THEN
      v_discount := v_coupon.max_discount_cents;
    END IF;
  ELSE
    v_discount := v_coupon.discount_value;
  END IF;

  -- Ensure discount doesn't exceed order total
  IF v_discount > _order_total_cents THEN
    v_discount := _order_total_cents;
  END IF;

  RETURN QUERY SELECT true, v_coupon.id, v_discount, 'Coupon applied successfully';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment coupon usage count
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_coupon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE public.coupons
  SET usage_count = usage_count + 1
  WHERE id = _coupon_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.coupons IS 'Discount coupons for orders';
COMMENT ON COLUMN public.orders.coupon_id IS 'Applied coupon reference';
COMMENT ON COLUMN public.orders.coupon_code IS 'Snapshot of coupon code at order time';
COMMENT ON COLUMN public.orders.discount_cents IS 'Total discount amount in cents';
COMMENT ON COLUMN public.orders.discount_type IS 'Type of discount applied (coupon or manual)';
COMMENT ON COLUMN public.orders.discount_reason IS 'Reason for manual discount';
COMMENT ON COLUMN public.orders.payment_method IS 'Payment method used (cash, upi, card, online)';
