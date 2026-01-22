-- Add IP address column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS ip_address INET;

-- Add an index so checking spam is fast
CREATE INDEX IF NOT EXISTS idx_orders_ip_created 
ON public.orders (ip_address, created_at DESC);