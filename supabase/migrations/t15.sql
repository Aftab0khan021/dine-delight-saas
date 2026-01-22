-- 1. Add visibility flag ONLY if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'restaurants' AND column_name = 'is_public') THEN
        ALTER TABLE public.restaurants ADD COLUMN is_public BOOLEAN DEFAULT true;
    END IF;
END $$;

-- 2. Safely drop old policy
DROP POLICY IF EXISTS "Public can view restaurants" ON public.restaurants;
DROP POLICY IF EXISTS "Public can view active restaurants" ON public.restaurants;

-- 3. Create the New Policy
CREATE POLICY "Public can view active restaurants"
ON public.restaurants FOR SELECT
USING (is_public = true);