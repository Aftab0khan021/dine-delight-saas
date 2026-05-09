-- Announcements table for super admin → restaurant admin communication
CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  priority text NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'critical')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements (is_active, created_at DESC);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active announcements
CREATE POLICY "Anyone can read active announcements"
  ON announcements FOR SELECT USING (is_active = true);

-- Only super admins can manage announcements
CREATE POLICY "Super admins manage announcements"
  ON announcements FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Audit log table for tracking all admin actions
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  user_email text,
  restaurant_id uuid REFERENCES restaurants(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'approve', 'reject', 'suspend', 'restore')),
  entity_type text NOT NULL,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  description text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant ON audit_log (restaurant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only super admins can read audit logs
CREATE POLICY "Super admins read audit log"
  ON audit_log FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Service role inserts (or super admins)
CREATE POLICY "Super admins insert audit log"
  ON audit_log FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Platform config for white-label
CREATE TABLE IF NOT EXISTS platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read platform config"
  ON platform_config FOR SELECT USING (true);

CREATE POLICY "Super admins manage platform config"
  ON platform_config FOR ALL
  USING (public.has_role(auth.uid(), 'super_admin'));

-- Delivery zones
CREATE TABLE IF NOT EXISTS delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  radius_km numeric(6,2) NOT NULL DEFAULT 5,
  delivery_charge_cents integer NOT NULL DEFAULT 0,
  min_order_cents integer NOT NULL DEFAULT 0,
  est_time_mins integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_restaurant ON delivery_zones (restaurant_id, is_active);

ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active delivery zones"
  ON delivery_zones FOR SELECT USING (is_active = true);

CREATE POLICY "Admin manages delivery zones"
  ON delivery_zones FOR ALL
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM user_roles
      WHERE user_id = auth.uid() AND role = 'restaurant_admin'::app_role
    )
  );

-- Menu enhancements: sold_out, allergens, translations, schedule
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_sold_out boolean DEFAULT false;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS allergens text[] DEFAULT '{}';
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS translations jsonb DEFAULT '{}';

ALTER TABLE categories ADD COLUMN IF NOT EXISTS available_from time;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS available_until time;
