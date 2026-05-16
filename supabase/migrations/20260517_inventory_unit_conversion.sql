-- ============================================================
-- Inventory: Unit Conversion for Menu Item → Ingredient Links
-- Adds recipe_unit + conversion_factor to menu_item_ingredients
-- Updates deduct_stock_for_accepted_order to apply the factor
-- ============================================================

-- 1. Add new columns to the junction table
--    recipe_unit: the unit staff enter when writing the recipe (e.g. "tbsp")
--    conversion_factor: 1 recipe_unit = N storage_units (e.g. 1 tbsp flour = 0.008 kg)
--    Both default to NULL / 1.0 so all existing links are unaffected.

ALTER TABLE menu_item_ingredients
  ADD COLUMN IF NOT EXISTS recipe_unit TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(14,6) DEFAULT 1.0;

-- Backfill: existing rows with no recipe_unit get factor=1 (no change in behaviour)
UPDATE menu_item_ingredients
  SET conversion_factor = 1.0
  WHERE conversion_factor IS NULL;

-- Make factor NOT NULL going forward (always has a value after UI sets it)
ALTER TABLE menu_item_ingredients
  ALTER COLUMN conversion_factor SET NOT NULL,
  ALTER COLUMN conversion_factor SET DEFAULT 1.0;

-- ============================================================
-- 2. Update deduct_stock_for_accepted_order to apply conversion_factor
--    TIMING RULE: deduction only happens on ACCEPTED — preserved.
--    IDEMPOTENCY GUARD: preserved.
--    CHANGE: deduction amount now uses conversion_factor.
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_stock_for_accepted_order(
  p_order_id UUID,
  p_restaurant_id UUID
) RETURNS JSONB AS $$
DECLARE
  item RECORD;
  ing  RECORD;
  effective_qty    NUMERIC;  -- quantity in storage units after conversion
  new_stock        NUMERIC;
  low_stock_alerts TEXT[] := '{}';
  disabled_items   TEXT[] := '{}';
  v_already_deducted BOOLEAN;
BEGIN
  -- ── Idempotency guard ────────────────────────────────────────────────────
  -- If this order was already deducted (e.g. button clicked twice), skip.
  SELECT EXISTS (
    SELECT 1 FROM stock_movements
    WHERE reference_id = p_order_id AND reason = 'order_accepted'
  ) INTO v_already_deducted;

  IF v_already_deducted THEN
    RETURN jsonb_build_object('success', true, 'skipped', true, 'message', 'Already deducted');
  END IF;

  -- ── Loop through all ordered items ────────────────────────────────────────
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
        COALESCE(mi.conversion_factor, 1.0)  AS conversion_factor,
        mi.recipe_unit,
        i.current_stock,
        i.name           AS ingredient_name,
        i.unit           AS storage_unit,
        i.low_stock_threshold,
        m.name           AS item_name
      FROM menu_item_ingredients mi
      JOIN ingredients i ON i.id = mi.ingredient_id
      JOIN menu_items  m ON m.id = mi.menu_item_id
      WHERE mi.menu_item_id   = item.menu_item_id
        AND i.is_tracked      = true
        AND i.restaurant_id   = p_restaurant_id
    LOOP
      -- ── Guard: skip if conversion_factor is invalid (H2) ──────────────────
      IF ing.conversion_factor <= 0 THEN
        RAISE WARNING 'Invalid conversion_factor % for ingredient_id %, skipping deduction',
          ing.conversion_factor, ing.ingredient_id;
        CONTINUE;
      END IF;

      -- ── Core formula (with unit conversion) ────────────────────────────
      -- effective_qty = how much to deduct from storage (always in storage_unit)
      -- = quantity_needed (in recipe_unit) × conversion_factor × order_quantity
      effective_qty := ing.quantity_needed * ing.conversion_factor * item.quantity;
      new_stock     := ing.current_stock - effective_qty;

      -- Deduct (floor at 0 in the column, but log the real signed change)
      UPDATE ingredients
        SET current_stock = GREATEST(new_stock, 0),
            updated_at    = now()
        WHERE id = ing.ingredient_id;

      -- Log the movement with effective deduction amount
      INSERT INTO stock_movements
        (ingredient_id, restaurant_id, change_qty, reason, reference_id, notes)
      VALUES (
        ing.ingredient_id,
        p_restaurant_id,
        -effective_qty,
        'order_accepted',
        p_order_id,
        CASE
          WHEN ing.recipe_unit IS NOT NULL AND ing.recipe_unit != ing.storage_unit
          THEN ing.quantity_needed::TEXT || ' ' || ing.recipe_unit
               || ' × ' || ing.conversion_factor::TEXT
               || ' = ' || round(effective_qty / NULLIF(item.quantity, 0), 6)::TEXT
               || ' ' || ing.storage_unit || '/item'
          ELSE NULL
        END
      );

      -- ── Low stock alert ────────────────────────────────────────────────
      IF new_stock <= ing.low_stock_threshold AND new_stock > 0 THEN
        low_stock_alerts := array_append(
          low_stock_alerts,
          ing.ingredient_name || ' (' || round(new_stock, 2) || ' ' || ing.storage_unit || ' remaining)'
        );
      END IF;

      -- ── Auto-disable menu items when ingredient hits 0 ─────────────────
      IF new_stock <= 0 THEN
        UPDATE menu_items
          SET is_active  = false,
              updated_at = now()
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
    'success',          true,
    'low_stock_alerts', to_jsonb(low_stock_alerts),
    'disabled_items',   to_jsonb(disabled_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant execute permissions (idempotent)
GRANT EXECUTE ON FUNCTION deduct_stock_for_accepted_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_stock_for_accepted_order(UUID, UUID) TO service_role;

-- ============================================================
-- 3. Update order_ingredient_preview view to show conversion info
--    Must DROP first — PostgreSQL cannot rename view columns via
--    CREATE OR REPLACE VIEW (ERROR 42P16). We rename "unit" → "storage_unit".
-- ============================================================

-- Drop existing view so we can recreate with renamed column
DROP VIEW IF EXISTS order_ingredient_preview;

CREATE OR REPLACE VIEW order_ingredient_preview AS
SELECT
  oi.order_id,
  oi.menu_item_id,
  oi.quantity                                                           AS item_qty,
  i.id                                                                  AS ingredient_id,
  i.name                                                                AS ingredient_name,
  i.unit                                                                AS storage_unit,
  mi.recipe_unit,
  COALESCE(mi.conversion_factor, 1.0)                                   AS conversion_factor,
  i.current_stock,
  i.low_stock_threshold,
  i.is_tracked,
  mi.quantity_needed,
  -- total_needed is now in storage units (after conversion)
  (mi.quantity_needed * COALESCE(mi.conversion_factor, 1.0) * oi.quantity)  AS total_needed,
  i.current_stock
    - (mi.quantity_needed * COALESCE(mi.conversion_factor, 1.0) * oi.quantity) AS stock_after
FROM order_items oi
JOIN menu_item_ingredients mi ON mi.menu_item_id = oi.menu_item_id
JOIN ingredients           i  ON i.id = mi.ingredient_id
WHERE i.is_tracked = true;

-- ============================================================
-- Note on timing rule (from implementation plan):
-- Stock is ONLY deducted when order moves to 'accepted'.
-- The idempotency guard (v_already_deducted) prevents double-deduction.
-- place-order edge function does NOT call any deduction RPC.
-- ============================================================
