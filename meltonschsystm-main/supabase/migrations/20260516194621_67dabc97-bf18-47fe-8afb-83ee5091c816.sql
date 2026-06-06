
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read profile photos" ON storage.objects;
CREATE POLICY "Public read profile photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "Auth upload profile photos" ON storage.objects;
CREATE POLICY "Auth upload profile photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "Auth update profile photos" ON storage.objects;
CREATE POLICY "Auth update profile photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "Auth delete profile photos" ON storage.objects;
CREATE POLICY "Auth delete profile photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'profile-photos');
