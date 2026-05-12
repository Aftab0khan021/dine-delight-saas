-- ============================================================================
-- FIX: get_restaurant_staff — allow staff members with view_staff permission
-- Also ensures the function works correctly when called by restaurant admins
-- ============================================================================

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
      -- Restaurant admin for this restaurant
      (ur.restaurant_id = p_restaurant_id AND ur.role = 'restaurant_admin')
      -- Super admin
      OR ur.role = 'super_admin'
      -- Staff member with view_staff permission via their staff category
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

COMMENT ON FUNCTION public.get_restaurant_staff IS 'Returns all staff members for a restaurant with profile and category info. Accessible by admins and staff with view_staff permission.';
