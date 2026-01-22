-- ============================================================
-- RLS Security Fixes - Critical Vulnerabilities
-- ============================================================
-- This migration fixes critical security vulnerabilities by:
-- 1. Enabling RLS on unprotected tables
-- 2. Adding proper access control policies
-- 3. Restricting overly permissive policies
-- ============================================================

-- ============================================================
-- PHASE 1: CRITICAL TABLES (Immediate Security Fixes)
-- ============================================================

-- Fix 1: staff_invites - CRITICAL (No RLS at all)
-- ============================================================
ALTER TABLE public.staff_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_invites FORCE ROW LEVEL SECURITY;

-- Only admins of the restaurant can view/manage invites
DROP POLICY IF EXISTS staff_invites_admin_all ON public.staff_invites;
CREATE POLICY staff_invites_admin_all
ON public.staff_invites
FOR ALL
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));


-- Fix 2: activity_logs - CRITICAL (No RLS at all)
-- ============================================================
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

-- Admins can view logs for their restaurant
DROP POLICY IF EXISTS activity_logs_admin_select ON public.activity_logs;
CREATE POLICY activity_logs_admin_select
ON public.activity_logs
FOR SELECT
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));

-- System can INSERT (for logging) - any authenticated user can log
DROP POLICY IF EXISTS activity_logs_system_insert ON public.activity_logs;
CREATE POLICY activity_logs_system_insert
ON public.activity_logs
FOR INSERT
TO authenticated
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));


-- Fix 3: invoices - CRITICAL (No RLS at all)
-- ============================================================
-- Check if table exists first
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'invoices') THEN
    ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

    -- Only restaurant admins can view their invoices
    DROP POLICY IF EXISTS invoices_admin_select ON public.invoices;
    CREATE POLICY invoices_admin_select
    ON public.invoices
    FOR SELECT
    TO authenticated
    USING (public.has_restaurant_access(auth.uid(), restaurant_id));

    -- Only super admins can manage invoices
    DROP POLICY IF EXISTS invoices_super_admin_manage ON public.invoices;
    CREATE POLICY invoices_super_admin_manage
    ON public.invoices
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'super_admin'
      )
    );
  END IF;
END $$;


-- ============================================================
-- PHASE 2: MENU MANAGEMENT (Business Logic Protection)
-- ============================================================

-- Fix 4: menu_items - Add admin-only modification policies
-- ============================================================
DROP POLICY IF EXISTS menu_items_admin_insert ON public.menu_items;
CREATE POLICY menu_items_admin_insert
ON public.menu_items
FOR INSERT
TO authenticated
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS menu_items_admin_update ON public.menu_items;
CREATE POLICY menu_items_admin_update
ON public.menu_items
FOR UPDATE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS menu_items_admin_delete ON public.menu_items;
CREATE POLICY menu_items_admin_delete
ON public.menu_items
FOR DELETE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));


-- Fix 5: categories - Add admin-only modification policies
-- ============================================================
DROP POLICY IF EXISTS categories_admin_insert ON public.categories;
CREATE POLICY categories_admin_insert
ON public.categories
FOR INSERT
TO authenticated
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS categories_admin_update ON public.categories;
CREATE POLICY categories_admin_update
ON public.categories
FOR UPDATE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id))
WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));

DROP POLICY IF EXISTS categories_admin_delete ON public.categories;
CREATE POLICY categories_admin_delete
ON public.categories
FOR DELETE
TO authenticated
USING (public.has_restaurant_access(auth.uid(), restaurant_id));


-- ============================================================
-- PHASE 3: PRIVACY & QR CODES
-- ============================================================

-- Fix 6: profiles - Restrict overly permissive access
-- ============================================================
-- Replace "Users can view all profiles" with restricted access
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can view their own profile
DROP POLICY IF EXISTS profiles_view_own ON public.profiles;
CREATE POLICY profiles_view_own
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Restaurant staff can view coworkers
DROP POLICY IF EXISTS profiles_view_coworkers ON public.profiles;
CREATE POLICY profiles_view_coworkers
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur1
    JOIN public.user_roles ur2 ON ur1.restaurant_id = ur2.restaurant_id
    WHERE ur1.user_id = auth.uid() AND ur2.user_id = profiles.id
  )
);


-- Fix 7: qr_codes - Add RLS protection
-- ============================================================
-- Check if table exists first
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'qr_codes') THEN
    ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

    -- Public can read QR codes (needed for scanning)
    DROP POLICY IF EXISTS qr_codes_public_select ON public.qr_codes;
    CREATE POLICY qr_codes_public_select
    ON public.qr_codes
    FOR SELECT
    TO anon, authenticated
    USING (true);

    -- Only admins can manage QR codes
    DROP POLICY IF EXISTS qr_codes_admin_manage ON public.qr_codes;
    CREATE POLICY qr_codes_admin_manage
    ON public.qr_codes
    FOR ALL
    TO authenticated
    USING (public.has_restaurant_access(auth.uid(), restaurant_id))
    WITH CHECK (public.has_restaurant_access(auth.uid(), restaurant_id));
  END IF;
END $$;


-- ============================================================
-- VERIFICATION COMMENTS
-- ============================================================
-- After applying this migration:
-- 1. staff_invites: Only restaurant admins can access
-- 2. activity_logs: Only restaurant admins can view, authenticated can log
-- 3. invoices: Only restaurant admins can view, super admins can manage
-- 4. menu_items: Public can SELECT, only admins can INSERT/UPDATE/DELETE
-- 5. categories: Public can SELECT, only admins can INSERT/UPDATE/DELETE
-- 6. profiles: Users can view own + coworkers only
-- 7. qr_codes: Public can SELECT, only admins can manage
-- ============================================================
