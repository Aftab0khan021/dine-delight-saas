-- ============================================================================
-- COMPREHENSIVE DIAGNOSTIC: Staff Invite System
-- ============================================================================
-- Run this in Supabase SQL Editor to check EVERYTHING
-- Copy ALL results and share with me

-- ============================================================================
-- 1. CHECK TABLES EXIST
-- ============================================================================
SELECT 
  'Tables Check' as check_type,
  table_name,
  CASE 
    WHEN table_name IN (
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM (VALUES 
  ('profiles'),
  ('user_roles'),
  ('staff_categories'),
  ('permissions'),
  ('category_permissions'),
  ('staff_invites')
) AS t(table_name);

-- ============================================================================
-- 2. CHECK user_roles TABLE STRUCTURE
-- ============================================================================
SELECT 
  '2. user_roles Columns' as check_type,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- ============================================================================
-- 3. CHECK user_role ENUM VALUES
-- ============================================================================
SELECT 
  '3. user_role Enum' as check_type,
  enumlabel as role_value,
  enumsortorder as sort_order
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'user_role'
ORDER BY e.enumsortorder;

-- ============================================================================
-- 4. CHECK TRIGGERS
-- ============================================================================
SELECT 
  '4. Triggers' as check_type,
  t.tgname as trigger_name,
  c.relname as table_name,
  CASE t.tgenabled
    WHEN 'O' THEN '✅ ENABLED'
    WHEN 'D' THEN '❌ DISABLED'
    ELSE 'UNKNOWN'
  END as status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname IN ('on_auth_user_created', 'on_auth_user_created_handle_invite')
  AND NOT t.tgisinternal;

-- ============================================================================
-- 5. CHECK FUNCTIONS
-- ============================================================================
SELECT 
  '5. Functions' as check_type,
  proname as function_name,
  CASE 
    WHEN proname = 'handle_new_user' THEN 'Creates profiles'
    WHEN proname = 'handle_invited_user' THEN 'Creates user_roles'
    ELSE 'Other'
  END as purpose
FROM pg_proc
WHERE proname IN ('handle_new_user', 'handle_invited_user')
  AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================================================
-- 6. CHECK YOUR CURRENT USER ROLE
-- ============================================================================
SELECT 
  '6. Your Current Role' as check_type,
  ur.user_id,
  ur.role,
  ur.restaurant_id,
  ur.staff_category_id,
  sc.name as category_name
FROM user_roles ur
LEFT JOIN staff_categories sc ON sc.id = ur.staff_category_id
WHERE ur.user_id = auth.uid();

-- ============================================================================
-- 7. CHECK STAFF CATEGORIES FOR YOUR RESTAURANT
-- ============================================================================
SELECT 
  '7. Staff Categories' as check_type,
  sc.id,
  sc.name,
  sc.color,
  sc.is_default,
  COUNT(cp.permission_id) as permission_count
FROM staff_categories sc
LEFT JOIN category_permissions cp ON cp.category_id = sc.id
WHERE sc.restaurant_id = (
  SELECT restaurant_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1
)
GROUP BY sc.id, sc.name, sc.color, sc.is_default
ORDER BY sc.name;

-- ============================================================================
-- 8. CHECK RECENT INVITE ATTEMPTS
-- ============================================================================
SELECT 
  '8. Recent Invites' as check_type,
  si.email,
  si.role,
  si.status,
  si.created_at,
  si.updated_at
FROM staff_invites si
WHERE si.restaurant_id = (
  SELECT restaurant_id FROM user_roles WHERE user_id = auth.uid() LIMIT 1
)
ORDER BY si.created_at DESC
LIMIT 5;

-- ============================================================================
-- 9. CHECK IF RBAC MIGRATION WAS APPLIED
-- ============================================================================
SELECT 
  '9. RBAC Migration Status' as check_type,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'user_roles' 
        AND column_name = 'staff_category_id'
    ) THEN '✅ APPLIED - staff_category_id column exists'
    ELSE '❌ NOT APPLIED - staff_category_id column missing'
  END as status;

-- ============================================================================
-- 10. CHECK RLS POLICIES ON user_roles
-- ============================================================================
SELECT 
  '10. RLS Policies' as check_type,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename = 'user_roles'
ORDER BY policyname;
