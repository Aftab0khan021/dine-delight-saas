-- Fix: Announcements RLS — allow super admins to see ALL announcements (including hidden)
-- Drop the old SELECT policy and recreate with super_admin bypass
DROP POLICY IF EXISTS "Anyone can read active announcements" ON announcements;

CREATE POLICY "Read announcements"
  ON announcements FOR SELECT
  USING (
    is_active = true 
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- Fix: Platform config — allow super admins full CRUD (the existing policy only allows SELECT for everyone)
-- The ALL policy already handles insert/update/delete for super admins
-- No changes needed for platform_config
