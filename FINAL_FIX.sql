-- ============================================================================
-- FINAL FIX: Staff Invite System
-- ============================================================================
-- Run this ENTIRE script in Supabase SQL Editor

-- ============================================================================
-- 1. DROP OLD BROKEN TRIGGER (if exists)
-- ============================================================================
DROP TRIGGER IF EXISTS on_auth_user_created_handle_invite ON auth.users;
DROP FUNCTION IF EXISTS public.handle_invited_user();

-- ============================================================================
-- 2. CREATE WORKING TRIGGER WITH PROPER ERROR HANDLING
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_invited_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_restaurant_id UUID;
  v_role TEXT;
  v_staff_category_id UUID;
BEGIN
  -- Wrap in exception handler to prevent blocking user creation
  BEGIN
    -- Extract metadata
    v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
    v_role := NEW.raw_user_meta_data->>'role';
    v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;

    -- Only process if this is an invited user (has restaurant_id)
    IF v_restaurant_id IS NOT NULL THEN
      -- Default role to 'user' if not specified
      IF v_role IS NULL OR v_role = '' THEN
        v_role := 'user';
      END IF;

      -- Validate role is valid
      IF v_role NOT IN ('user', 'restaurant_admin', 'super_admin') THEN
        v_role := 'user';
      END IF;

      -- Insert user_roles entry
      INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
      VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id)
      ON CONFLICT (user_id, restaurant_id) DO UPDATE
      SET 
        role = EXCLUDED.role,
        staff_category_id = EXCLUDED.staff_category_id;

      -- Try to log activity (optional, won't fail if table doesn't exist)
      BEGIN
        INSERT INTO public.activity_logs (
          restaurant_id, entity_type, entity_id, action, message, actor_user_id
        ) VALUES (
          v_restaurant_id, 'user_role', NEW.id, 'staff_invited_accepted',
          'New staff member joined: ' || COALESCE(NEW.email, 'Unknown'), NEW.id
        );
      EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore logging errors
      END;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log error as warning but don't block user creation
    RAISE WARNING 'handle_invited_user failed for user %: %', NEW.id, SQLERRM;
  END;

  -- Always return NEW to allow user creation
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. CREATE TRIGGER
-- ============================================================================
CREATE TRIGGER on_auth_user_created_handle_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invited_user();

-- ============================================================================
-- 4. VERIFY SETUP
-- ============================================================================
SELECT 
  '✅ Setup Complete!' as status,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname = 'on_auth_user_created_handle_invite') as trigger_exists,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'handle_invited_user') as function_exists;
