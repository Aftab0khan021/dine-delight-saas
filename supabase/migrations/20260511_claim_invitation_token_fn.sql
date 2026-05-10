-- ============================================================================
-- FIX: Create a SECURITY DEFINER function to claim invitation tokens
-- ============================================================================
-- The RLS policies on invitation_tokens are too restrictive for the UPDATE
-- operation from the client side. Using a SECURITY DEFINER function bypasses
-- RLS entirely and is the correct pattern for token-based operations.

CREATE OR REPLACE FUNCTION public.claim_invitation_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- Atomically claim the token: only succeeds if unused and not expired
  UPDATE invitation_tokens
  SET used_at = NOW()
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > NOW()
  RETURNING * INTO v_record;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Token not found, expired, or already used');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'id', v_record.id,
    'email', v_record.email,
    'restaurant_id', v_record.restaurant_id,
    'staff_category_id', v_record.staff_category_id,
    'role', v_record.role
  );
END;
$$;

-- Allow both anon and authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.claim_invitation_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.claim_invitation_token(TEXT) TO authenticated;

COMMENT ON FUNCTION public.claim_invitation_token IS 'Atomically claims an invitation token. Returns token data on success, error on failure.';
