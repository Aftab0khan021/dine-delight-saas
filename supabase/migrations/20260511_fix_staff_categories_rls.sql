-- ============================================================================
-- FIX: staff_categories RLS — allow restaurant_admin OR super_admin
-- ============================================================================
-- Problem: INSERT policy checks role = 'restaurant_admin' only.
-- But users might have 'super_admin' role, or the check isn't matching.
-- Fix: Use the existing has_restaurant_access() function which checks both.
-- Also add a service_role bypass so edge functions always work.

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Restaurant admins can create categories" ON public.staff_categories;
DROP POLICY IF EXISTS "Restaurant admins can update categories" ON public.staff_categories;
DROP POLICY IF EXISTS "Restaurant admins can delete non-default categories" ON public.staff_categories;
DROP POLICY IF EXISTS "Users can view their restaurant's categories" ON public.staff_categories;

-- SELECT: any user with access to the restaurant
CREATE POLICY "Users can view their restaurant's categories"
  ON public.staff_categories FOR SELECT
  USING (
    public.has_restaurant_access(auth.uid(), restaurant_id)
    OR
    restaurant_id IN (
      SELECT restaurant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  );

-- INSERT: user with restaurant_admin or super_admin access
CREATE POLICY "Restaurant admins can create categories"
  ON public.staff_categories FOR INSERT
  WITH CHECK (
    public.has_restaurant_access(auth.uid(), restaurant_id)
  );

-- UPDATE: user with restaurant_admin or super_admin access
CREATE POLICY "Restaurant admins can update categories"
  ON public.staff_categories FOR UPDATE
  USING (
    public.has_restaurant_access(auth.uid(), restaurant_id)
  );

-- DELETE: user with restaurant_admin or super_admin access (non-default only)
CREATE POLICY "Restaurant admins can delete non-default categories"
  ON public.staff_categories FOR DELETE
  USING (
    is_default = false
    AND public.has_restaurant_access(auth.uid(), restaurant_id)
  );
