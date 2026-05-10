-- =============================================================
-- Update seeded subscription plans to include all 23 feature keys
-- This ensures the plan editor shows all features when editing
-- =============================================================

-- Starter Plan: Basic features only
UPDATE subscription_plans
SET features = '{
  "online_ordering": true,
  "qr_menu": true,
  "table_ordering": false,
  "analytics": false,
  "multi_language": false,
  "kitchen_display": true,
  "coupons": false,
  "reviews": true,
  "customer_management": false,
  "delivery_zones": false,
  "table_reservations": false,
  "inventory_management": false,
  "loyalty_program": false,
  "email_marketing": false,
  "multi_location": false,
  "custom_domain": false,
  "api_access": false,
  "priority_support": false,
  "white_label": false,
  "menu_insights": false,
  "whatsapp_crm": false,
  "whatsapp_bot": false,
  "otp_verification": false,
  "staff_limit": 5,
  "menu_items_limit": 50,
  "api_rate_limit": 100
}'::jsonb
WHERE slug = 'starter';

-- Professional Plan: Most features enabled
UPDATE subscription_plans
SET features = '{
  "online_ordering": true,
  "qr_menu": true,
  "table_ordering": true,
  "analytics": true,
  "multi_language": true,
  "kitchen_display": true,
  "coupons": true,
  "reviews": true,
  "customer_management": true,
  "delivery_zones": true,
  "table_reservations": true,
  "inventory_management": true,
  "loyalty_program": true,
  "email_marketing": false,
  "multi_location": false,
  "custom_domain": true,
  "api_access": false,
  "priority_support": false,
  "white_label": false,
  "menu_insights": true,
  "whatsapp_crm": false,
  "whatsapp_bot": false,
  "otp_verification": true,
  "staff_limit": 20,
  "menu_items_limit": 200,
  "api_rate_limit": 1000
}'::jsonb
WHERE slug = 'professional';

-- Enterprise Plan: Everything enabled, unlimited limits
UPDATE subscription_plans
SET features = '{
  "online_ordering": true,
  "qr_menu": true,
  "table_ordering": true,
  "analytics": true,
  "multi_language": true,
  "kitchen_display": true,
  "coupons": true,
  "reviews": true,
  "customer_management": true,
  "delivery_zones": true,
  "table_reservations": true,
  "inventory_management": true,
  "loyalty_program": true,
  "email_marketing": true,
  "multi_location": true,
  "custom_domain": true,
  "api_access": true,
  "priority_support": true,
  "white_label": true,
  "menu_insights": true,
  "whatsapp_crm": true,
  "whatsapp_bot": true,
  "otp_verification": true,
  "staff_limit": -1,
  "menu_items_limit": -1,
  "api_rate_limit": -1
}'::jsonb
WHERE slug = 'enterprise';
