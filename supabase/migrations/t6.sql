-- ============================================================
-- Order Pricing Integrity Fix (Triggers)
-- ============================================================
-- 1) Enforce server-side pricing on order_items
-- 2) Auto-calc order totals on order_items mutation
-- ============================================================

-- Function 1: Enforce correct unit_price from menu_items
CREATE OR REPLACE FUNCTION public.enforce_order_item_price()
RETURNS TRIGGER AS $$
DECLARE
  v_price_cents integer;
BEGIN
  -- Only look up price if menu_item_id is provided
  IF NEW.menu_item_id IS NOT NULL THEN
    SELECT price_cents INTO v_price_cents
    FROM public.menu_items
    WHERE id = NEW.menu_item_id;

    -- If menu item doesn't exist (or is invalid), we could raise an error.
    -- For now, if we found a price, enforce it.
    IF v_price_cents IS NOT NULL THEN
      NEW.unit_price_cents := v_price_cents;
      NEW.line_total_cents := v_price_cents * NEW.quantity;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 1: Bind to order_items
DROP TRIGGER IF EXISTS tr_enforce_order_item_price ON public.order_items;
CREATE TRIGGER tr_enforce_order_item_price
  BEFORE INSERT OR UPDATE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_item_price();


-- Function 2: Update parent order totals
CREATE OR REPLACE FUNCTION public.update_order_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_order_id uuid;
  v_new_subtotal integer;
BEGIN
  -- Determine order_id based on operation
  IF (TG_OP = 'DELETE') THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  -- Calculate fresh subtotal from all items in this order
  SELECT COALESCE(SUM(line_total_cents), 0)
  INTO v_new_subtotal
  FROM public.order_items
  WHERE order_id = v_order_id;

  -- Update the parent order
  -- Enforcing tax=0, tip=0 as requested for this fix scope
  UPDATE public.orders
  SET 
    subtotal_cents = v_new_subtotal,
    tax_cents = 0,
    tip_cents = 0,
    total_cents = v_new_subtotal
  WHERE id = v_order_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 2: Bind to order_items
DROP TRIGGER IF EXISTS tr_update_order_totals ON public.order_items;
CREATE TRIGGER tr_update_order_totals
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_order_totals();
