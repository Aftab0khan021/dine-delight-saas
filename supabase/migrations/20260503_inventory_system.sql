-- ============================================================
-- Inventory / Stock Tracking System
-- ============================================================

-- 1. Ingredients master table
CREATE TABLE IF NOT EXISTS ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_per_unit_cents INTEGER DEFAULT 0,
  is_tracked BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(restaurant_id, name)
);

-- 2. Junction: which ingredients go into which menu item
CREATE TABLE IF NOT EXISTS menu_item_ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  menu_item_id UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_needed NUMERIC(10,3) NOT NULL DEFAULT 1,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  UNIQUE(menu_item_id, ingredient_id)
);

-- 3. Stock movement log for audit trail
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  change_qty NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  reference_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_ingredients_restaurant ON ingredients(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ingredients_low_stock ON ingredients(restaurant_id, current_stock, low_stock_threshold) WHERE is_tracked = true;
CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_item ON menu_item_ingredients(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_ingredients_ingredient ON menu_item_ingredients(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id, created_at DESC);

-- 5. RPC: Deduct stock atomically when order is placed
CREATE OR REPLACE FUNCTION deduct_stock_for_order(
  p_order_id UUID,
  p_restaurant_id UUID,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  item RECORD;
  ing RECORD;
  new_stock NUMERIC;
  low_stock_alerts TEXT[] := '{}';
  disabled_items TEXT[] := '{}';
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(menu_item_id UUID, quantity INT)
  LOOP
    FOR ing IN
      SELECT mi.ingredient_id, mi.quantity_needed, i.current_stock, i.name AS ingredient_name,
             i.low_stock_threshold, m.name AS item_name
      FROM menu_item_ingredients mi
      JOIN ingredients i ON i.id = mi.ingredient_id
      JOIN menu_items m ON m.id = mi.menu_item_id
      WHERE mi.menu_item_id = item.menu_item_id AND i.is_tracked = true
    LOOP
      new_stock := ing.current_stock - (ing.quantity_needed * item.quantity);

      UPDATE ingredients SET current_stock = GREATEST(new_stock, 0), updated_at = now()
      WHERE id = ing.ingredient_id;

      INSERT INTO stock_movements (ingredient_id, restaurant_id, change_qty, reason, reference_id)
      VALUES (ing.ingredient_id, p_restaurant_id, -(ing.quantity_needed * item.quantity), 'order', p_order_id);

      IF new_stock <= ing.low_stock_threshold AND new_stock > 0 THEN
        low_stock_alerts := array_append(low_stock_alerts, ing.ingredient_name || ' (' || round(new_stock, 1) || ' remaining)');
      END IF;

      IF new_stock <= 0 THEN
        UPDATE menu_items SET is_active = false, updated_at = now()
        WHERE id IN (
          SELECT DISTINCT mi2.menu_item_id FROM menu_item_ingredients mi2
          WHERE mi2.ingredient_id = ing.ingredient_id
        ) AND restaurant_id = p_restaurant_id AND is_active = true;

        disabled_items := array_append(disabled_items, ing.item_name || ' (out of ' || ing.ingredient_name || ')');
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

-- 6. RPC: Restock ingredient and auto-re-enable menu items
CREATE OR REPLACE FUNCTION restock_ingredient(
  p_ingredient_id UUID,
  p_quantity NUMERIC,
  p_reason TEXT DEFAULT 'restock',
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_ingredient ingredients%ROWTYPE;
  v_new_stock NUMERIC;
  re_enabled_items TEXT[] := '{}';
  item_rec RECORD;
BEGIN
  SELECT * INTO v_ingredient FROM ingredients WHERE id = p_ingredient_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ingredient not found');
  END IF;

  v_new_stock := v_ingredient.current_stock + p_quantity;

  UPDATE ingredients SET current_stock = v_new_stock, updated_at = now()
  WHERE id = p_ingredient_id;

  INSERT INTO stock_movements (ingredient_id, restaurant_id, change_qty, reason, notes)
  VALUES (p_ingredient_id, v_ingredient.restaurant_id, p_quantity, p_reason, p_notes);

  -- Auto-re-enable menu items if ALL their ingredients are now above threshold
  IF v_new_stock > v_ingredient.low_stock_threshold THEN
    FOR item_rec IN
      SELECT DISTINCT mi.menu_item_id, m.name
      FROM menu_item_ingredients mi
      JOIN menu_items m ON m.id = mi.menu_item_id
      WHERE mi.ingredient_id = p_ingredient_id
        AND m.is_active = false
        AND m.restaurant_id = v_ingredient.restaurant_id
        AND NOT EXISTS (
          SELECT 1 FROM menu_item_ingredients mi2
          JOIN ingredients i2 ON i2.id = mi2.ingredient_id
          WHERE mi2.menu_item_id = mi.menu_item_id
            AND i2.is_tracked = true
            AND i2.current_stock <= 0
            AND i2.id != p_ingredient_id
        )
    LOOP
      UPDATE menu_items SET is_active = true, updated_at = now() WHERE id = item_rec.menu_item_id;
      re_enabled_items := array_append(re_enabled_items, item_rec.name);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'new_stock', v_new_stock,
    're_enabled_items', to_jsonb(re_enabled_items)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS Policies
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Restaurant members can manage ingredients" ON ingredients;
CREATE POLICY "Restaurant members can manage ingredients"
  ON ingredients FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM user_roles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Restaurant members can manage ingredient links" ON menu_item_ingredients;
CREATE POLICY "Restaurant members can manage ingredient links"
  ON menu_item_ingredients FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM user_roles WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Restaurant members can view stock movements" ON stock_movements;
CREATE POLICY "Restaurant members can view stock movements"
  ON stock_movements FOR ALL USING (
    restaurant_id IN (SELECT restaurant_id FROM user_roles WHERE user_id = auth.uid())
  );
