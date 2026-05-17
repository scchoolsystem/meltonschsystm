
DROP POLICY IF EXISTS profile_photos_public_read ON storage.objects;

CREATE POLICY profile_photos_owner_read
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'profile-photos'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin(auth.uid())
  )
);
