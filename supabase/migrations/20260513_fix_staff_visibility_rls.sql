-- ============================================================================
-- EMERGENCY ROLLBACK: Drop the self-referencing RLS policies that broke access
-- The policies query user_roles inside user_roles RLS → infinite recursion
-- ============================================================================

-- 1. Drop the broken policies immediately
DROP POLICY IF EXISTS "Admins can view restaurant staff roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update restaurant staff roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete restaurant staff roles" ON public.user_roles;

-- 2. Ensure the safe original policies still exist
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 3. Safe approach: use a SECURITY DEFINER helper function to check admin status
-- This function bypasses RLS, so no recursion
CREATE OR REPLACE FUNCTION public.is_restaurant_admin(p_user_id UUID, p_restaurant_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id
    AND restaurant_id = p_restaurant_id
    AND role = 'restaurant_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. Now create safe RLS policies using the helper function (no self-reference)
CREATE POLICY "Admins can view restaurant staff roles"
  ON public.user_roles FOR SELECT
  USING (public.is_restaurant_admin(auth.uid(), restaurant_id));

CREATE POLICY "Admins can update restaurant staff roles"
  ON public.user_roles FOR UPDATE
  USING (public.is_restaurant_admin(auth.uid(), restaurant_id));

CREATE POLICY "Admins can delete restaurant staff roles"
  ON public.user_roles FOR DELETE
  USING (public.is_restaurant_admin(auth.uid(), restaurant_id));
