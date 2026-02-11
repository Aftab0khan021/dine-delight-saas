-- ============================================================================
-- Super Admin Approval Flow
-- ============================================================================
-- This migration implements a pending approval system for restaurant admins.
-- New restaurant admins sign up in a pending state and must be approved by
-- a Super Admin before they can create restaurants and access the dashboard.

-- ============================================================================
-- 1. CREATE restaurant_admin_requests TABLE
-- ============================================================================
-- Stores pending restaurant admin approval requests with business details

CREATE TABLE IF NOT EXISTS public.restaurant_admin_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  restaurant_slug TEXT NOT NULL,
  business_type TEXT,
  phone TEXT,
  address TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  denial_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON public.restaurant_admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_user ON public.restaurant_admin_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_requests_created ON public.restaurant_admin_requests(created_at DESC);

COMMENT ON TABLE public.restaurant_admin_requests IS 'Pending restaurant admin approval requests';
COMMENT ON COLUMN public.restaurant_admin_requests.status IS 'Request status: pending, approved, denied';
COMMENT ON COLUMN public.restaurant_admin_requests.reviewed_by IS 'Super admin who reviewed the request';

-- ============================================================================
-- 2. ADD account_status TO profiles TABLE
-- ============================================================================
-- Tracks user account status for approval workflow

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'pending' 
CHECK (account_status IN ('pending', 'active', 'denied', 'suspended'));

CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);

COMMENT ON COLUMN public.profiles.account_status IS 'Account status: pending (awaiting approval), active (approved), denied (rejected), suspended (temporarily disabled)';

-- ============================================================================
-- 3. ADD approval_tracking TO user_roles TABLE
-- ============================================================================
-- Tracks who approved the user role and when

ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_roles.approved_by IS 'Super admin who approved this user role';
COMMENT ON COLUMN public.user_roles.approved_at IS 'When the user role was approved';

-- ============================================================================
-- 4. UPDATE handle_new_user TRIGGER
-- ============================================================================
-- Modified to handle both invited users and regular signups with pending state

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
  -- Extract metadata (if user was invited)
  v_restaurant_id := (NEW.raw_user_meta_data->>'restaurant_id')::UUID;
  v_role := NEW.raw_user_meta_data->>'role';
  v_staff_category_id := (NEW.raw_user_meta_data->>'staff_category_id')::UUID;
  
  IF v_restaurant_id IS NOT NULL THEN
    -- ========================================================================
    -- INVITED USER: Active immediately with restaurant assignment
    -- ========================================================================
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'active')
    ON CONFLICT (id) DO NOTHING;
    
    -- Default role to 'user' if not specified
    IF v_role IS NULL OR v_role = '' THEN
      v_role := 'user';
    END IF;
    
    -- Create user_roles with restaurant assignment
    INSERT INTO public.user_roles (user_id, restaurant_id, role, staff_category_id)
    VALUES (NEW.id, v_restaurant_id, v_role::user_role, v_staff_category_id)
    ON CONFLICT (user_id, restaurant_id) DO UPDATE
    SET role = EXCLUDED.role,
        staff_category_id = EXCLUDED.staff_category_id,
        updated_at = now();
    
    -- Log activity
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
  ELSE
    -- ========================================================================
    -- REGULAR SIGNUP: Pending state (awaiting Super Admin approval)
    -- ========================================================================
    INSERT INTO public.profiles (id, email, full_name, account_status)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name', 'pending')
    ON CONFLICT (id) DO NOTHING;
    
    -- Create user_roles WITHOUT restaurant (will be assigned after approval)
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'restaurant_admin')
    ON CONFLICT (user_id, restaurant_id) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 
  'Creates profiles and user_roles entries for new signups. Invited users are active immediately, regular signups are pending approval.';

-- ============================================================================
-- 5. ENABLE RLS ON restaurant_admin_requests
-- ============================================================================

ALTER TABLE public.restaurant_admin_requests ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS POLICIES FOR restaurant_admin_requests
-- ============================================================================

-- Super admins can view all requests
DROP POLICY IF EXISTS "Super admins can view all requests" ON public.restaurant_admin_requests;
CREATE POLICY "Super admins can view all requests"
  ON public.restaurant_admin_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- Users can view their own request
DROP POLICY IF EXISTS "Users can view own request" ON public.restaurant_admin_requests;
CREATE POLICY "Users can view own request"
  ON public.restaurant_admin_requests FOR SELECT
  USING (user_id = auth.uid());

-- Users can create their own request (one per user)
DROP POLICY IF EXISTS "Users can create own request" ON public.restaurant_admin_requests;
CREATE POLICY "Users can create own request"
  ON public.restaurant_admin_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Only super admins can update requests (approve/deny)
DROP POLICY IF EXISTS "Super admins can update requests" ON public.restaurant_admin_requests;
CREATE POLICY "Super admins can update requests"
  ON public.restaurant_admin_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

-- ============================================================================
-- 7. UPDATE TRIGGER FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_restaurant_admin_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_restaurant_admin_requests_timestamp ON public.restaurant_admin_requests;
CREATE TRIGGER update_restaurant_admin_requests_timestamp
  BEFORE UPDATE ON public.restaurant_admin_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_restaurant_admin_requests_updated_at();

-- ============================================================================
-- 8. BACKFILL EXISTING USERS (Optional - Run if you have existing users)
-- ============================================================================
-- Uncomment and run this if you have existing users without account_status

-- UPDATE public.profiles
-- SET account_status = 'active'
-- WHERE account_status IS NULL;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
