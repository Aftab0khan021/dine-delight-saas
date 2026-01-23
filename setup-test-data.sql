-- Test Data Setup Script
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/itxbbdvqopfmuvwxxmtk/sql

-- ============================================================
-- STEP 1: Create Test User
-- ============================================================
-- Go to: https://supabase.com/dashboard/project/itxbbdvqopfmuvwxxmtk/auth/users
-- Click "Add User" and create:
-- Email: admin@test.com
-- Password: testpassword123
-- Auto Confirm: Yes

-- After creating the user, get the user ID:
SELECT id, email FROM auth.users WHERE email = 'admin@test.com';
-- Copy the user ID for next steps

-- ============================================================
-- STEP 2: Create Test Restaurant
-- ============================================================
INSERT INTO restaurants (name, slug, is_accepting_orders)
VALUES ('Test Restaurant', 'test-restaurant', true)
RETURNING id, name, slug;
-- Copy the restaurant ID for next steps

-- ============================================================
-- STEP 3: Assign Admin Role
-- ============================================================
-- Replace 'USER_ID_HERE' and 'RESTAURANT_ID_HERE' with actual IDs from above
INSERT INTO user_roles (user_id, restaurant_id, role)
VALUES (
  'USER_ID_HERE',
  'RESTAURANT_ID_HERE',
  'restaurant_admin'
);

-- Verify the role was assigned:
SELECT 
  ur.role,
  u.email,
  r.name as restaurant_name
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
JOIN restaurants r ON r.id = ur.restaurant_id
WHERE u.email = 'admin@test.com';

-- ============================================================
-- STEP 4: Create Test Category
-- ============================================================
-- Replace 'RESTAURANT_ID_HERE' with actual restaurant ID
INSERT INTO categories (restaurant_id, name, description, sort_order, is_active)
VALUES ('RESTAURANT_ID_HERE', 'Test Category', 'Test menu category', 0, true)
RETURNING id, name;
-- Copy the category ID for next step

-- ============================================================
-- STEP 5: Create Test Menu Items
-- ============================================================
-- Replace 'RESTAURANT_ID_HERE' and 'CATEGORY_ID_HERE' with actual IDs
INSERT INTO menu_items (restaurant_id, category_id, name, description, price_cents, is_active)
VALUES 
  ('RESTAURANT_ID_HERE', 'CATEGORY_ID_HERE', 'Test Burger', 'Delicious test burger', 1299, true),
  ('RESTAURANT_ID_HERE', 'CATEGORY_ID_HERE', 'Test Pizza', 'Amazing test pizza', 1599, true),
  ('RESTAURANT_ID_HERE', 'CATEGORY_ID_HERE', 'Test Salad', 'Fresh test salad', 899, true),
  ('RESTAURANT_ID_HERE', 'CATEGORY_ID_HERE', 'Test Fries', 'Crispy test fries', 499, true);

-- Verify menu items were created:
SELECT 
  mi.name,
  mi.price_cents / 100.0 as price_dollars,
  c.name as category,
  r.name as restaurant
FROM menu_items mi
JOIN categories c ON c.id = mi.category_id
JOIN restaurants r ON r.id = mi.restaurant_id
WHERE r.slug = 'test-restaurant';

-- ============================================================
-- VERIFICATION QUERIES
-- ============================================================

-- Check test user exists
SELECT id, email, created_at FROM auth.users WHERE email = 'admin@test.com';

-- Check test restaurant exists
SELECT id, name, slug, is_accepting_orders FROM restaurants WHERE slug = 'test-restaurant';

-- Check admin role assigned
SELECT 
  ur.role,
  u.email,
  r.name as restaurant
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
JOIN restaurants r ON r.id = ur.restaurant_id
WHERE u.email = 'admin@test.com';

-- Check menu items exist
SELECT COUNT(*) as menu_item_count 
FROM menu_items 
WHERE restaurant_id IN (SELECT id FROM restaurants WHERE slug = 'test-restaurant');

-- ============================================================
-- CLEANUP (Optional - run this to remove test data)
-- ============================================================
/*
-- Delete test orders
DELETE FROM orders WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test menu items
DELETE FROM menu_items WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test categories
DELETE FROM categories WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test user roles
DELETE FROM user_roles WHERE restaurant_id IN (
  SELECT id FROM restaurants WHERE slug = 'test-restaurant'
);

-- Delete test restaurant
DELETE FROM restaurants WHERE slug = 'test-restaurant';

-- Note: To delete the test user, go to Supabase Auth dashboard
*/
