-- Plan-Based Feature Management
-- This migration adds support for automatic feature control based on subscription plans

-- =====================================================
-- FUNCTION: Check if a feature is enabled for a restaurant
-- =====================================================
-- Priority: Override > Plan > Global > Default

CREATE OR REPLACE FUNCTION is_feature_enabled_for_restaurant(
  p_restaurant_id UUID,
  p_feature_key TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_enabled BOOLEAN;
  v_plan_features JSONB;
BEGIN
  -- 1. Check restaurant-specific override (highest priority)
  SELECT is_enabled INTO v_enabled
  FROM restaurant_features
  WHERE restaurant_id = p_restaurant_id
    AND feature_key = p_feature_key;
  
  IF FOUND THEN
    RETURN v_enabled;
  END IF;

  -- 2. Check subscription plan features
  SELECT sp.features INTO v_plan_features
  FROM subscriptions s
  JOIN subscription_plans sp ON sp.id = s.plan_id
  WHERE s.restaurant_id = p_restaurant_id
    AND s.status = 'active'
  LIMIT 1;

  IF FOUND AND v_plan_features ? p_feature_key THEN
    RETURN (v_plan_features->p_feature_key)::BOOLEAN;
  END IF;

  -- 3. Check global feature flag
  SELECT is_enabled INTO v_enabled
  FROM feature_flags
  WHERE key = p_feature_key;
  
  IF FOUND THEN
    RETURN v_enabled;
  END IF;

  -- 4. Default to false
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION is_feature_enabled_for_restaurant(UUID, TEXT) TO authenticated;

-- =====================================================
-- VIEW: Restaurant Feature Access Matrix
-- =====================================================
-- Shows all features for all restaurants with their access status and source

CREATE OR REPLACE VIEW restaurant_feature_access AS
SELECT 
  r.id AS restaurant_id,
  r.name AS restaurant_name,
  r.slug AS restaurant_slug,
  ff.id AS feature_flag_id,
  ff.key AS feature_key,
  ff.name AS feature_name,
  ff.description AS feature_description,
  s.id AS subscription_id,
  sp.name AS plan_name,
  COALESCE(
    rf.is_enabled,  -- Restaurant override
    (sp.features->ff.key)::BOOLEAN,  -- Plan feature
    ff.is_enabled,  -- Global flag
    FALSE  -- Default
  ) AS is_enabled,
  CASE 
    WHEN rf.is_enabled IS NOT NULL THEN 'override'
    WHEN sp.features ? ff.key THEN 'plan'
    WHEN ff.is_enabled IS NOT NULL THEN 'global'
    ELSE 'default'
  END AS source,
  rf.config AS override_config,
  sp.features->ff.key AS plan_config
FROM restaurants r
CROSS JOIN feature_flags ff
LEFT JOIN subscriptions s ON s.restaurant_id = r.id AND s.status = 'active'
LEFT JOIN subscription_plans sp ON sp.id = s.plan_id
LEFT JOIN restaurant_features rf ON rf.restaurant_id = r.id AND rf.feature_key = ff.key
WHERE r.status = 'active';

-- Grant select permission
GRANT SELECT ON restaurant_feature_access TO authenticated;

-- =====================================================
-- FUNCTION: Get feature limit for a restaurant
-- =====================================================
-- Returns numeric limits from plan features (e.g., staff_limit)

CREATE OR REPLACE FUNCTION get_feature_limit_for_restaurant(
  p_restaurant_id UUID,
  p_feature_key TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_limit INTEGER;
  v_plan_features JSONB;
  v_override_config JSONB;
BEGIN
  -- 1. Check restaurant-specific override
  SELECT config INTO v_override_config
  FROM restaurant_features
  WHERE restaurant_id = p_restaurant_id
    AND feature_key = p_feature_key
    AND is_enabled = TRUE;
  
  IF FOUND AND v_override_config ? 'limit' THEN
    RETURN (v_override_config->>'limit')::INTEGER;
  END IF;

  -- 2. Check subscription plan features
  SELECT sp.features INTO v_plan_features
  FROM subscriptions s
  JOIN subscription_plans sp ON sp.id = s.plan_id
  WHERE s.restaurant_id = p_restaurant_id
    AND s.status = 'active'
  LIMIT 1;

  IF FOUND AND v_plan_features ? p_feature_key THEN
    v_limit := (v_plan_features->>p_feature_key)::INTEGER;
    IF v_limit IS NOT NULL THEN
      RETURN v_limit;
    END IF;
  END IF;

  -- 3. Default limit
  RETURN 0;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_feature_limit_for_restaurant(UUID, TEXT) TO authenticated;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON FUNCTION is_feature_enabled_for_restaurant IS 
'Checks if a feature is enabled for a restaurant based on override > plan > global > default priority';

COMMENT ON FUNCTION get_feature_limit_for_restaurant IS 
'Returns numeric limit for a feature (e.g., staff_limit) from plan or override';

COMMENT ON VIEW restaurant_feature_access IS 
'Shows feature access status for all restaurants with source attribution';
