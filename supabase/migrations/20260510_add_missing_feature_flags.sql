-- =============================================================
-- Feature Flag Normalization
-- All flags default to OFF. Features activate via:
--   1. Subscription plan (subscription_plans.features JSONB)
--   2. Per-restaurant override (restaurant_features table)
--   3. Global flag toggle by Super Admin
-- =============================================================

-- Part A: Update existing flags to OFF (global default)
UPDATE feature_flags SET is_enabled = false
WHERE key IN ('online_ordering', 'qr_menu', 'table_ordering', 'analytics', 'multi_language')
  AND is_enabled = true;

-- Part B: Insert all missing feature flags (all OFF)
INSERT INTO feature_flags (key, name, description, is_enabled)
VALUES
  ('table_reservations',    'Table Reservations',    'Allow customers to reserve tables online',           false),
  ('inventory_management',  'Inventory Management',  'Track and manage ingredient inventory',              false),
  ('coupons',               'Coupons & Discounts',   'Manage promo codes and discount campaigns',          false),
  ('reviews',               'Customer Reviews',      'View and manage customer reviews and ratings',       false),
  ('customer_management',   'Customer Management',   'CRM database for customer profiles and history',     false),
  ('kitchen_display',       'Kitchen Display',       'Kitchen display system for order preparation',       false),
  ('delivery_zones',        'Delivery Zones',        'Configure delivery areas and zone-based pricing',    false),
  ('menu_insights',         'Menu Insights',         'AI-powered menu performance analytics',              false),
  ('whatsapp_crm',          'WhatsApp CRM',          'WhatsApp marketing and customer communication',      false),
  ('whatsapp_bot',          'WhatsApp Bot',          'Automated WhatsApp ordering bot',                    false),
  ('otp_verification',      'OTP Verification',      'Phone number verification via OTP',                  false),
  ('loyalty_program',       'Loyalty Program',       'Customer loyalty points and rewards program',        false),
  ('email_marketing',       'Email Marketing',       'Send marketing emails and newsletters',              false),
  ('multi_location',        'Multi-Location',        'Manage multiple restaurant locations',               false),
  ('white_label',           'White Label',           'Remove platform branding and use custom branding',   false),
  ('priority_support',      'Priority Support',      'Priority customer support with faster response',     false)
ON CONFLICT (key) DO NOTHING;

-- Note: Announcements RLS policy was already applied in 20260510_fix_superadmin_issues.sql
-- No further changes needed.
