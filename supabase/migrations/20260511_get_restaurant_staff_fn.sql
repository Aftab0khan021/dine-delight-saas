-- ============================================================================
-- RPC: get_restaurant_staff
-- Returns all staff members for a restaurant, bypassing RLS issues
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
  -- Only allow restaurant admins or super admins to call this
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND (
      (user_roles.restaurant_id = p_restaurant_id AND user_roles.role = 'restaurant_admin')
      OR user_roles.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'Access denied: you must be a restaurant admin';
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
  ORDER BY ur.role ASC, p.full_name ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_restaurant_staff IS 'Returns all staff members for a restaurant with profile and category info. Bypasses RLS for admins.';
