-- =============================================================================
-- Add missing permissions for all enabled features
-- So staff categories can assign granular access to every feature
-- =============================================================================

-- Inventory Management
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_inventory', 'View Inventory', 'Can view ingredient stock levels and inventory dashboard', 'inventory'),
  (gen_random_uuid(), 'manage_inventory', 'Manage Inventory', 'Can add/edit/delete ingredients and adjust stock levels', 'inventory')
ON CONFLICT (code) DO NOTHING;

-- Kitchen Display
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_kitchen', 'View Kitchen Board', 'Can view the kitchen order display board', 'kitchen'),
  (gen_random_uuid(), 'manage_kitchen', 'Manage Kitchen Orders', 'Can update order status on the kitchen board', 'kitchen')
ON CONFLICT (code) DO NOTHING;

-- Reservations
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_reservations', 'View Reservations', 'Can view table reservation bookings', 'reservations'),
  (gen_random_uuid(), 'manage_reservations', 'Manage Reservations', 'Can confirm, decline, or modify reservations', 'reservations')
ON CONFLICT (code) DO NOTHING;

-- Reviews
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_reviews', 'View Reviews', 'Can view customer reviews and ratings', 'reviews'),
  (gen_random_uuid(), 'manage_reviews', 'Manage Reviews', 'Can respond to or flag customer reviews', 'reviews')
ON CONFLICT (code) DO NOTHING;

-- Customer Management
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_customers', 'View Customers', 'Can view customer profiles and order history', 'customers'),
  (gen_random_uuid(), 'manage_customers', 'Manage Customers', 'Can edit customer data and manage loyalty points', 'customers')
ON CONFLICT (code) DO NOTHING;

-- Delivery Zones
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_delivery_zones', 'View Delivery Zones', 'Can view delivery areas and pricing', 'delivery'),
  (gen_random_uuid(), 'manage_delivery_zones', 'Manage Delivery Zones', 'Can create/edit/delete delivery zones and pricing', 'delivery')
ON CONFLICT (code) DO NOTHING;

-- WhatsApp / Marketing
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_marketing', 'View Marketing', 'Can view WhatsApp campaigns and delivery stats', 'marketing'),
  (gen_random_uuid(), 'manage_marketing', 'Manage Marketing', 'Can create and send WhatsApp marketing campaigns', 'marketing')
ON CONFLICT (code) DO NOTHING;

-- Developer API
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_api', 'View API Keys', 'Can view API keys and webhook configurations', 'developer'),
  (gen_random_uuid(), 'manage_api', 'Manage API Access', 'Can create/revoke API keys and manage webhooks', 'developer')
ON CONFLICT (code) DO NOTHING;

-- Branding
INSERT INTO permissions (id, code, name, description, category)
VALUES
  (gen_random_uuid(), 'view_branding', 'View Branding', 'Can view restaurant branding and theme settings', 'branding'),
  (gen_random_uuid(), 'manage_branding', 'Manage Branding', 'Can edit restaurant logo, colors, and theme', 'branding')
ON CONFLICT (code) DO NOTHING;
