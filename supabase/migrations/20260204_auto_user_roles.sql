-- ============================================================================
-- Auto-create user_roles entry when user accepts invite
-- ============================================================================
-- This trigger automatically creates a user_roles entry when a new user
-- is created via invite, using the metadata passed from the invite-staff function

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

    -- Insert into user_roles
    INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
    VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id)
    ON CONFLICT (user_id, restaurant_id) DO UPDATE
    SET 
      role = EXCLUDED.role,
      staff_category_id = EXCLUDED.staff_category_id,
      updated_at = now();

    -- Log the action
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
  END IF;

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

COMMENT ON FUNCTION public.handle_invited_user() IS 'Automatically creates user_roles entry when user accepts invite';
