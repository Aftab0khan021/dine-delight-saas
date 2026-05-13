-- =============================================================
-- Enterprise Feature Sync & Missing Feature Flags
-- Ensures all features from FEATURE_DEFINITIONS are in the DB
-- and Enterprise plan has ALL features enabled.
-- =============================================================

-- Part A: Insert missing feature flags into the global table
INSERT INTO feature_flags (key, name, description, is_enabled)
VALUES
  ('smart_ranking',      'Smart Menu Ranking',    'Auto-sort menu items by popularity so best-sellers appear first',   false),
  ('order_heatmap',      'Order Heatmap',         'Visual heatmap showing busiest ordering hours and days',            false),
  ('ai_descriptions',    'AI Menu Descriptions',  'AI-generated appetizing menu item descriptions',                    false),
  ('sentiment_analysis', 'Review Sentiment',      'Auto-classify reviews as positive/neutral/negative',                false)
ON CONFLICT (key) DO NOTHING;

-- Part B: Update Enterprise plan — ALL boolean features ON, ALL limits UNLIMITED (-1)
UPDATE subscription_plans
SET features = '{
  "online_ordering": true,
  "qr_menu": true,
  "analytics": true,
  "kitchen_display": true,
  "coupons": true,
  "reviews": true,
  "customer_management": true,
  "delivery_zones": true,
  "online_payments": true,
  "staff_categories": true,
  "smart_ranking": true,
  "order_heatmap": true,
  "custom_domain": true,
  "api_access": true,
  "priority_support": true,
  "white_label": true,
  "menu_insights": true,
  "whatsapp_crm": true,
  "whatsapp_bot": true,
  "otp_verification": true,
  "ai_descriptions": true,
  "sentiment_analysis": true,
  "table_reservations": true,
  "loyalty_program": true,
  "email_marketing": true,
  "inventory_management": true,
  "multi_location": true,
  "staff_limit": -1,
  "menu_items_limit": -1,
  "api_rate_limit": -1
}'::jsonb
WHERE slug = 'enterprise';

-- Part C: Add new 4 features to Professional plan (smart_ranking ON, rest OFF)
UPDATE subscription_plans
SET features = features || '{
  "smart_ranking": true,
  "order_heatmap": true,
  "ai_descriptions": false,
  "sentiment_analysis": false
}'::jsonb
WHERE slug = 'professional'
  AND NOT (features ? 'smart_ranking');

-- Part D: Add new 4 features to Starter plan (all OFF)
UPDATE subscription_plans
SET features = features || '{
  "smart_ranking": false,
  "order_heatmap": false,
  "ai_descriptions": false,
  "sentiment_analysis": false
}'::jsonb
WHERE slug = 'starter'
  AND NOT (features ? 'smart_ranking');
