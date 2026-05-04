-- ============================================================
-- Menu Enhancement: Food Types, Tags, Spice, Allergens,
-- Subcategories, Scheduling, Packaging, Cuisine
-- ============================================================

-- 1. Add food_type column to menu_items (veg/nonveg/egg)
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS food_type TEXT DEFAULT 'veg';
-- Values: 'veg', 'nonveg', 'egg'

-- 2. Add packaging_charge_cents for delivery-oriented restaurants
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS packaging_charge_cents INTEGER DEFAULT 0;

-- 3. Subcategories: add parent_id to categories
ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

-- 4. Category scheduling: available time windows
ALTER TABLE categories ADD COLUMN IF NOT EXISTS available_from TIME;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS available_to TIME;
-- When both are set, category only shows during that time window

-- 5. Restaurant cuisine type (on profile)
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine_types TEXT[] DEFAULT '{}';
-- e.g., {'North Indian', 'Chinese', 'Italian'}
