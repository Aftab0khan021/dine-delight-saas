-- ============================================================================
-- FIX: staff_categories and category_permissions RLS policies
-- 
-- The existing policies reference user_roles which itself has RLS.
-- Replace with is_restaurant_admin() SECURITY DEFINER helper to avoid issues.
-- ============================================================================

-- ── staff_categories policies ──

DROP POLICY IF EXISTS "Restaurant admins can create categories" ON public.staff_categories;
CREATE POLICY "Restaurant admins can create categories"
  ON public.staff_categories FOR INSERT
  WITH CHECK (public.is_restaurant_admin(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Restaurant admins can update categories" ON public.staff_categories;
CREATE POLICY "Restaurant admins can update categories"
  ON public.staff_categories FOR UPDATE
  USING (public.is_restaurant_admin(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS "Restaurant admins can delete non-default categories" ON public.staff_categories;
CREATE POLICY "Restaurant admins can delete non-default categories"
  ON public.staff_categories FOR DELETE
  USING (is_default = false AND public.is_restaurant_admin(auth.uid(), restaurant_id));

-- ── category_permissions policies ──

-- Helper: check if a category belongs to a restaurant the user admins
CREATE OR REPLACE FUNCTION public.is_admin_of_category(p_user_id UUID, p_category_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_categories sc
    JOIN public.user_roles ur ON ur.restaurant_id = sc.restaurant_id
    WHERE sc.id = p_category_id
    AND ur.user_id = p_user_id
    AND ur.role = 'restaurant_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Restaurant admins can manage category permissions" ON public.category_permissions;
CREATE POLICY "Restaurant admins can manage category permissions"
  ON public.category_permissions FOR ALL
  USING (public.is_admin_of_category(auth.uid(), category_id));

-- Also fix the SELECT policy
DROP POLICY IF EXISTS "Users can view category permissions" ON public.category_permissions;
CREATE POLICY "Users can view category permissions"
  ON public.category_permissions FOR SELECT
  USING (
    category_id IN (
      SELECT id FROM public.staff_categories
      WHERE public.is_restaurant_admin(auth.uid(), restaurant_id)
         OR restaurant_id IN (
              SELECT restaurant_id FROM public.user_roles
              WHERE user_id = auth.uid()
            )
    )
  );
