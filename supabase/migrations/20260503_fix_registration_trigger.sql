-- =============================================================
-- Fix: "Database error saving new user" + Staff Invite Flow
-- Applied: 2026-05-03
-- =============================================================

-- 1. Fix CHECK constraint on profiles.account_status
--    The original constraint only allowed ('active', 'disabled', 'suspended')
--    but the approval flow needs 'pending' and 'denied'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active', 'disabled', 'suspended', 'pending', 'denied'));

-- 2. Drop the duplicate trigger that causes double-insert conflicts
DROP TRIGGER IF EXISTS on_auth_user_created_handle_invite ON auth.users;
DROP FUNCTION IF EXISTS public.handle_invited_user();

-- 3. Ensure RLS allows authenticated users to upsert their own profile
--    (needed for the frontend defensive profile creation)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- 4. Rewrite handle_new_user with proper type cast and defensive inserts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_role TEXT;
  v_staff_category_id UUID;
  v_invited_by UUID;
BEGIN
  -- Extract metadata
  v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
  v_role := NEW.raw_user_meta_data->>'role';
  v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;

  -- Try to find who invited this user (for audit trail)
  BEGIN
    SELECT created_by INTO v_invited_by
    FROM public.invitation_tokens
    WHERE email = NEW.email
      AND restaurant_id = v_restaurant_id
    ORDER BY created_at DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_invited_by := NULL;
  END;

  IF v_restaurant_id IS NOT NULL THEN
    -- ===== INVITED STAFF FLOW =====
    -- User was invited to a specific restaurant
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'active')
    ON CONFLICT (id) DO UPDATE SET
      full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
      account_status = 'active';

    IF v_role IS NULL OR v_role = '' THEN
      v_role := 'user';
    END IF;

    -- FIX: Use app_role (not user_role) and ON CONFLICT to prevent duplicates
    INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
    VALUES (NEW.id, v_restaurant_id, v_role::app_role, v_staff_category_id)
    ON CONFLICT (user_id, role, restaurant_id) DO UPDATE SET
      staff_category_id = EXCLUDED.staff_category_id;

    -- Audit log
    BEGIN
      INSERT INTO public.activity_logs (restaurant_id, entity_type, entity_id, action, message, actor_user_id)
      VALUES (
        v_restaurant_id,
        'user_role',
        NEW.id,
        'staff_invited_accepted',
        'New staff member joined: ' || COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Unknown'),
        COALESCE(v_invited_by, NEW.id)
      );
    EXCEPTION WHEN OTHERS THEN
      -- Don't fail signup if activity log insert fails
      NULL;
    END;
  ELSE
    -- ===== NORMAL SIGNUP FLOW =====
    -- Regular signup or restaurant admin signup (no restaurant yet)
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), 'pending')
    ON CONFLICT (id) DO NOTHING;

    -- Do NOT auto-assign restaurant_admin role here.
    -- The role is assigned when the super admin approves the request.
    -- This prevents orphaned roles with no restaurant_id.
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- CRITICAL: Never let the trigger crash signup entirely.
  -- If anything fails, still return NEW so the auth.users row is created.
  RAISE WARNING 'handle_new_user trigger failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
