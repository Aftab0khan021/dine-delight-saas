-- 1. Remove the "Public Insert" policy from Orders
-- This stops hackers from bypassing your Edge Function.
DROP POLICY IF EXISTS "orders_public_insert_pending" ON public.orders;

-- 2. Remove the "Public Insert" policy from Order Items
DROP POLICY IF EXISTS "order_items_public_insert" ON public.order_items;

-- 3. Verify Admin Access still exists (Optional but recommended)
-- This ensures your Edge Function (Service Role) and Admins can still work.
-- (No action needed usually, as Service Role bypasses all policies automatically).