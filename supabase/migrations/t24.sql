-- t23_enable_realtime.sql

-- 1. Enable Realtime on the orders table (if not already enabled)
alter publication supabase_realtime add table orders;

-- 2. Allow Public Users (Customers) to read orders
-- This is required for the Realtime subscription to receive events.
CREATE POLICY "Public Read Access"
ON public.orders FOR SELECT
TO anon
USING (true);