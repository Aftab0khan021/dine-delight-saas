-- =============================================================
-- Reservations system for Dine Delight SaaS
-- =============================================================

-- Restaurant tables (physical tables in the restaurant)
CREATE TABLE IF NOT EXISTS public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  label TEXT NOT NULL,               -- e.g. "Table 1", "Patio A"
  capacity INT NOT NULL DEFAULT 4,   -- max seats
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (restaurant_id, label)
);

-- Reservations
CREATE TABLE IF NOT EXISTS public.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  party_size INT NOT NULL DEFAULT 2,
  reservation_date DATE NOT NULL,
  reservation_time TIME NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 90,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reservations_restaurant_date
  ON public.reservations (restaurant_id, reservation_date, status);

CREATE INDEX IF NOT EXISTS idx_reservations_table
  ON public.reservations (table_id, reservation_date);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_restaurant
  ON public.restaurant_tables (restaurant_id);

-- Updated_at trigger
DROP TRIGGER IF EXISTS tr_reservations_updated_at ON public.reservations;
CREATE TRIGGER tr_reservations_updated_at
  BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

-- Restaurant admins can manage their tables
DROP POLICY IF EXISTS restaurant_tables_admin ON public.restaurant_tables;
CREATE POLICY restaurant_tables_admin ON public.restaurant_tables
  FOR ALL TO authenticated
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- Restaurant admins can manage reservations
DROP POLICY IF EXISTS reservations_admin ON public.reservations;
CREATE POLICY reservations_admin ON public.reservations
  FOR ALL TO authenticated
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- Public can create reservations (for the booking form)
DROP POLICY IF EXISTS reservations_public_insert ON public.reservations;
CREATE POLICY reservations_public_insert ON public.reservations
  FOR INSERT TO anon
  WITH CHECK (true);

-- Public can read their own reservation by ID (for confirmation)
DROP POLICY IF EXISTS reservations_public_read ON public.reservations;
CREATE POLICY reservations_public_read ON public.reservations
  FOR SELECT TO anon
  USING (true);
