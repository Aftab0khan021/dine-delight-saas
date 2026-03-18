-- Harden invitation_tokens RLS and update protections

-- Ensure RLS is enabled and enforced
ALTER TABLE public.invitation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitation_tokens FORCE ROW LEVEL SECURITY;

-- Replace broad update policy with a stricter one:
-- - Only unused, unexpired tokens can be updated
DROP POLICY IF EXISTS "Service role can update tokens" ON public.invitation_tokens;

CREATE POLICY "Tokens updatable only when valid"
  ON public.invitation_tokens
  FOR UPDATE
  USING (
    used_at IS NULL
    AND expires_at > NOW()
  );

-- Trigger to ensure non-service clients can ONLY mark tokens as used,
-- and cannot modify other columns.
CREATE OR REPLACE FUNCTION public.protect_invitation_tokens_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := '';
  v_claims jsonb;
BEGIN
  -- Extract JWT role if available (Supabase sets this)
  BEGIN
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
    v_role := COALESCE(v_claims->>'role', '');
  EXCEPTION
    WHEN others THEN
      v_role := '';
  END;

  -- Service role is trusted and can perform arbitrary updates.
  IF v_role <> 'service_role' THEN
    -- For non-service roles, only allow transitioning used_at
    -- from NULL to a non-NULL value while keeping all other
    -- columns identical.
    IF NOT (
      OLD.used_at IS NULL
      AND NEW.used_at IS NOT NULL
      AND OLD.email = NEW.email
      AND OLD.token = NEW.token
      AND OLD.restaurant_id = NEW.restaurant_id
      AND OLD.staff_category_id IS NOT DISTINCT FROM NEW.staff_category_id
      AND OLD.role = NEW.role
      AND OLD.expires_at = NEW.expires_at
      AND OLD.created_at = NEW.created_at
      AND OLD.created_by IS NOT DISTINCT FROM NEW.created_by
    ) THEN
      RAISE EXCEPTION 'Unauthorized invitation token update';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_update_invitation_tokens_protect ON public.invitation_tokens;

CREATE TRIGGER before_update_invitation_tokens_protect
  BEFORE UPDATE ON public.invitation_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_invitation_tokens_update();

