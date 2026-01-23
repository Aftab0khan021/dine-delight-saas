-- Super Admin Core Infrastructure
-- Phase 1: Database Schema Enhancements
-- Migration: Add subscription plans, feature flags, audit logging, and platform settings

-- Note: app_role enum already exists from previous migration
-- We'll use the existing enum: ('super_admin', 'owner', 'restaurant_admin', 'user')

-- ============================================================
-- 1. SUBSCRIPTION PLANS
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'USD',
  billing_period TEXT CHECK (billing_period IN ('monthly', 'yearly')),
  trial_days INTEGER DEFAULT 0,
  features JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active plans
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active 
ON subscription_plans(is_active, sort_order);

-- Enable RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Super admin can manage plans
CREATE POLICY subscription_plans_super_admin_all
ON subscription_plans FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Everyone can view active plans
CREATE POLICY subscription_plans_view_active
ON subscription_plans FOR SELECT
TO authenticated
USING (is_active = true);

-- ============================================================
-- 2. FEATURE FLAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_enabled BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for enabled flags
CREATE INDEX IF NOT EXISTS idx_feature_flags_enabled 
ON feature_flags(is_enabled);

-- Enable RLS
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- Super admin can manage feature flags
CREATE POLICY feature_flags_super_admin_all
ON feature_flags FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Everyone can view enabled flags
CREATE POLICY feature_flags_view_enabled
ON feature_flags FOR SELECT
TO authenticated
USING (is_enabled = true);

-- ============================================================
-- 3. RESTAURANT FEATURE OVERRIDES
-- ============================================================

CREATE TABLE IF NOT EXISTS restaurant_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id, feature_key)
);

-- Create index for restaurant lookups
CREATE INDEX IF NOT EXISTS idx_restaurant_features_restaurant 
ON restaurant_features(restaurant_id);

-- Enable RLS
ALTER TABLE restaurant_features ENABLE ROW LEVEL SECURITY;

-- Super admin can manage restaurant features
CREATE POLICY restaurant_features_super_admin_all
ON restaurant_features FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Restaurant admins can view their features
CREATE POLICY restaurant_features_view_own
ON restaurant_features FOR SELECT
TO authenticated
USING (
  public.has_restaurant_access(auth.uid(), restaurant_id)
);

-- ============================================================
-- 4. SUPER ADMIN AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS super_admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  restaurant_id UUID REFERENCES restaurants(id),
  before_value JSONB,
  after_value JSONB,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_admin 
ON super_admin_audit_log(admin_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_restaurant 
ON super_admin_audit_log(restaurant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_action 
ON super_admin_audit_log(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_super_admin_audit_log_created 
ON super_admin_audit_log(created_at DESC);

-- Enable RLS
ALTER TABLE super_admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Super admin can view all audit logs
CREATE POLICY super_admin_audit_log_view
ON super_admin_audit_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- Super admin can insert audit logs
CREATE POLICY super_admin_audit_log_insert
ON super_admin_audit_log FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin') 
  AND admin_user_id = auth.uid()
);

-- ============================================================
-- 5. PLATFORM SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Super admin can manage platform settings
CREATE POLICY platform_settings_super_admin_all
ON platform_settings FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 6. SUPPORT TICKETS (Optional)
-- ============================================================

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_support_tickets_restaurant 
ON support_tickets(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status 
ON support_tickets(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned 
ON support_tickets(assigned_to, status);

-- Enable RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all tickets
CREATE POLICY support_tickets_super_admin_all
ON support_tickets FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Restaurant admins can view their tickets
CREATE POLICY support_tickets_view_own
ON support_tickets FOR SELECT
TO authenticated
USING (
  public.has_restaurant_access(auth.uid(), restaurant_id)
);

-- Restaurant admins can create tickets
CREATE POLICY support_tickets_create_own
ON support_tickets FOR INSERT
TO authenticated
WITH CHECK (
  public.has_restaurant_access(auth.uid(), restaurant_id)
  AND created_by = auth.uid()
);

-- ============================================================
-- 7. HELPER FUNCTIONS
-- ============================================================

-- Function to log super admin actions
CREATE OR REPLACE FUNCTION log_super_admin_action(
  p_action TEXT,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_restaurant_id UUID DEFAULT NULL,
  p_before_value JSONB DEFAULT NULL,
  p_after_value JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id UUID;
BEGIN
  INSERT INTO super_admin_audit_log (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    restaurant_id,
    before_value,
    after_value,
    metadata
  ) VALUES (
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_restaurant_id,
    p_before_value,
    p_after_value,
    p_metadata
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- Function to check if feature is enabled for restaurant
CREATE OR REPLACE FUNCTION is_feature_enabled(
  p_restaurant_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_override_enabled BOOLEAN;
  v_global_enabled BOOLEAN;
BEGIN
  -- Check for restaurant-specific override
  SELECT is_enabled INTO v_override_enabled
  FROM restaurant_features
  WHERE restaurant_id = p_restaurant_id
    AND feature_key = p_feature_key;
  
  IF v_override_enabled IS NOT NULL THEN
    RETURN v_override_enabled;
  END IF;
  
  -- Check global feature flag
  SELECT is_enabled INTO v_global_enabled
  FROM feature_flags
  WHERE key = p_feature_key;
  
  RETURN COALESCE(v_global_enabled, false);
END;
$$;

-- ============================================================
-- 8. INSERT DEFAULT DATA
-- ============================================================

-- Default subscription plans
INSERT INTO subscription_plans (name, slug, description, price_cents, billing_period, trial_days, features, sort_order)
VALUES 
  (
    'Starter',
    'starter',
    'Perfect for small restaurants getting started',
    2900,
    'monthly',
    14,
    '{
      "online_ordering": true,
      "qr_menu": true,
      "staff_limit": 5,
      "custom_domain": false,
      "analytics": false,
      "api_access": false
    }'::jsonb,
    0
  ),
  (
    'Professional',
    'professional',
    'For growing restaurants with more features',
    7900,
    'monthly',
    14,
    '{
      "online_ordering": true,
      "qr_menu": true,
      "staff_limit": 20,
      "custom_domain": true,
      "analytics": true,
      "api_access": false
    }'::jsonb,
    1
  ),
  (
    'Enterprise',
    'enterprise',
    'Full-featured plan for large operations',
    19900,
    'monthly',
    30,
    '{
      "online_ordering": true,
      "qr_menu": true,
      "staff_limit": -1,
      "custom_domain": true,
      "analytics": true,
      "api_access": true,
      "priority_support": true
    }'::jsonb,
    2
  )
ON CONFLICT (slug) DO NOTHING;

-- Default feature flags
INSERT INTO feature_flags (key, name, description, is_enabled)
VALUES 
  ('online_ordering', 'Online Ordering', 'Enable online order placement', true),
  ('qr_menu', 'QR Menu', 'Enable QR code menu access', true),
  ('table_ordering', 'Table Ordering', 'Enable table-side ordering', true),
  ('custom_domain', 'Custom Domain', 'Allow custom domain setup', false),
  ('analytics', 'Analytics Dashboard', 'Advanced analytics and reporting', true),
  ('api_access', 'API Access', 'REST API access for integrations', false),
  ('multi_language', 'Multi-Language', 'Multiple language support', true)
ON CONFLICT (key) DO NOTHING;

-- Default platform settings
INSERT INTO platform_settings (key, value, description)
VALUES 
  ('platform_name', '"Restaurant SaaS"', 'Platform display name'),
  ('support_email', '"support@example.com"', 'Support contact email'),
  ('max_restaurants', '1000', 'Maximum number of restaurants allowed'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('new_signups_enabled', 'true', 'Allow new restaurant signups')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE subscription_plans IS 'Subscription plan definitions for the platform';
COMMENT ON TABLE feature_flags IS 'Global feature flags for platform-wide features';
COMMENT ON TABLE restaurant_features IS 'Restaurant-specific feature overrides';
COMMENT ON TABLE super_admin_audit_log IS 'Audit trail for all super admin actions';
COMMENT ON TABLE platform_settings IS 'Platform-wide configuration settings';
COMMENT ON TABLE support_tickets IS 'Customer support ticket system';
