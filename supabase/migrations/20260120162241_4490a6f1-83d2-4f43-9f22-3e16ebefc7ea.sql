-- Allow restaurant admins to manage staff within their own restaurant
-- (Required for /admin/staff UI to list and update user roles)

-- Ensure RLS is enabled (should already be, but safe)
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Restaurant admins can view roles for their restaurant
CREATE POLICY "restaurant_admin_select_restaurant_roles"
ON public.user_roles
FOR SELECT
USING (
  restaurant_id IS NOT NULL
  AND has_restaurant_access(auth.uid(), restaurant_id)
);

-- Restaurant admins can add roles for their restaurant (but never super_admin)
CREATE POLICY "restaurant_admin_insert_restaurant_roles"
ON public.user_roles
FOR INSERT
WITH CHECK (
  restaurant_id IS NOT NULL
  AND has_restaurant_access(auth.uid(), restaurant_id)
  AND role IN ('restaurant_admin', 'user')
);

-- Restaurant admins can update roles for their restaurant (but never to super_admin)
CREATE POLICY "restaurant_admin_update_restaurant_roles"
ON public.user_roles
FOR UPDATE
USING (
  restaurant_id IS NOT NULL
  AND has_restaurant_access(auth.uid(), restaurant_id)
)
WITH CHECK (
  restaurant_id IS NOT NULL
  AND has_restaurant_access(auth.uid(), restaurant_id)
  AND role IN ('restaurant_admin', 'user')
);

-- Restaurant admins can remove roles for their restaurant
CREATE POLICY "restaurant_admin_delete_restaurant_roles"
ON public.user_roles
FOR DELETE
USING (
  restaurant_id IS NOT NULL
  AND has_restaurant_access(auth.uid(), restaurant_id)
);
