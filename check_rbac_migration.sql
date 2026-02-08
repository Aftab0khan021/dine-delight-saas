-- Check if RBAC tables exist
SELECT 
  table_name,
  'exists' as status
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name IN ('staff_categories', 'permissions', 'category_permissions')
ORDER BY table_name;

-- Check if staff_category_id column was added to user_roles
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'user_roles'
  AND column_name = 'staff_category_id';
