-- ============================================================
-- Inventory: Deduct stock on order ACCEPTED (not on placement)
-- Adds: deduct_stock_for_accepted_order RPC
-- ============================================================

-- Drop the old trigger-based approach if any exist
-- (the original deduct_stock_for_order RPC was called from place-order edge function)
-- We keep that RPC but it should no longer be called at placement time.
-- Instead this new RPC is called when an order is moved to 'accepted' status.

CREATE OR REPLACE FUNCTION deduct_stock_for_accepted_order(
  p_order_id UUID,
  p_restaurant_id UUID
) RETURNS JSONB AS $$
DECLARE
  item RECORD;
  ing RECORD;
  new_stock NUMERIC;
  low_stock_alerts TEXT[] := '{}';
  disabled_items TEXT[] := '{}';
  v_already_deducted BOOLEAN;
BEGIN
  -- Idempotency guard: check if we already deducted for this order
  SELECT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id = p_order_id AND reason = 'order_accepted'
  ) INTO v_already_deducted;

  IF v_already_deducted THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'message', 'Already deducted');
  END IF;

  -- Loop through all items in the order
  FOR item IN
    SELECT oi.menu_item_id, oi.quantity
    FROM order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    -- For each ingredient linked to this menu item
    FOR ing IN
      SELECT
        mi.ingredient_id,
        mi.quantity_needed,
        i.current_stock,
        i.name AS ingredient_name,
        i.low_stock_threshold,
        m.name AS item_name
      FROM menu_item_ingredients mi
      JOIN ingredients i ON i.id = mi.ingredient_id
      JOIN menu_items m ON m.id = mi.menu_item_id
      WHERE mi.menu_item_id = item.menu_item_id
        AND i.is_tracked = true
        AND i.restaurant_id = p_restaurant_id
    LOOP
      new_stock := ing.current_stock - (ing.quantity_needed * item.quantity);

      -- Deduct (never below 0 in the column, but track the real deduction)
      UPDATE ingredients
      SET current_stock = GREATEST(new_stock, 0), updated_at = now()
      WHERE id = ing.ingredient_id;

      -- Log the movement
      INSERT INTO stock_movements (ingredient_id, restaurant_id, change_qty, reason, reference_id)
      VALUES (
        ing.ingredient_id,
        p_restaurant_id,
        -(ing.quantity_needed * item.quantity),
        'order_accepted',
        p_order_id
      );

      -- Low stock alert
      IF new_stock <= ing.low_stock_threshold AND new_stock > 0 THEN
        low_stock_alerts := array_append(
          low_stock_alerts,
          ing.ingredient_name || ' (' || round(new_stock, 1) || ' remaining)'
        );
      END IF;

      -- Auto-disable menu items when ingredient hits 0
      IF new_stock <= 0 THEN
        UPDATE menu_items
        SET is_active = false, updated_at = now()
        WHERE id IN (
          SELECT DISTINCT mi2.menu_item_id
          FROM menu_item_ingredients mi2
          WHERE mi2.ingredient_id = ing.ingredient_id
        )
        AND restaurant_id = p_restaurant_id
        AND is_active = true;

        disabled_items := array_append(
          disabled_items,
          ing.item_name || ' (out of ' || ing.ingredient_name || ')'
        );
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'low_stock_alerts', to_jsonb(low_stock_alerts),
    'disabled_items', to_jsonb(disabled_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION deduct_stock_for_accepted_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_for_accepted_order(UUID, UUID) TO service_role;

-- Add a view to preview ingredient impact for a given order (for the KOT card display)
CREATE OR REPLACE VIEW order_ingredient_preview AS
SELECT
  oi.order_id,
  oi.menu_item_id,
  oi.quantity AS item_qty,
  i.id AS ingredient_id,
  i.name AS ingredient_name,
  i.unit,
  i.current_stock,
  i.low_stock_threshold,
  i.is_tracked,
  mi.quantity_needed,
  (mi.quantity_needed * oi.quantity) AS total_needed,
  i.current_stock - (mi.quantity_needed * oi.quantity) AS stock_after
FROM order_items oi
JOIN menu_item_ingredients mi ON mi.menu_item_id = oi.menu_item_id
JOIN ingredients i ON i.id = mi.ingredient_id
WHERE i.is_tracked = true;
