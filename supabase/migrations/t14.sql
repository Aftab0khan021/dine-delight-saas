-- 1. Add visibility flag
ALTER TABLE public.restaurants ADD COLUMN is_public BOOLEAN DEFAULT true;

-- 2. Drop old policy
DROP POLICY "Public can view restaurants" ON public.restaurants;

-- 3. New Policy: Only fetch if you know the ID/Slug or if it's explicitly public
CREATE POLICY "Public can view active restaurants"
ON public.restaurants FOR SELECT
USING (is_public = true);