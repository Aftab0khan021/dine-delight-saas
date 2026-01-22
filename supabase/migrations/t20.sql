-- 1. Allow Public to VIEW Restaurants (Fixes "Restaurant not found")
DROP POLICY IF EXISTS "Public can view restaurants" ON restaurants;
CREATE POLICY "Public can view restaurants" ON restaurants
  FOR SELECT TO anon, authenticated USING (true);

-- 2. Allow Public to VIEW Categories
DROP POLICY IF EXISTS "Public can view categories" ON categories;
CREATE POLICY "Public can view categories" ON categories
  FOR SELECT TO anon, authenticated USING (deleted_at IS NULL);

-- 3. Allow Public to VIEW Menu Items
DROP POLICY IF EXISTS "Public can view menu items" ON menu_items;
CREATE POLICY "Public can view menu items" ON menu_items
  FOR SELECT TO anon, authenticated USING (is_active = true AND deleted_at IS NULL);