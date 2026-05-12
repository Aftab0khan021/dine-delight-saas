-- ============================================================================
-- FIX: Allow restaurant admins to see all staff in their restaurant
-- 
-- ROOT CAUSE: The user_roles table RLS policy only allows users to see
-- their own row (auth.uid() = user_id). Restaurant admins need to see
-- ALL staff members in their restaurant for the Staff Management page.
--
-- This migration:
-- 1. Adds a SELECT policy for restaurant admins to view their restaurant's roles
-- 2. Recreates get_restaurant_staff with the correct table name (category_permissions)
-- ============================================================================

-- 1. Add SELECT policy: restaurant admins can view all roles in their restaurant
DROP POLICY IF EXISTS "Admins can view restaurant staff roles" ON public.user_roles;
CREATE POLICY "Admins can view restaurant staff roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles admin_ur
      WHERE admin_ur.user_id = auth.uid()
      AND admin_ur.restaurant_id = user_roles.restaurant_id
      AND admin_ur.role = 'restaurant_admin'
    )
  );

-- 2. Add UPDATE policy: restaurant admins can update roles in their restaurant  
DROP POLICY IF EXISTS "Admins can update restaurant staff roles" ON public.user_roles;
CREATE POLICY "Admins can update restaurant staff roles"
  ON public.user_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles admin_ur
      WHERE admin_ur.user_id = auth.uid()
      AND admin_ur.restaurant_id = user_roles.restaurant_id
      AND admin_ur.role = 'restaurant_admin'
    )
  );

-- 3. Add DELETE policy: restaurant admins can remove staff from their restaurant
DROP POLICY IF EXISTS "Admins can delete restaurant staff roles" ON public.user_roles;
CREATE POLICY "Admins can delete restaurant staff roles"
  ON public.user_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles admin_ur
      WHERE admin_ur.user_id = auth.uid()
      AND admin_ur.restaurant_id = user_roles.restaurant_id
      AND admin_ur.role = 'restaurant_admin'
    )
  );

-- 4. Recreate get_restaurant_staff RPC with fixed table name
CREATE OR REPLACE FUNCTION public.get_restaurant_staff(p_restaurant_id UUID)
RETURNS TABLE(
  user_id UUID,
  role TEXT,
  staff_category_id UUID,
  full_name TEXT,
  email TEXT,
  category_name TEXT,
  category_color TEXT
) AS $$
BEGIN
  -- Allow restaurant admins, super admins, OR staff with view_staff permission
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.restaurant_id = p_restaurant_id AND ur.role = 'restaurant_admin')
      OR ur.role = 'super_admin'
      OR (
        ur.restaurant_id = p_restaurant_id 
        AND ur.role = 'user' 
        AND EXISTS (
          SELECT 1 FROM public.category_permissions scp
          JOIN public.permissions perm ON perm.id = scp.permission_id
          WHERE scp.category_id = ur.staff_category_id
          AND perm.code = 'view_staff'
        )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: insufficient permissions';
  END IF;

  RETURN QUERY
  SELECT 
    ur.user_id,
    ur.role::TEXT,
    ur.staff_category_id,
    COALESCE(p.full_name, '') AS full_name,
    COALESCE(p.email, '') AS email,
    sc.name AS category_name,
    sc.color AS category_color
  FROM public.user_roles ur
  LEFT JOIN public.profiles p ON p.id = ur.user_id
  LEFT JOIN public.staff_categories sc ON sc.id = ur.staff_category_id
  WHERE ur.restaurant_id = p_restaurant_id
  AND ur.role IN ('restaurant_admin', 'user')
  ORDER BY 
    CASE ur.role WHEN 'restaurant_admin' THEN 0 ELSE 1 END,
    p.full_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
