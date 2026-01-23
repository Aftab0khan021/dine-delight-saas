-- Super Admin Impersonation System
-- Migration: Add impersonation sessions tracking and helper functions

-- ============================================================
-- 1. IMPERSONATION SESSIONS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  super_admin_id UUID NOT NULL REFERENCES auth.users(id),
  target_user_id UUID NOT NULL REFERENCES auth.users(id),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  is_read_only BOOLEAN DEFAULT true,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_super_admin 
ON impersonation_sessions(super_admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_target 
ON impersonation_sessions(target_user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_active 
ON impersonation_sessions(expires_at) 
WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_impersonation_sessions_token 
ON impersonation_sessions(session_token) 
WHERE ended_at IS NULL;

-- Enable RLS
ALTER TABLE impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Super admin can manage all impersonation sessions
CREATE POLICY impersonation_sessions_super_admin_all
ON impersonation_sessions FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Users can view their own impersonation sessions (when being impersonated)
CREATE POLICY impersonation_sessions_view_own
ON impersonation_sessions FOR SELECT
TO authenticated
USING (target_user_id = auth.uid());

-- ============================================================
-- 2. HELPER FUNCTIONS
-- ============================================================

-- Function to check if current user is being impersonated
CREATE OR REPLACE FUNCTION is_impersonating()
RETURNS TABLE(
  is_active BOOLEAN,
  session_id UUID,
  super_admin_id UUID,
  is_read_only BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    true as is_active,
    i.id as session_id,
    i.super_admin_id,
    i.is_read_only,
    i.expires_at
  FROM impersonation_sessions i
  WHERE i.target_user_id = auth.uid()
    AND i.ended_at IS NULL
    AND i.expires_at > NOW()
  LIMIT 1;
  
  -- If no active session found, return false
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::UUID, NULL::BOOLEAN, NULL::TIMESTAMPTZ;
  END IF;
END;
$$;

-- Function to get active impersonation session by token
CREATE OR REPLACE FUNCTION get_impersonation_session_by_token(p_token TEXT)
RETURNS TABLE(
  session_id UUID,
  super_admin_id UUID,
  target_user_id UUID,
  restaurant_id UUID,
  is_read_only BOOLEAN,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    i.id as session_id,
    i.super_admin_id,
    i.target_user_id,
    i.restaurant_id,
    i.is_read_only,
    i.expires_at
  FROM impersonation_sessions i
  WHERE i.session_token = p_token
    AND i.ended_at IS NULL
    AND i.expires_at > NOW()
  LIMIT 1;
END;
$$;

-- Function to end impersonation session
CREATE OR REPLACE FUNCTION end_impersonation_session(p_session_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Update the session to mark it as ended
  UPDATE impersonation_sessions
  SET ended_at = NOW()
  WHERE id = p_session_id
    AND ended_at IS NULL
    AND (super_admin_id = auth.uid() OR target_user_id = auth.uid());
  
  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  
  -- Log the end of impersonation
  IF v_updated_count > 0 THEN
    PERFORM log_super_admin_action(
      'impersonation_ended',
      'impersonation_session',
      p_session_id,
      NULL,
      NULL,
      jsonb_build_object('ended_by', auth.uid())
    );
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to clean up expired sessions (can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_expired_impersonation_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  UPDATE impersonation_sessions
  SET ended_at = NOW()
  WHERE ended_at IS NULL
    AND expires_at <= NOW();
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

-- ============================================================
-- 3. TRIGGERS
-- ============================================================

-- Trigger to log impersonation start in audit trail
CREATE OR REPLACE FUNCTION log_impersonation_start()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Log in super admin audit log
  PERFORM log_super_admin_action(
    'impersonation_started',
    'impersonation_session',
    NEW.id,
    NEW.restaurant_id,
    NULL,
    jsonb_build_object(
      'target_user_id', NEW.target_user_id,
      'is_read_only', NEW.is_read_only,
      'expires_at', NEW.expires_at
    )
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_log_impersonation_start ON impersonation_sessions;
CREATE TRIGGER trigger_log_impersonation_start
AFTER INSERT ON impersonation_sessions
FOR EACH ROW
EXECUTE FUNCTION log_impersonation_start();

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE impersonation_sessions IS 'Tracks super admin impersonation sessions for debugging and support';
COMMENT ON COLUMN impersonation_sessions.super_admin_id IS 'Super admin who initiated the impersonation';
COMMENT ON COLUMN impersonation_sessions.target_user_id IS 'User being impersonated';
COMMENT ON COLUMN impersonation_sessions.restaurant_id IS 'Restaurant context for impersonation';
COMMENT ON COLUMN impersonation_sessions.is_read_only IS 'If true, destructive actions are disabled';
COMMENT ON COLUMN impersonation_sessions.session_token IS 'Unique token for this impersonation session';
COMMENT ON COLUMN impersonation_sessions.expires_at IS 'When the session expires (default 1 hour)';
COMMENT ON COLUMN impersonation_sessions.ended_at IS 'When the session was manually ended (NULL if still active)';

COMMENT ON FUNCTION is_impersonating IS 'Check if current user is being impersonated';
COMMENT ON FUNCTION get_impersonation_session_by_token IS 'Get active impersonation session by token';
COMMENT ON FUNCTION end_impersonation_session IS 'End an active impersonation session';
COMMENT ON FUNCTION cleanup_expired_impersonation_sessions IS 'Clean up expired impersonation sessions';
