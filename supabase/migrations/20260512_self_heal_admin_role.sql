-- ============================================================================
-- Self-healing RPC: Restore missing restaurant_admin role
-- ============================================================================
-- This function is called when a user has an approved restaurant_admin_request
-- but is missing their restaurant_admin role in user_roles.
-- It verifies the request exists and auto-inserts the missing role.

CREATE OR REPLACE FUNCTION public.self_heal_admin_role(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_request_exists BOOLEAN;
  v_role_exists BOOLEAN;
BEGIN
  -- 1. Verify the user has an approved restaurant_admin_requests entry
  SELECT EXISTS (
    SELECT 1 FROM public.restaurant_admin_requests
    WHERE user_id = p_user_id
    AND status = 'approved'
  ) INTO v_request_exists;

  IF NOT v_request_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'No approved admin request found');
  END IF;

  -- 2. Check if restaurant_admin role already exists
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND restaurant_id = p_restaurant_id
    AND role = 'restaurant_admin'
  ) INTO v_role_exists;

  IF v_role_exists THEN
    RETURN jsonb_build_object('success', true, 'message', 'Role already exists');
  END IF;

  -- 3. Insert the missing restaurant_admin role
  INSERT INTO public.user_roles (user_id, restaurant_id, role)
  VALUES (p_user_id, p_restaurant_id, 'restaurant_admin')
  ON CONFLICT (user_id, role, restaurant_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'message', 'Admin role restored');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.self_heal_admin_role IS 'Restores missing restaurant_admin role for users with approved admin requests';

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.self_heal_admin_role(UUID, UUID) TO authenticated;


-- ============================================================================
-- FIX: Add missing RLS policy for user_roles INSERT by restaurant admins
-- ============================================================================
-- Restaurant admins need to be able to manage roles for their restaurant

DO $$ BEGIN
  -- Drop if exists to avoid errors
  DROP POLICY IF EXISTS "Restaurant admins can insert roles" ON public.user_roles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Restaurant admins can insert roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow if the inserting user is a restaurant_admin for the same restaurant
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.restaurant_id = user_roles.restaurant_id
      AND ur.role = 'restaurant_admin'
    )
    -- OR if they have an approved admin request (for self-healing)
    OR EXISTS (
      SELECT 1 FROM public.restaurant_admin_requests rar
      WHERE rar.user_id = auth.uid()
      AND rar.status = 'approved'
      AND user_roles.user_id = auth.uid()
    )
  );

-- Also allow admins to view all roles in their restaurant (not just their own)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Restaurant admins can view restaurant roles" ON public.user_roles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Restaurant admins can view restaurant roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (
    -- Existing: users can see their own roles
    auth.uid() = user_id
    -- NEW: restaurant admins can see all roles in their restaurant
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.restaurant_id = user_roles.restaurant_id
      AND ur.role = 'restaurant_admin'
    )
  );
