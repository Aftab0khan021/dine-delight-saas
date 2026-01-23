-- Phase 7: Security & Compliance - Abuse Detection System
-- Migration: Add abuse detection, rate limiting, and whitelist tables

-- ============================================================
-- 1. ABUSE DETECTIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS abuse_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  pattern_type TEXT NOT NULL CHECK (
    pattern_type IN (
      'excessive_orders',
      'failed_payments',
      'rapid_creation',
      'menu_spam',
      'staff_churn',
      'qr_abuse'
    )
  ),
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (
    severity IN ('low', 'medium', 'high', 'critical')
  ),
  details JSONB DEFAULT '{}',
  threshold_value NUMERIC,
  actual_value NUMERIC,
  detected_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (
    status IN ('pending', 'investigating', 'resolved', 'false_positive')
  ),
  assigned_to UUID REFERENCES auth.users(id),
  notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_abuse_detections_restaurant 
ON abuse_detections(restaurant_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_detections_severity 
ON abuse_detections(severity, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_detections_status 
ON abuse_detections(status, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_detections_pattern 
ON abuse_detections(pattern_type, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_abuse_detections_assigned 
ON abuse_detections(assigned_to, status);

-- Enable RLS
ALTER TABLE abuse_detections ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all abuse detections
CREATE POLICY abuse_detections_super_admin_all
ON abuse_detections FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 2. RATE LIMIT VIOLATIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  endpoint TEXT,
  limit_type TEXT NOT NULL CHECK (
    limit_type IN (
      'requests_per_minute',
      'requests_per_hour',
      'concurrent_sessions',
      'data_export',
      'api_calls'
    )
  ),
  violation_count INTEGER DEFAULT 1,
  violated_at TIMESTAMPTZ DEFAULT NOW(),
  auto_banned BOOLEAN DEFAULT false,
  ban_expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_restaurant 
ON rate_limit_violations(restaurant_id, violated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_type 
ON rate_limit_violations(limit_type, violated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_banned 
ON rate_limit_violations(auto_banned, ban_expires_at) 
WHERE auto_banned = true;

-- Enable RLS
ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all rate limit violations
CREATE POLICY rate_limit_violations_super_admin_all
ON rate_limit_violations FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 3. ABUSE WHITELIST TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS abuse_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  whitelisted_by UUID NOT NULL REFERENCES auth.users(id),
  whitelisted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_abuse_whitelist_restaurant 
ON abuse_whitelist(restaurant_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_abuse_whitelist_expires 
ON abuse_whitelist(expires_at) WHERE is_active = true AND expires_at IS NOT NULL;

-- Enable RLS
ALTER TABLE abuse_whitelist ENABLE ROW LEVEL SECURITY;

-- Super admin can manage whitelist
CREATE POLICY abuse_whitelist_super_admin_all
ON abuse_whitelist FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- ============================================================
-- 4. HELPER FUNCTIONS
-- ============================================================

-- Function to check if restaurant is whitelisted
CREATE OR REPLACE FUNCTION is_whitelisted(p_restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_is_whitelisted BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1
    FROM abuse_whitelist
    WHERE restaurant_id = p_restaurant_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > NOW())
  ) INTO v_is_whitelisted;
  
  RETURN COALESCE(v_is_whitelisted, false);
END;
$$;

-- Function to create abuse detection record
CREATE OR REPLACE FUNCTION create_abuse_detection(
  p_restaurant_id UUID,
  p_pattern_type TEXT,
  p_severity TEXT,
  p_details JSONB DEFAULT '{}',
  p_threshold_value NUMERIC DEFAULT NULL,
  p_actual_value NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_detection_id UUID;
  v_is_whitelisted BOOLEAN;
BEGIN
  -- Check if restaurant is whitelisted
  v_is_whitelisted := is_whitelisted(p_restaurant_id);
  
  IF v_is_whitelisted THEN
    -- Don't create detection for whitelisted restaurants
    RETURN NULL;
  END IF;
  
  -- Create detection record
  INSERT INTO abuse_detections (
    restaurant_id,
    pattern_type,
    severity,
    details,
    threshold_value,
    actual_value
  ) VALUES (
    p_restaurant_id,
    p_pattern_type,
    p_severity,
    p_details,
    p_threshold_value,
    p_actual_value
  )
  RETURNING id INTO v_detection_id;
  
  -- Log in super admin audit
  PERFORM log_super_admin_action(
    'abuse_detection_created',
    'abuse_detection',
    v_detection_id,
    p_restaurant_id,
    NULL,
    jsonb_build_object(
      'pattern_type', p_pattern_type,
      'severity', p_severity,
      'actual_value', p_actual_value
    )
  );
  
  RETURN v_detection_id;
END;
$$;

-- ============================================================
-- 5. DETECTION FUNCTIONS
-- ============================================================

-- Detect excessive orders (>100 orders in 24 hours)
CREATE OR REPLACE FUNCTION detect_excessive_orders()
RETURNS TABLE(
  restaurant_id UUID,
  order_count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    o.restaurant_id,
    COUNT(o.id) as order_count,
    CASE 
      WHEN COUNT(o.id) >= 500 THEN 'critical'
      WHEN COUNT(o.id) >= 250 THEN 'high'
      WHEN COUNT(o.id) >= 100 THEN 'medium'
      ELSE 'low'
    END as severity
  FROM orders o
  WHERE o.placed_at >= NOW() - INTERVAL '24 hours'
    AND NOT is_whitelisted(o.restaurant_id)
  GROUP BY o.restaurant_id
  HAVING COUNT(o.id) >= 100
  ORDER BY COUNT(o.id) DESC;
END;
$$;

-- Detect menu spam (>50 menu item changes in 24 hours)
CREATE OR REPLACE FUNCTION detect_menu_spam()
RETURNS TABLE(
  restaurant_id UUID,
  change_count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.restaurant_id,
    COUNT(al.id) as change_count,
    CASE 
      WHEN COUNT(al.id) >= 200 THEN 'critical'
      WHEN COUNT(al.id) >= 100 THEN 'high'
      WHEN COUNT(al.id) >= 50 THEN 'medium'
      ELSE 'low'
    END as severity
  FROM activity_logs al
  WHERE al.created_at >= NOW() - INTERVAL '24 hours'
    AND al.entity_type = 'menu_item'
    AND al.action IN ('menu_item_created', 'menu_item_updated', 'menu_item_deleted')
    AND NOT is_whitelisted(al.restaurant_id)
  GROUP BY al.restaurant_id
  HAVING COUNT(al.id) >= 50
  ORDER BY COUNT(al.id) DESC;
END;
$$;

-- Detect staff churn (>10 staff changes in 7 days)
CREATE OR REPLACE FUNCTION detect_staff_churn()
RETURNS TABLE(
  restaurant_id UUID,
  staff_change_count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.restaurant_id,
    COUNT(al.id) as staff_change_count,
    CASE 
      WHEN COUNT(al.id) >= 30 THEN 'critical'
      WHEN COUNT(al.id) >= 20 THEN 'high'
      WHEN COUNT(al.id) >= 10 THEN 'medium'
      ELSE 'low'
    END as severity
  FROM activity_logs al
  WHERE al.created_at >= NOW() - INTERVAL '7 days'
    AND al.entity_type = 'user_role'
    AND al.action IN ('staff_invited', 'staff_removed', 'role_changed')
    AND NOT is_whitelisted(al.restaurant_id)
  GROUP BY al.restaurant_id
  HAVING COUNT(al.id) >= 10
  ORDER BY COUNT(al.id) DESC;
END;
$$;

-- Detect QR code abuse (>20 QR generations in 24 hours)
CREATE OR REPLACE FUNCTION detect_qr_abuse()
RETURNS TABLE(
  restaurant_id UUID,
  qr_generation_count BIGINT,
  severity TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    al.restaurant_id,
    COUNT(al.id) as qr_generation_count,
    CASE 
      WHEN COUNT(al.id) >= 100 THEN 'critical'
      WHEN COUNT(al.id) >= 50 THEN 'high'
      WHEN COUNT(al.id) >= 20 THEN 'medium'
      ELSE 'low'
    END as severity
  FROM activity_logs al
  WHERE al.created_at >= NOW() - INTERVAL '24 hours'
    AND al.entity_type = 'qr_code'
    AND al.action IN ('qr_generated', 'qr_regenerated')
    AND NOT is_whitelisted(al.restaurant_id)
  GROUP BY al.restaurant_id
  HAVING COUNT(al.id) >= 20
  ORDER BY COUNT(al.id) DESC;
END;
$$;

-- Detect rapid account creation (>4 restaurants from same IP in 5 minutes)
-- Note: This requires IP tracking in activity_logs or restaurants table
-- For now, we'll detect based on email domain similarity
CREATE OR REPLACE FUNCTION detect_rapid_creation()
RETURNS TABLE(
  email_domain TEXT,
  restaurant_count BIGINT,
  severity TEXT,
  restaurant_ids UUID[]
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH recent_restaurants AS (
    SELECT 
      r.id,
      r.created_at,
      SPLIT_PART(u.email, '@', 2) as email_domain
    FROM restaurants r
    JOIN user_roles ur ON ur.restaurant_id = r.id AND ur.role = 'owner'
    JOIN auth.users u ON u.id = ur.user_id
    WHERE r.created_at >= NOW() - INTERVAL '5 minutes'
  )
  SELECT 
    rr.email_domain,
    COUNT(rr.id) as restaurant_count,
    CASE 
      WHEN COUNT(rr.id) >= 10 THEN 'critical'
      WHEN COUNT(rr.id) >= 7 THEN 'high'
      WHEN COUNT(rr.id) >= 4 THEN 'medium'
      ELSE 'low'
    END as severity,
    ARRAY_AGG(rr.id) as restaurant_ids
  FROM recent_restaurants rr
  GROUP BY rr.email_domain
  HAVING COUNT(rr.id) >= 4
  ORDER BY COUNT(rr.id) DESC;
END;
$$;

-- Function to run all detection algorithms and create records
CREATE OR REPLACE FUNCTION run_all_abuse_detections()
RETURNS TABLE(
  pattern_type TEXT,
  detections_created INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_total INTEGER := 0;
BEGIN
  -- Detect excessive orders
  v_count := 0;
  INSERT INTO abuse_detections (restaurant_id, pattern_type, severity, threshold_value, actual_value, details)
  SELECT 
    eo.restaurant_id,
    'excessive_orders',
    eo.severity,
    100,
    eo.order_count,
    jsonb_build_object('order_count', eo.order_count, 'time_window', '24 hours')
  FROM detect_excessive_orders() eo;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'excessive_orders'::TEXT, v_count;
  
  -- Detect menu spam
  v_count := 0;
  INSERT INTO abuse_detections (restaurant_id, pattern_type, severity, threshold_value, actual_value, details)
  SELECT 
    ms.restaurant_id,
    'menu_spam',
    ms.severity,
    50,
    ms.change_count,
    jsonb_build_object('change_count', ms.change_count, 'time_window', '24 hours')
  FROM detect_menu_spam() ms;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'menu_spam'::TEXT, v_count;
  
  -- Detect staff churn
  v_count := 0;
  INSERT INTO abuse_detections (restaurant_id, pattern_type, severity, threshold_value, actual_value, details)
  SELECT 
    sc.restaurant_id,
    'staff_churn',
    sc.severity,
    10,
    sc.staff_change_count,
    jsonb_build_object('staff_change_count', sc.staff_change_count, 'time_window', '7 days')
  FROM detect_staff_churn() sc;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'staff_churn'::TEXT, v_count;
  
  -- Detect QR abuse
  v_count := 0;
  INSERT INTO abuse_detections (restaurant_id, pattern_type, severity, threshold_value, actual_value, details)
  SELECT 
    qa.restaurant_id,
    'qr_abuse',
    qa.severity,
    20,
    qa.qr_generation_count,
    jsonb_build_object('qr_generation_count', qa.qr_generation_count, 'time_window', '24 hours')
  FROM detect_qr_abuse() qa;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT 'qr_abuse'::TEXT, v_count;
  
  -- Note: Failed payments and rapid creation require additional data
  -- They can be implemented once payment tracking and IP logging are available
END;
$$;

-- ============================================================
-- 6. TRIGGERS
-- ============================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_abuse_detection_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_abuse_detections_updated_at ON abuse_detections;
CREATE TRIGGER trigger_abuse_detections_updated_at
BEFORE UPDATE ON abuse_detections
FOR EACH ROW
EXECUTE FUNCTION update_abuse_detection_timestamp();

DROP TRIGGER IF EXISTS trigger_abuse_whitelist_updated_at ON abuse_whitelist;
CREATE TRIGGER trigger_abuse_whitelist_updated_at
BEFORE UPDATE ON abuse_whitelist
FOR EACH ROW
EXECUTE FUNCTION update_abuse_detection_timestamp();

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE abuse_detections IS 'Tracks detected abuse patterns across restaurants';
COMMENT ON TABLE rate_limit_violations IS 'Tracks API rate limit violations';
COMMENT ON TABLE abuse_whitelist IS 'Restaurants excluded from abuse monitoring';

COMMENT ON COLUMN abuse_detections.pattern_type IS 'Type of abuse pattern detected';
COMMENT ON COLUMN abuse_detections.severity IS 'Severity level: low, medium, high, critical';
COMMENT ON COLUMN abuse_detections.status IS 'Investigation status: pending, investigating, resolved, false_positive';
COMMENT ON COLUMN abuse_detections.details IS 'Additional context about the detection';

COMMENT ON FUNCTION is_whitelisted IS 'Check if restaurant is whitelisted from abuse monitoring';
COMMENT ON FUNCTION create_abuse_detection IS 'Create a new abuse detection record with automatic whitelisting check';
COMMENT ON FUNCTION run_all_abuse_detections IS 'Run all detection algorithms and create records';
