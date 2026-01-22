-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('menu-items', 'menu-items', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Security Policy: Everyone can VIEW images
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'menu-items' );

-- 3. Security Policy: Only Admins/Staff can UPLOAD
CREATE POLICY "Staff Upload Access" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id = 'menu-items' );

-- 4. Security Policy: Only Admins/Staff can DELETE
CREATE POLICY "Staff Delete Access" 
ON storage.objects FOR DELETE 
TO authenticated 
USING ( bucket_id = 'menu-items' );