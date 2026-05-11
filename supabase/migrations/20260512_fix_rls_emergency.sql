-- ============================================================================
-- EMERGENCY FIX: Revert the problematic RLS policies from 20260512_self_heal_admin_role.sql
-- The self-referencing SELECT policy on user_roles caused infinite recursion
-- ============================================================================

-- 1. Drop the problematic policies that broke everything
DROP POLICY IF EXISTS "Restaurant admins can view restaurant roles" ON public.user_roles;
DROP POLICY IF EXISTS "Restaurant admins can insert roles" ON public.user_roles;

-- 2. Ensure the original policies are intact
-- Re-create them in case they were somehow affected
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admins can manage all roles" ON public.user_roles;
CREATE POLICY "Super admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- 3. Keep the self_heal_admin_role RPC (it's SECURITY DEFINER so it bypasses RLS)
-- No changes needed for it.
