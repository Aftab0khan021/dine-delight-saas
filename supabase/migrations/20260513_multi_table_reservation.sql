
-- Add table_ids array column (keeps backward compat with existing table_id)
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS table_ids UUID[] DEFAULT '{}';

-- Backfill existing single table_id into the array
UPDATE public.reservations
  SET table_ids = ARRAY[table_id]
  WHERE table_id IS NOT NULL AND (table_ids IS NULL OR table_ids = '{}');

-- Index for looking up reservations by any table in the array
CREATE INDEX IF NOT EXISTS idx_reservations_table_ids
  ON public.reservations USING GIN (table_ids);
