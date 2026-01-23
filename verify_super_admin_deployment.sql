-- ============================================================
-- VERIFICATION QUERIES
-- Run these in Supabase SQL Editor to verify deployment
-- ============================================================

-- 1. Check all new tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'subscription_plans',
    'feature_flags',
    'restaurant_features',
    'super_admin_audit_log',
    'platform_settings',
    'support_tickets'
  )
ORDER BY table_name;
-- Expected: 6 rows

-- 2. Check default subscription plans
SELECT 
  name,
  slug,
  price_cents / 100.0 as price_dollars,
  billing_period,
  trial_days,
  is_active
FROM subscription_plans
ORDER BY sort_order;
-- Expected: 3 plans (Starter, Professional, Enterprise)

-- 3. Check default feature flags
SELECT 
  key,
  name,
  is_enabled
FROM feature_flags
ORDER BY key;
-- Expected: 7 feature flags

-- 4. Check platform settings
SELECT 
  key,
  value,
  description
FROM platform_settings
ORDER BY key;
-- Expected: 5 settings

-- 5. Check new columns on restaurants
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'restaurants' 
  AND column_name IN ('status', 'suspension_reason', 'last_active_at', 'metadata')
ORDER BY column_name;
-- Expected: 4 columns

-- 6. Check new columns on subscriptions
SELECT column_name, data_type
FROM information_schema.columns 
WHERE table_name = 'subscriptions' 
  AND column_name IN ('plan_id', 'is_manual_override', 'discount_percent')
ORDER BY column_name;
-- Expected: 3 columns

-- 7. Check helper views exist
SELECT table_name, view_definition
FROM information_schema.views 
WHERE table_schema = 'public' 
  AND table_name IN ('restaurant_health_scores', 'platform_metrics');
-- Expected: 2 views

-- 8. Test platform_metrics view
SELECT * FROM platform_metrics;
-- Expected: 1 row with platform statistics

-- 9. Test restaurant_health_scores view
SELECT 
  id,
  name,
  status,
  health_score
FROM restaurant_health_scores
ORDER BY health_score DESC
LIMIT 5;
-- Expected: Your restaurants with health scores

-- 10. Test helper functions
-- Test is_feature_enabled function
SELECT is_feature_enabled(
  (SELECT id FROM restaurants LIMIT 1),
  'online_ordering'
);
-- Expected: true or false

-- ============================================================
-- CREATE SUPER ADMIN USER
-- ============================================================

-- Step 1: Get your user ID
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'YOUR_EMAIL@example.com';
-- Copy the user ID

-- Step 2: Assign super_admin role
-- Replace 'YOUR_USER_ID' with the actual ID from Step 1
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_ID', 'super_admin')
ON CONFLICT (user_id, role, restaurant_id) DO NOTHING;

-- Step 3: Verify super admin role
SELECT 
  u.id,
  u.email,
  ur.role,
  ur.created_at
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.role = 'super_admin';
-- Expected: Your user with super_admin role

-- ============================================================
-- TEST SUPER ADMIN PERMISSIONS
-- ============================================================

-- Test 1: Can view all restaurants
SELECT COUNT(*) as total_restaurants FROM restaurants;

-- Test 2: Can view all subscriptions
SELECT COUNT(*) as total_subscriptions FROM subscriptions;

-- Test 3: Can view all users
SELECT COUNT(*) as total_users FROM auth.users;

-- Test 4: Can insert audit log
SELECT log_super_admin_action(
  'test_deployment',
  'system',
  NULL,
  NULL,
  NULL,
  '{"deployment": "phase_1"}'::jsonb,
  '{"status": "success", "timestamp": "' || NOW()::text || '"}'::jsonb
);
-- Expected: UUID of audit log entry

-- Test 5: Verify audit log entry
SELECT 
  action,
  entity_type,
  metadata,
  created_at
FROM super_admin_audit_log
WHERE action = 'test_deployment'
ORDER BY created_at DESC
LIMIT 1;
-- Expected: Your test audit log entry

-- ============================================================
-- OPTIONAL: UPDATE EXISTING DATA
-- ============================================================

-- Set all existing restaurants to 'active' status
UPDATE restaurants
SET status = 'active'
WHERE status IS NULL;

-- Update last_active_at based on most recent order
UPDATE restaurants r
SET last_active_at = (
  SELECT MAX(created_at)
  FROM orders
  WHERE restaurant_id = r.id
)
WHERE last_active_at IS NULL;

-- Link existing subscriptions to plans (if you have plan_key column)
-- UPDATE subscriptions s
-- SET plan_id = sp.id
-- FROM subscription_plans sp
-- WHERE s.plan_key = sp.slug
--   AND s.plan_id IS NULL;

-- ============================================================
-- SUMMARY QUERY
-- ============================================================

-- Get complete deployment summary
SELECT 
  'Tables Created' as metric,
  COUNT(*)::text as value
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'subscription_plans',
    'feature_flags',
    'restaurant_features',
    'super_admin_audit_log',
    'platform_settings',
    'support_tickets'
  )

UNION ALL

SELECT 
  'Subscription Plans',
  COUNT(*)::text
FROM subscription_plans

UNION ALL

SELECT 
  'Feature Flags',
  COUNT(*)::text
FROM feature_flags

UNION ALL

SELECT 
  'Platform Settings',
  COUNT(*)::text
FROM platform_settings

UNION ALL

SELECT 
  'Super Admins',
  COUNT(*)::text
FROM user_roles
WHERE role = 'super_admin'

UNION ALL

SELECT 
  'Total Restaurants',
  COUNT(*)::text
FROM restaurants

UNION ALL

SELECT 
  'Active Restaurants',
  COUNT(*)::text
FROM restaurants
WHERE status = 'active';

-- ============================================================
-- DONE! 🎉
-- ============================================================
-- If all queries above return expected results, Phase 1 is complete!
-- Next: Access Super Admin Panel at /superadmin/dashboard
