-- Tighten RLS: no public reads for orders/order_items; only allow public inserts.
-- Admins retain access via has_restaurant_access(auth.uid(), restaurant_id).

-- Ensure RLS is enabled & forced
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

-- ORDERS: replace admin policies to explicitly scope to authenticated
DROP POLICY IF EXISTS orders_select_access ON public.orders;
CREATE POLICY orders_select_access
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS orders_update_access ON public.orders;
CREATE POLICY orders_update_access
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS orders_delete_admin ON public.orders;
CREATE POLICY orders_delete_admin
ON public.orders
FOR DELETE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Keep: orders_public_insert_pending (TO anon, authenticated)

-- ORDER_ITEMS: replace admin/select policies to explicitly scope to authenticated
DROP POLICY IF EXISTS order_items_select_access ON public.order_items;
CREATE POLICY order_items_select_access
ON public.order_items
FOR SELECT
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS order_items_admin_all ON public.order_items;
CREATE POLICY order_items_admin_all
ON public.order_items
FOR ALL
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Keep: order_items_public_insert (TO anon, authenticated)
