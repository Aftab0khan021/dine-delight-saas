-- =============================================================
-- Fix: Super Admin cannot see profiles in relational queries
-- =============================================================
-- PROBLEM:
--   The profiles RLS (from fix_rls_security.sql) restricts SELECT to:
--   - Own profile (profiles_view_own)
--   - Coworkers in the same restaurant (profiles_view_coworkers)
--   
--   Missing: super_admin bypass. This causes PostgREST joins like
--   restaurants → user_roles → profiles(email) to return NULL for
--   the profiles columns, making the Restaurants page appear empty.
--
-- FIX: Add a super_admin SELECT policy on profiles.
-- =============================================================

-- Super admins can view ALL profiles
DROP POLICY IF EXISTS profiles_super_admin_select ON public.profiles;
CREATE POLICY profiles_super_admin_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
);
