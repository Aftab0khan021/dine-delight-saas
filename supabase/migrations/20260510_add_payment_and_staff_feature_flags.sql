-- =============================================================
-- Add online_payments + staff_categories feature flags
-- and update plan JSONB to include both new keys
-- =============================================================

-- Part A: Ensure both feature flags exist in the global table
INSERT INTO feature_flags (key, name, description, is_enabled)
VALUES
  ('online_payments',   'Online Payments',   'Accept card, UPI, and digital payments at checkout', false),
  ('staff_categories',  'Staff Categories',  'Create custom staff roles with granular permissions', false)
ON CONFLICT (key) DO NOTHING;

-- Part B: Add both keys to Starter plan (both OFF — cash only, no staff categories)
UPDATE subscription_plans
SET features = features || '{
  "online_payments": false,
  "staff_categories": false
}'::jsonb
WHERE slug = 'starter'
  AND NOT (features ? 'online_payments');

-- Part C: Add both keys to Professional plan (both ON)
UPDATE subscription_plans
SET features = features || '{
  "online_payments": true,
  "staff_categories": true
}'::jsonb
WHERE slug = 'professional'
  AND NOT (features ? 'online_payments');

-- Part D: Add both keys to Enterprise plan (both ON)
UPDATE subscription_plans
SET features = features || '{
  "online_payments": true,
  "staff_categories": true
}'::jsonb
WHERE slug = 'enterprise'
  AND NOT (features ? 'online_payments');
