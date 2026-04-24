-- ============================================================
-- Growth Feature Flags: seed 5 pillar flags in feature_flags table
-- Super-admin can toggle these globally and per-restaurant via
-- the existing FeatureFlags page (/superadmin/feature-flags)
-- ============================================================

insert into public.feature_flags (key, name, description, is_enabled, config)
values
  (
    'whatsapp_crm',
    'WhatsApp CRM & Re-engagement',
    'Send WhatsApp receipts on order placement and automated 7-day re-engagement coupons. Requires WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID env vars.',
    false, -- Disabled by default (requires WhatsApp Business API credentials)
    '{"reengagement_delay_days": 7, "coupon_discount_percent": 15}'::jsonb
  ),
  (
    'cloud_kitchen_mode',
    'Cloud Kitchen Multi-Brand OS',
    'Enable parent/child restaurant hierarchy, unified KOT dashboard, and brand-split revenue reporting for cloud/ghost kitchens.',
    false,
    '{"max_brands_per_kitchen": 10}'::jsonb
  ),
  (
    'smart_menu_ranking',
    'AI Smart Menu Ranking',
    'Dynamically re-ranks menu items based on time of day, weather, and popularity trends. Shows "Popular right now" badges.',
    true, -- Safe to enable globally (graceful fallback if no data)
    '{"weather_boost_weight": 0.3, "popularity_weight": 0.5, "time_weight": 0.2}'::jsonb
  ),
  (
    'menu_upsell_suggestions',
    'AI Upsell Suggestions (Frequently Ordered Together)',
    'Shows "People also order..." suggestions after adding to cart, based on historical order co-occurrence data.',
    true,
    '{"max_suggestions": 3, "min_co_orders": 2}'::jsonb
  ),
  (
    'headless_api',
    'Headless API & Webhooks',
    'Allows restaurants to generate API keys and integrate Dine Delight as a headless POS backend. Enables webhook delivery on order events.',
    false, -- Disabled until restaurant understands the feature
    '{"rate_limit_per_minute": 100, "max_keys_per_restaurant": 5}'::jsonb
  ),
  (
    'collaborative_carts',
    'Real-Time Collaborative Carts',
    'Multiple customers at the same table can browse and add items to a shared live cart simultaneously using Supabase Realtime.',
    false,
    '{"session_ttl_minutes": 120, "max_participants": 10}'::jsonb
  )
on conflict (key) do update set
  description = excluded.description,
  config = excluded.config;
