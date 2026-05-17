-- =============================================================================
-- Fix: has_restaurant_access — Support parent-child cloud kitchen hierarchy
-- =============================================================================
-- Problem:
--   The existing has_restaurant_access() only checks if the user has a
--   user_roles entry for the EXACT restaurant_id. When orders are placed
--   against child brands (e.g. via the public menu), the admin's user_roles
--   points to the PARENT restaurant. This causes RLS to block SELECT on
--   child-brand orders, making them invisible on the Orders page.
--
-- Fix:
--   Also check if the queried restaurant's parent_kitchen_id matches any
--   restaurant the user has access to. This allows a parent-kitchen admin
--   to see orders from all child brands.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.has_restaurant_access(_user_id UUID, _restaurant_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND ur.role IN ('restaurant_admin', 'super_admin')
    AND (
      -- Direct access: user has role for this exact restaurant
      ur.restaurant_id = _restaurant_id
      OR
      -- Parent access: user has role for the parent kitchen of this restaurant
      ur.restaurant_id = (
        SELECT r.parent_kitchen_id
        FROM public.restaurants r
        WHERE r.id = _restaurant_id
      )
    )
  )
$$;

COMMENT ON FUNCTION public.has_restaurant_access IS
  'Check if user has admin/super_admin access to a restaurant. Also grants access if the user administers the parent cloud kitchen of the target restaurant.';
