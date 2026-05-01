-- Fix #9: Relax CHECK constraint on staff_invites.role
-- The old constraint only allowed 'restaurant_admin' and 'user', but when
-- staff categories are used, the role field may hold a category ID or 'staff'.
-- We drop the constraint entirely since the role is validated at the application layer.

ALTER TABLE public.staff_invites DROP CONSTRAINT IF EXISTS staff_invites_role_allowed;

-- Fix #12: Update handle_new_user trigger to use created_by from invitation_tokens
-- as the actor_user_id in activity_logs, providing accurate audit trail.

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
  v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
  v_role := NEW.raw_user_meta_data->>'role';
  v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;
  
  -- Try to find who invited this user (for activity log accuracy)
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
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'active')
    ON CONFLICT (id) DO NOTHING;
    
    IF v_role IS NULL OR v_role = '' THEN
      v_role := 'user';
    END IF;
    
    INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
    VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id);
    
    -- Fix #12: Use the inviter as actor_user_id for accurate audit trail
    INSERT INTO public.activity_logs (restaurant_id, entity_type, entity_id, action, message, actor_user_id)
    VALUES (
      v_restaurant_id,
      'user_role',
      NEW.id,
      'staff_invited_accepted',
      'New staff member joined: ' || COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Unknown'),
      COALESCE(v_invited_by, NEW.id)
    );
  ELSE
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'pending')
    ON CONFLICT (id) DO NOTHING;
    
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'restaurant_admin');
  END IF;
  
  RETURN NEW;
END;
$$;
