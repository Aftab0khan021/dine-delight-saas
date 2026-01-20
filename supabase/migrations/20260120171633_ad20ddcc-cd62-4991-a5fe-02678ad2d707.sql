-- Add a secure-ish opaque token to support anonymous order lookup
-- Uses a random hex string. Stored in DB so we can look orders up without auth.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_token text;

-- Backfill existing rows
UPDATE public.orders
SET order_token = COALESCE(order_token, encode(gen_random_bytes(16), 'hex'))
WHERE order_token IS NULL;

-- Enforce presence + uniqueness
ALTER TABLE public.orders
  ALTER COLUMN order_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_token_key
  ON public.orders(order_token);

-- Optional: speed up lookups for staff too (already covered by unique index)

-- Ensure future inserts get a token automatically
ALTER TABLE public.orders
  ALTER COLUMN order_token SET DEFAULT encode(gen_random_bytes(16), 'hex');
