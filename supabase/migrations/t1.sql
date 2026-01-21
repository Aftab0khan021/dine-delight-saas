-- Allow anonymous guests to place orders (insert only) while keeping admin access.

-- ORDERS
DROP POLICY IF EXISTS orders_insert_access ON public.orders;

-- Keep existing SELECT/UPDATE/DELETE admin policies as-is; add a public INSERT policy.
CREATE POLICY orders_public_insert_pending
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND status = 'pending'
  AND tax_cents = 0
  AND tip_cents = 0
  AND subtotal_cents >= 0
  AND total_cents = subtotal_cents
  AND currency_code = 'USD'
);

-- ORDER ITEMS
DROP POLICY IF EXISTS order_items_write_access ON public.order_items;

-- Recreate admin full access (matches previous behavior)
CREATE POLICY order_items_admin_all
ON public.order_items
FOR ALL
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

-- Public can insert line items (no updates/deletes/selects)
CREATE POLICY order_items_public_insert
ON public.order_items
FOR INSERT
TO anon, authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND order_id IS NOT NULL
  AND quantity > 0
  AND unit_price_cents >= 0
  AND line_total_cents = unit_price_cents * quantity
  AND name_snapshot <> ''
);
