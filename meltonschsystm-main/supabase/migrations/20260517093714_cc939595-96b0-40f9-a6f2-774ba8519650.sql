
-- Drop any existing policies on profile-photos to redefine cleanly
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname LIKE 'profile_photos_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- Public read (bucket is public anyway, but explicit policy for safety)
CREATE POLICY profile_photos_public_read
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos');

-- Authenticated users may upload only into a folder matching their auth uid
CREATE POLICY profile_photos_user_insert
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-photos'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Update own files OR admins can update any
CREATE POLICY profile_photos_user_update
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
)
WITH CHECK (
  bucket_id = 'profile-photos'
  AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
);

-- Delete own files OR admins can delete any
CREATE POLICY profile_photos_user_delete
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid()))
);

-- Enforce 5 MB max and image MIME types on the bucket
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp','image/gif']
WHERE id = 'profile-photos';
