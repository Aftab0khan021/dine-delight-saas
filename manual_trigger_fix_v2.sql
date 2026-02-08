-- ============================================================================
-- FIXED: Auto-create user_roles entry when user accepts invite
-- ============================================================================
-- This version has better error handling and won't block user creation
-- Run this in Supabase SQL Editor to REPLACE the previous version

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
  -- Wrap everything in exception handling to prevent blocking user creation
  BEGIN
    -- Extract metadata from the new user
    v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
    v_role := NEW.raw_user_meta_data->>'role';
    v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;

    -- Only create user_roles entry if restaurant_id is present (invited user)
    IF v_restaurant_id IS NOT NULL THEN
      -- Default role to 'user' if not specified
      IF v_role IS NULL OR v_role = '' THEN
        v_role := 'user';
      END IF;

      -- Validate role is a valid enum value
      IF v_role NOT IN ('user', 'restaurant_admin', 'super_admin') THEN
        v_role := 'user';
      END IF;

      -- Insert into user_roles
      INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
      VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id)
      ON CONFLICT (user_id, restaurant_id) DO UPDATE
      SET 
        role = EXCLUDED.role,
        staff_category_id = EXCLUDED.staff_category_id,
        updated_at = now();

      -- Log the action (with error handling)
      BEGIN
        INSERT INTO public.activity_logs (
          restaurant_id,
          entity_type,
          entity_id,
          action,
          message,
          actor_user_id
        ) VALUES (
          v_restaurant_id,
          'user_role',
          NEW.id,
          'staff_invited_accepted',
          'New staff member joined: ' || COALESCE(NEW.email, 'Unknown'),
          NEW.id
        );
      EXCEPTION WHEN OTHERS THEN
        -- Silently ignore logging errors
        NULL;
      END;
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't block user creation
    RAISE WARNING 'Failed to create user_roles for user %: %', NEW.id, SQLERRM;
  END;

  -- Always return NEW to allow user creation to proceed
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created_handle_invite ON auth.users;

-- Create trigger that fires when a new user is created
CREATE TRIGGER on_auth_user_created_handle_invite
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_invited_user();

COMMENT ON FUNCTION public.handle_invited_user() IS 'Automatically creates user_roles entry when user accepts invite (with error handling)';
