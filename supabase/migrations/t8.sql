CREATE POLICY "Users can view all profiles"
ON public.profiles
FOR SELECT
USING (true);
