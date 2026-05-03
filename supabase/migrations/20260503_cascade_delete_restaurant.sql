-- =============================================================
-- Cascade Delete: When restaurant creator is deleted, clean up
-- everything related to their restaurant.
-- =============================================================
-- 
-- CHAIN:
--   1. Super admin deletes user from auth.users
--   2. profiles row deleted (auth.users → profiles ON DELETE CASCADE)
--   3. user_roles rows deleted (profiles → user_roles ON DELETE CASCADE)
--   4. THIS TRIGGER fires on user_roles DELETE
--   5. If deleted role = 'restaurant_admin', delete the restaurant
--   6. Restaurant deletion cascades to ALL child tables:
--      categories, menu_items, orders, order_items, staff_invites,
--      qr_codes, subscriptions, invoices, activity_logs, coupons,
--      menu_item_variants, menu_item_addons, whatsapp_customers,
--      whatsapp_conversations, whatsapp_messages, whatsapp_orders,
--      staff_categories, category_permissions, restaurant_api_keys,
--      notification_queue, nlp_parse_cache, restaurant_features,
--      restaurant_tables, reservations, api_keys, webhook_endpoints,
--      webhook_deliveries, table_sessions, order_item_pairs,
--      whatsapp_campaigns, invitation_tokens, abuse_reports,
--      rate_limit_overrides, ip_blocklist
--
-- SAFETY:
--   - Only fires for 'restaurant_admin' role deletions
--   - Only deletes restaurants with NO other restaurant_admin users
--   - error_logs, super_admin_audit_log, impersonation_sessions
--     have nullable restaurant_id refs — they are NOT deleted
--     (SET NULL or no cascade) to preserve audit history
-- =============================================================

-- 1. Fix the 3 FK constraints that would BLOCK restaurant deletion
--    (change from RESTRICT/NO ACTION to CASCADE or SET NULL)

-- error_logs.restaurant_id → SET NULL (preserve error history)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%error_logs%restaurant%'
    AND table_name = 'error_logs'
  ) THEN
    ALTER TABLE public.error_logs
      DROP CONSTRAINT IF EXISTS error_logs_restaurant_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.error_logs
  ADD CONSTRAINT error_logs_restaurant_id_fkey
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id)
  ON DELETE SET NULL;

-- super_admin_audit_log.restaurant_id → SET NULL (preserve audit trail)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%super_admin_audit%restaurant%'
    AND table_name = 'super_admin_audit_log'
  ) THEN
    ALTER TABLE public.super_admin_audit_log
      DROP CONSTRAINT IF EXISTS super_admin_audit_log_restaurant_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.super_admin_audit_log
  ADD CONSTRAINT super_admin_audit_log_restaurant_id_fkey
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id)
  ON DELETE SET NULL;

-- impersonation_sessions.restaurant_id → CASCADE (session is meaningless without restaurant)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name LIKE '%impersonation%restaurant%'
    AND table_name = 'impersonation_sessions'
  ) THEN
    ALTER TABLE public.impersonation_sessions
      DROP CONSTRAINT IF EXISTS impersonation_sessions_restaurant_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER TABLE public.impersonation_sessions
  ADD CONSTRAINT impersonation_sessions_restaurant_id_fkey
  FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id)
  ON DELETE CASCADE;


-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.cascade_delete_restaurant_on_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining_admins INTEGER;
BEGIN
  -- Only act when a restaurant_admin role is deleted
  IF OLD.role != 'restaurant_admin' THEN
    RETURN OLD;
  END IF;

  -- Only act if a restaurant_id was linked
  IF OLD.restaurant_id IS NULL THEN
    RETURN OLD;
  END IF;

  -- Check if there are OTHER restaurant_admin users for this restaurant
  SELECT COUNT(*) INTO v_remaining_admins
  FROM public.user_roles
  WHERE restaurant_id = OLD.restaurant_id
    AND role = 'restaurant_admin'
    AND id != OLD.id;

  -- If no other admins remain, delete the restaurant
  -- (all child tables cascade automatically)
  IF v_remaining_admins = 0 THEN
    DELETE FROM public.restaurants WHERE id = OLD.restaurant_id;
    
    RAISE NOTICE 'Restaurant % deleted (last admin % removed)',
      OLD.restaurant_id, OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.cascade_delete_restaurant_on_admin_removal() IS
  'When the last restaurant_admin is removed from a restaurant, delete the restaurant and all its data.';

-- 3. Create the trigger (fires AFTER delete so the row is already gone from count)
DROP TRIGGER IF EXISTS trigger_cascade_delete_restaurant ON public.user_roles;
CREATE TRIGGER trigger_cascade_delete_restaurant
  AFTER DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_restaurant_on_admin_removal();

-- 4. Also clean up restaurant_admin_requests when a profile is deleted
--    (the FK already has ON DELETE CASCADE from the original migration,
--     but verify it exists)
DO $$
BEGIN
  -- Verify the FK exists with CASCADE
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.referential_constraints rc
    JOIN information_schema.table_constraints tc ON rc.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'restaurant_admin_requests'
    AND rc.delete_rule = 'CASCADE'
  ) THEN
    -- Re-add with CASCADE if missing
    ALTER TABLE public.restaurant_admin_requests
      DROP CONSTRAINT IF EXISTS restaurant_admin_requests_user_id_fkey;
    ALTER TABLE public.restaurant_admin_requests
      ADD CONSTRAINT restaurant_admin_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
