-- =============================================================================
-- Harden RLS for orders & order_items
-- =============================================================================
-- Context:
--  - 20260209020000_fix_public_orders_rls.sql introduced very permissive
--    SELECT policies (`USING (true)`) for anon + authenticated users on
--    public.orders and public.order_items.
--  - That allowed any client to read ALL orders and order items, which is
--    a serious data leak and breaks tenant isolation.
--
-- Goal of this migration:
--  - Remove the public SELECT policies for anon / authenticated.
--  - Keep public INSERT behaviour for orders/order_items where needed for
--    anonymous ordering (while we migrate clients to use the secure
--    place-order Edge Function).
--  - Re‑establish tenant‑scoped SELECT policies for authenticated users
--    using public.has_restaurant_access().
--  - Rely on Edge Functions using the service role (order-lookup, place-order)
--    when anonymous read access is required (e.g. tracking an order by token).
-- =============================================================================

-- Ensure RLS is enabled
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 1. Clean up overly-permissive public policies
-- -----------------------------------------------------------------------------

-- Orders: remove anonymous / global SELECT policy
DROP POLICY IF EXISTS "Public users can view orders" ON public.orders;

-- Order items: remove anonymous / global SELECT policy
DROP POLICY IF EXISTS "Public users can view order items" ON public.order_items;

-- NOTE: We intentionally keep existing INSERT policies that allow anon /
-- authenticated users to create orders + order_items (from
-- 20260209000000_fix_orders_rls_authenticated.sql and
-- 20260209020000_fix_public_orders_rls.sql) to avoid breaking the current
-- public ordering flow. Once all clients are migrated to use the
-- place-order Edge Function exclusively, these INSERT policies can be
-- further tightened or removed.

-- -----------------------------------------------------------------------------
-- 2. Tenant-scoped SELECT for authenticated users
-- -----------------------------------------------------------------------------

-- Allow authenticated users to view orders ONLY for restaurants they have
-- explicit access to (restaurant_admin or super_admin for that restaurant).
DROP POLICY IF EXISTS orders_tenant_select ON public.orders;
CREATE POLICY orders_tenant_select
ON public.orders
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_access(auth.uid(), restaurant_id)
);

COMMENT ON POLICY orders_tenant_select ON public.orders IS
  'Authenticated users can read orders only for restaurants they administer (via has_restaurant_access).';

-- Allow authenticated users to view order items ONLY for restaurants they
-- have access to. This aligns with the orders policy above.
DROP POLICY IF EXISTS order_items_tenant_select ON public.order_items;
CREATE POLICY order_items_tenant_select
ON public.order_items
FOR SELECT
TO authenticated
USING (
  public.has_restaurant_access(auth.uid(), restaurant_id)
);

COMMENT ON POLICY order_items_tenant_select ON public.order_items IS
  'Authenticated users can read order_items only for restaurants they administer (via has_restaurant_access).';

