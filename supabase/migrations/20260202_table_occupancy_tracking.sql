-- ============================================================
-- Table Occupancy Tracking System
-- Migration: Add table session management to prevent order collisions
-- ============================================================

-- Table sessions to track which tables are currently occupied
CREATE TABLE IF NOT EXISTS public.table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_label TEXT NOT NULL,
  session_token UUID NOT NULL DEFAULT gen_random_uuid(),
  occupied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT table_sessions_table_label_nonempty CHECK (length(trim(table_label)) > 0)
);

-- Index for active sessions lookup
CREATE INDEX IF NOT EXISTS table_sessions_active_idx 
ON public.table_sessions (restaurant_id, table_label, released_at) 
WHERE released_at IS NULL;

-- Index for session token lookup
CREATE UNIQUE INDEX IF NOT EXISTS table_sessions_token_idx 
ON public.table_sessions (session_token);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS tr_table_sessions_updated_at ON public.table_sessions;
CREATE TRIGGER tr_table_sessions_updated_at 
BEFORE UPDATE ON public.table_sessions 
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies
ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

-- Public can read their own session (via session_token)
DROP POLICY IF EXISTS "table_sessions_public_select" ON public.table_sessions;
CREATE POLICY "table_sessions_public_select" 
ON public.table_sessions FOR SELECT TO anon, authenticated
USING (true); -- Allow reading to check occupancy

-- Only admins can manage sessions
DROP POLICY IF EXISTS "table_sessions_admin_manage" ON public.table_sessions;
CREATE POLICY "table_sessions_admin_manage" 
ON public.table_sessions FOR ALL TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id)) 
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Function to acquire table lock
CREATE OR REPLACE FUNCTION public.acquire_table_session(
  p_restaurant_id UUID,
  p_table_label TEXT
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_session RECORD;
  v_new_session RECORD;
  v_timeout_minutes INTEGER := 120; -- 2 hours
BEGIN
  -- Check for existing active session
  SELECT * INTO v_existing_session
  FROM public.table_sessions
  WHERE restaurant_id = p_restaurant_id
    AND table_label = p_table_label
    AND released_at IS NULL
    AND occupied_at > (now() - (v_timeout_minutes || ' minutes')::INTERVAL)
  FOR UPDATE;

  -- If table is occupied, return error
  IF v_existing_session.id IS NOT NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Table is currently occupied',
      'occupied_since', v_existing_session.occupied_at
    );
  END IF;

  -- Create new session
  INSERT INTO public.table_sessions (restaurant_id, table_label)
  VALUES (p_restaurant_id, p_table_label)
  RETURNING * INTO v_new_session;

  RETURN json_build_object(
    'success', true,
    'session_token', v_new_session.session_token,
    'session_id', v_new_session.id
  );
END;
$$;

-- Function to release table lock
CREATE OR REPLACE FUNCTION public.release_table_session(
  p_session_token UUID
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session RECORD;
BEGIN
  -- Find and release session
  UPDATE public.table_sessions
  SET released_at = now()
  WHERE session_token = p_session_token
    AND released_at IS NULL
  RETURNING * INTO v_session;

  IF v_session.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Session not found or already released');
  END IF;

  RETURN json_build_object('success', true, 'session_id', v_session.id);
END;
$$;

-- Auto-release old sessions (cleanup function)
CREATE OR REPLACE FUNCTION public.cleanup_expired_table_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.table_sessions
  SET released_at = now()
  WHERE released_at IS NULL
    AND occupied_at < (now() - INTERVAL '2 hours')
  RETURNING COUNT(*) INTO v_count;

  RETURN COALESCE(v_count, 0);
END;
$$;

COMMENT ON TABLE public.table_sessions IS 'Tracks table occupancy to prevent order collisions';
COMMENT ON FUNCTION public.acquire_table_session IS 'Acquires a table lock for ordering, returns session token';
COMMENT ON FUNCTION public.release_table_session IS 'Releases a table lock after order completion';
COMMENT ON FUNCTION public.cleanup_expired_table_sessions IS 'Auto-releases sessions older than 2 hours';
