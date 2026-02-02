-- ============================================================================
-- RBAC System: Staff Categories & Permissions
-- ============================================================================
-- This migration creates a comprehensive role-based access control system
-- allowing restaurant admins to create custom staff categories (manager, chef, 
-- waiter, etc.) and assign granular permissions to each category.

-- ============================================================================
-- 1. PERMISSIONS TABLE
-- ============================================================================
-- System-wide permission definitions that can be assigned to staff categories

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL, -- 'orders', 'menu', 'staff', 'analytics', 'settings'
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.permissions IS 'System-wide permission definitions';
COMMENT ON COLUMN public.permissions.code IS 'Unique permission code (e.g., view_orders, manage_menu)';
COMMENT ON COLUMN public.permissions.category IS 'Permission category for grouping in UI';

-- ============================================================================
-- 2. STAFF CATEGORIES TABLE
-- ============================================================================
-- Restaurant-specific staff categories with custom names and colors

CREATE TABLE IF NOT EXISTS public.staff_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6366f1', -- Hex color for UI badges
  is_default BOOLEAN DEFAULT false, -- Default categories cannot be deleted
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(restaurant_id, name)
);

COMMENT ON TABLE public.staff_categories IS 'Restaurant-specific staff categories (manager, chef, waiter, etc.)';
COMMENT ON COLUMN public.staff_categories.is_default IS 'Default categories cannot be deleted, only modified';

CREATE INDEX IF NOT EXISTS staff_categories_restaurant_idx ON public.staff_categories(restaurant_id);

-- ============================================================================
-- 3. CATEGORY PERMISSIONS JUNCTION TABLE
-- ============================================================================
-- Links staff categories to their assigned permissions

CREATE TABLE IF NOT EXISTS public.category_permissions (
  category_id UUID NOT NULL REFERENCES public.staff_categories(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  PRIMARY KEY (category_id, permission_id)
);

COMMENT ON TABLE public.category_permissions IS 'Junction table linking staff categories to permissions';

CREATE INDEX IF NOT EXISTS category_permissions_category_idx ON public.category_permissions(category_id);
CREATE INDEX IF NOT EXISTS category_permissions_permission_idx ON public.category_permissions(permission_id);

-- ============================================================================
-- 4. UPDATE USER_ROLES TABLE
-- ============================================================================
-- Add staff_category_id to link users to their staff category

ALTER TABLE public.user_roles 
ADD COLUMN IF NOT EXISTS staff_category_id UUID REFERENCES public.staff_categories(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.user_roles.staff_category_id IS 'Staff category assignment for granular permissions';

CREATE INDEX IF NOT EXISTS user_roles_category_idx ON public.user_roles(staff_category_id);

-- ============================================================================
-- 5. SEED DEFAULT PERMISSIONS
-- ============================================================================
-- Insert system-wide permissions that can be assigned to categories

INSERT INTO public.permissions (code, name, description, category) VALUES
  -- Orders
  ('view_orders', 'View Orders', 'Can view order list and details', 'orders'),
  ('manage_orders', 'Manage Orders', 'Can update order status and details', 'orders'),
  ('delete_orders', 'Delete Orders', 'Can delete orders', 'orders'),
  
  -- Menu
  ('view_menu', 'View Menu', 'Can view menu items and categories', 'menu'),
  ('edit_menu', 'Edit Menu', 'Can create, update, and delete menu items', 'menu'),
  ('manage_categories', 'Manage Categories', 'Can manage menu categories', 'menu'),
  
  -- Staff
  ('view_staff', 'View Staff', 'Can view staff list', 'staff'),
  ('manage_staff', 'Manage Staff', 'Can invite, edit, and remove staff members', 'staff'),
  ('manage_categories_staff', 'Manage Staff Categories', 'Can create and manage staff categories', 'staff'),
  
  -- Analytics
  ('view_analytics', 'View Analytics', 'Can view sales reports and analytics', 'analytics'),
  ('export_reports', 'Export Reports', 'Can export analytics reports', 'analytics'),
  
  -- Settings
  ('view_settings', 'View Settings', 'Can view restaurant settings', 'settings'),
  ('manage_settings', 'Manage Settings', 'Can update restaurant settings and branding', 'settings'),
  ('manage_billing', 'Manage Billing', 'Can view and manage billing and subscriptions', 'settings'),
  
  -- QR & Coupons
  ('view_qr', 'View QR Codes', 'Can view QR menu codes', 'menu'),
  ('manage_qr', 'Manage QR Codes', 'Can generate and manage QR codes', 'menu'),
  ('view_coupons', 'View Coupons', 'Can view coupon list', 'menu'),
  ('manage_coupons', 'Manage Coupons', 'Can create and manage coupons', 'menu')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 6. HELPER FUNCTION: Get User Permissions
-- ============================================================================
-- Function to retrieve all permissions for a user in a specific restaurant

CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id UUID,
  p_restaurant_id UUID
)
RETURNS TABLE(permission_code TEXT) AS $$
BEGIN
  -- Restaurant admins have all permissions
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND restaurant_id = p_restaurant_id
    AND role = 'restaurant_admin'
  ) THEN
    RETURN QUERY SELECT code FROM public.permissions;
  ELSE
    -- Staff members get permissions from their category
    RETURN QUERY
    SELECT p.code
    FROM public.user_roles ur
    JOIN public.category_permissions cp ON cp.category_id = ur.staff_category_id
    JOIN public.permissions p ON p.id = cp.permission_id
    WHERE ur.user_id = p_user_id 
    AND ur.restaurant_id = p_restaurant_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_user_permissions IS 'Returns all permission codes for a user in a restaurant';

-- ============================================================================
-- 7. HELPER FUNCTION: Check User Permission
-- ============================================================================
-- Function to check if a user has a specific permission

CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id UUID,
  p_restaurant_id UUID,
  p_permission_code TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.get_user_permissions(p_user_id, p_restaurant_id)
    WHERE permission_code = p_permission_code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.has_permission IS 'Checks if a user has a specific permission in a restaurant';

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.staff_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;

-- Permissions: Everyone can read (needed for UI)
CREATE POLICY "Anyone can view permissions"
  ON public.permissions FOR SELECT
  USING (true);

-- Staff Categories: Users can view categories for their restaurant
CREATE POLICY "Users can view their restaurant's categories"
  ON public.staff_categories FOR SELECT
  USING (
    restaurant_id IN (
      SELECT restaurant_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- Staff Categories: Only restaurant admins can insert
CREATE POLICY "Restaurant admins can create categories"
  ON public.staff_categories FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND restaurant_id = staff_categories.restaurant_id
      AND role = 'restaurant_admin'
    )
  );

-- Staff Categories: Only restaurant admins can update
CREATE POLICY "Restaurant admins can update categories"
  ON public.staff_categories FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND restaurant_id = staff_categories.restaurant_id
      AND role = 'restaurant_admin'
    )
  );

-- Staff Categories: Only restaurant admins can delete (non-default only)
CREATE POLICY "Restaurant admins can delete non-default categories"
  ON public.staff_categories FOR DELETE
  USING (
    is_default = false AND
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND restaurant_id = staff_categories.restaurant_id
      AND role = 'restaurant_admin'
    )
  );

-- Category Permissions: Users can view permissions for their restaurant's categories
CREATE POLICY "Users can view category permissions"
  ON public.category_permissions FOR SELECT
  USING (
    category_id IN (
      SELECT id FROM public.staff_categories
      WHERE restaurant_id IN (
        SELECT restaurant_id FROM public.user_roles
        WHERE user_id = auth.uid()
      )
    )
  );

-- Category Permissions: Only restaurant admins can manage
CREATE POLICY "Restaurant admins can manage category permissions"
  ON public.category_permissions FOR ALL
  USING (
    category_id IN (
      SELECT sc.id FROM public.staff_categories sc
      JOIN public.user_roles ur ON ur.restaurant_id = sc.restaurant_id
      WHERE ur.user_id = auth.uid()
      AND ur.role = 'restaurant_admin'
    )
  );

-- ============================================================================
-- 9. TRIGGER: Update timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_staff_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_staff_categories_timestamp
  BEFORE UPDATE ON public.staff_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_staff_categories_updated_at();
