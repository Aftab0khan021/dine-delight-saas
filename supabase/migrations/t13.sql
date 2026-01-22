-- 1. Safely drop the insecure policy (ignores error if already gone)
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- 2. Create the secure policy (safely)
-- We drop it first just in case a "wrong" version exists
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- 3. Allow staff access (safely)
DROP POLICY IF EXISTS "Staff can view coworkers" ON public.profiles;

CREATE POLICY "Staff can view coworkers"
ON public.profiles FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur_me
    JOIN public.user_roles ur_target ON ur_me.restaurant_id = ur_target.restaurant_id
    WHERE ur_me.user_id = auth.uid()
    AND ur_target.user_id = profiles.id
  )
);