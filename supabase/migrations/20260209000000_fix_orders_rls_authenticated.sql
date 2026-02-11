-- Fix RLS policy for orders table to allow authenticated users to place orders
-- Issue: 403 Forbidden when authenticated users try to insert orders
-- Root cause: Missing or misconfigured INSERT policy for authenticated role

-- Drop existing policy if it exists
DROP POLICY IF EXISTS orders_public_insert_pending ON public.orders;

-- Recreate policy to allow both anonymous and authenticated users to insert pending orders
CREATE POLICY orders_public_insert_pending
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (
  restaurant_id IS NOT NULL
  AND status = 'pending'
  AND tax_cents = 0
  AND tip_cents = 0
  AND discount_cents >= 0
  AND subtotal_cents >= 0
  AND total_cents >= 0
  AND currency_code IS NOT NULL
);

-- Add comment for documentation
COMMENT ON POLICY orders_public_insert_pending ON public.orders IS 
  'Allow public users (both anonymous and authenticated) to insert pending orders with basic validation';
