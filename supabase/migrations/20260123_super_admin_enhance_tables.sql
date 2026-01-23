-- Super Admin: Add Missing Columns to Existing Tables
-- Migration: Enhance existing tables with super admin features

-- ============================================================
-- 1. ENHANCE RESTAURANTS TABLE
-- ============================================================

-- Add status column
ALTER TABLE restaurants 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'suspended', 'terminated', 'locked'));

-- Add suspension tracking
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES auth.users(id);

-- Add activity tracking
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- Add metadata
ALTER TABLE restaurants
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_restaurants_status 
ON restaurants(status);

CREATE INDEX IF NOT EXISTS idx_restaurants_last_active 
ON restaurants(last_active_at DESC);

-- ============================================================
-- 2. ENHANCE SUBSCRIPTIONS TABLE
-- ============================================================

-- Add plan reference
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id);

-- Add manual override tracking
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS override_reason TEXT,
ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS override_at TIMESTAMPTZ;

-- Add discount tracking
ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS discount_percent INTEGER DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 100),
ADD COLUMN IF NOT EXISTS discount_reason TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan 
ON subscriptions(plan_id);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status_plan 
ON subscriptions(status, plan_id);

-- ============================================================
-- 3. ENHANCE USER_ROLES TABLE
-- ============================================================

-- Add role assignment tracking
ALTER TABLE user_roles
ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ DEFAULT NOW();

-- Add role metadata
ALTER TABLE user_roles
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create index
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by 
ON user_roles(assigned_by);

-- ============================================================
-- 4. ENHANCE ACTIVITY_LOGS TABLE
-- ============================================================

-- Add severity level
ALTER TABLE activity_logs
ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info' 
CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'));

-- Add tags for categorization
ALTER TABLE activity_logs
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_severity 
ON activity_logs(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_tags 
ON activity_logs USING GIN(tags);

-- ============================================================
-- 5. ENHANCE INVOICES TABLE
-- ============================================================

-- Add payment tracking
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_method TEXT,
ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}';

-- Add refund tracking
ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS refunded_amount_cents INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_invoices_payment_method 
ON invoices(payment_method);

CREATE INDEX IF NOT EXISTS idx_invoices_refunded 
ON invoices(refunded_at) WHERE refunded_at IS NOT NULL;

-- ============================================================
-- 6. ADD TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================

-- Update last_active_at on restaurant activity
CREATE OR REPLACE FUNCTION update_restaurant_last_active()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE restaurants
  SET last_active_at = NOW()
  WHERE id = NEW.restaurant_id;
  
  RETURN NEW;
END;
$$;

-- Trigger on orders
DROP TRIGGER IF EXISTS trigger_update_restaurant_last_active_orders ON orders;
CREATE TRIGGER trigger_update_restaurant_last_active_orders
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION update_restaurant_last_active();

-- Trigger on menu_items
DROP TRIGGER IF EXISTS trigger_update_restaurant_last_active_menu ON menu_items;
CREATE TRIGGER trigger_update_restaurant_last_active_menu
AFTER INSERT OR UPDATE ON menu_items
FOR EACH ROW
EXECUTE FUNCTION update_restaurant_last_active();

-- ============================================================
-- 7. ADD HELPER VIEWS
-- ============================================================

-- View: Restaurant Health Score
CREATE OR REPLACE VIEW restaurant_health_scores AS
SELECT 
  r.id,
  r.name,
  r.status,
  r.last_active_at,
  s.status as subscription_status,
  sp.name as plan_name,
  COUNT(DISTINCT o.id) as total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') as orders_last_30_days,
  COUNT(DISTINCT ur.user_id) as staff_count,
  CASE 
    WHEN r.status != 'active' THEN 0
    WHEN s.status != 'active' THEN 20
    WHEN r.last_active_at < NOW() - INTERVAL '30 days' THEN 40
    WHEN COUNT(DISTINCT o.id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') = 0 THEN 50
    WHEN COUNT(DISTINCT o.id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') < 10 THEN 70
    ELSE 100
  END as health_score
FROM restaurants r
LEFT JOIN subscriptions s ON s.restaurant_id = r.id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN orders o ON o.restaurant_id = r.id
LEFT JOIN user_roles ur ON ur.restaurant_id = r.id
GROUP BY r.id, r.name, r.status, r.last_active_at, s.status, sp.name;

-- View: Platform Metrics
CREATE OR REPLACE VIEW platform_metrics AS
SELECT 
  COUNT(DISTINCT r.id) as total_restaurants,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'active') as active_restaurants,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'suspended') as suspended_restaurants,
  COUNT(DISTINCT r.id) FILTER (WHERE r.created_at > NOW() - INTERVAL '30 days') as new_restaurants_30d,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'active') as active_subscriptions,
  COUNT(DISTINCT o.id) as total_orders,
  COUNT(DISTINCT o.id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') as orders_30d,
  SUM(CASE 
    WHEN s.status = 'active' AND sp.billing_period = 'monthly' 
    THEN sp.price_cents 
    ELSE 0 
  END) as mrr_cents,
  COUNT(DISTINCT u.id) as total_users
FROM restaurants r
LEFT JOIN subscriptions s ON s.restaurant_id = r.id
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN orders o ON o.restaurant_id = r.id
LEFT JOIN user_roles ur ON ur.restaurant_id = r.id
LEFT JOIN auth.users u ON u.id = ur.user_id;

-- ============================================================
-- 8. UPDATE RLS POLICIES FOR ENHANCED COLUMNS
-- ============================================================

-- Super admin can update restaurant status
DROP POLICY IF EXISTS restaurants_super_admin_update_status ON restaurants;
CREATE POLICY restaurants_super_admin_update_status
ON restaurants FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN restaurants.status IS 'Restaurant account status (active, suspended, terminated, locked)';
COMMENT ON COLUMN restaurants.suspension_reason IS 'Reason for suspension if status is suspended';
COMMENT ON COLUMN restaurants.last_active_at IS 'Last time restaurant had any activity';
COMMENT ON COLUMN subscriptions.plan_id IS 'Reference to subscription plan';
COMMENT ON COLUMN subscriptions.is_manual_override IS 'Whether subscription was manually modified by super admin';
COMMENT ON COLUMN subscriptions.discount_percent IS 'Discount percentage applied to subscription';
COMMENT ON VIEW restaurant_health_scores IS 'Calculated health score for each restaurant based on activity and status';
COMMENT ON VIEW platform_metrics IS 'Platform-wide metrics and KPIs';
