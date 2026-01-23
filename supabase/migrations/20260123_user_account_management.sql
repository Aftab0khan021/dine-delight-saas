-- User Account Management System
-- Migration: Add account status tracking to profiles

-- ============================================================
-- 1. ADD ACCOUNT STATUS COLUMNS TO PROFILES
-- ============================================================

-- Add account status column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'active' 
  CHECK (account_status IN ('active', 'disabled', 'suspended'));

-- Add disabled tracking columns
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS disabled_at TIMESTAMPTZ;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS disabled_reason TEXT;

ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS disabled_by UUID REFERENCES auth.users(id);

-- Create index for filtering disabled accounts
CREATE INDEX IF NOT EXISTS idx_profiles_account_status 
ON profiles(account_status) 
WHERE account_status != 'active';

-- ============================================================
-- 2. UPDATE RLS POLICIES
-- ============================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS profiles_disabled_users_cannot_access ON profiles;

-- Prevent disabled users from accessing the system
-- But allow super admins to view all profiles
CREATE POLICY profiles_disabled_users_cannot_access
ON profiles FOR ALL
TO authenticated
USING (
  account_status = 'active' OR 
  id = auth.uid() OR 
  public.has_role(auth.uid(), 'super_admin')
)
WITH CHECK (
  account_status = 'active' OR 
  id = auth.uid() OR 
  public.has_role(auth.uid(), 'super_admin')
);

-- ============================================================
-- 3. HELPER FUNCTIONS
-- ============================================================

-- Function to disable user account
CREATE OR REPLACE FUNCTION disable_user_account(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Only super admins can disable accounts
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: Super admin access required';
  END IF;

  -- Update the profile
  UPDATE profiles
  SET 
    account_status = 'disabled',
    disabled_at = NOW(),
    disabled_reason = p_reason,
    disabled_by = auth.uid()
  WHERE id = p_user_id
    AND account_status != 'disabled';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Log the action
  IF v_updated_count > 0 THEN
    PERFORM log_super_admin_action(
      'user_account_disabled',
      'profile',
      p_user_id,
      NULL,
      NULL,
      jsonb_build_object(
        'reason', p_reason,
        'disabled_by', auth.uid()
      )
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to enable user account
CREATE OR REPLACE FUNCTION enable_user_account(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Only super admins can enable accounts
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Forbidden: Super admin access required';
  END IF;

  -- Update the profile
  UPDATE profiles
  SET 
    account_status = 'active',
    disabled_at = NULL,
    disabled_reason = NULL,
    disabled_by = NULL
  WHERE id = p_user_id
    AND account_status = 'disabled';
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Log the action
  IF v_updated_count > 0 THEN
    PERFORM log_super_admin_action(
      'user_account_enabled',
      'profile',
      p_user_id,
      NULL,
      NULL,
      jsonb_build_object('enabled_by', auth.uid())
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON COLUMN profiles.account_status IS 'Account status: active, disabled, or suspended';
COMMENT ON COLUMN profiles.disabled_at IS 'When the account was disabled';
COMMENT ON COLUMN profiles.disabled_reason IS 'Reason for disabling the account';
COMMENT ON COLUMN profiles.disabled_by IS 'Super admin who disabled the account';

COMMENT ON FUNCTION disable_user_account IS 'Disable a user account (super admin only)';
COMMENT ON FUNCTION enable_user_account IS 'Enable a disabled user account (super admin only)';
