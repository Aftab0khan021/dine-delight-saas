-- =============================================================
-- Fix: Allow all authenticated users to VIEW all feature flags
-- (not just enabled ones). The FeatureGate component needs to
-- check disabled flags too — they may be enabled via plan or override.
-- =============================================================

-- Drop the restrictive policy
DROP POLICY IF EXISTS feature_flags_view_enabled ON feature_flags;

-- Replace with: all authenticated users can see all feature flags
CREATE POLICY feature_flags_view_all
ON feature_flags FOR SELECT
TO authenticated
USING (true);
