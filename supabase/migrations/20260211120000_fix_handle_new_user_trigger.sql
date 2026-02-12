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
BEGIN
  v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
  v_role := NEW.raw_user_meta_data->>'role';
  v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;
  
  IF v_restaurant_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'active')
    ON CONFLICT (id) DO NOTHING;
    
    IF v_role IS NULL OR v_role = '' THEN
      v_role := 'user';
    END IF;
    
    -- FIXED: Removed ON CONFLICT
    INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
    VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id);
    
    INSERT INTO public.activity_logs (restaurant_id, entity_type, entity_id, action, message, actor_user_id)
    VALUES (v_restaurant_id, 'user_role', NEW.id, 'staff_invited_accepted', 'New staff member joined: ' || COALESCE(NEW.email, 'Unknown'), NEW.id);
  ELSE
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'pending')
    ON CONFLICT (id) DO NOTHING;
    
    -- FIXED: Removed ON CONFLICT
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'restaurant_admin');
  END IF;
  
  RETURN NEW;
END;
$$;