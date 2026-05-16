
-- Profile photos: only admins can write/update/delete; reads via direct public URL still work
DROP POLICY IF EXISTS "Auth upload profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth update profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete profile photos" ON storage.objects;
DROP POLICY IF EXISTS "Public read profile photos" ON storage.objects;

CREATE POLICY "Admins upload profile photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update profile photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete profile photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));

-- Allow direct file reads (bucket is public) but prevent broad listing by anon.
CREATE POLICY "Admins list profile photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos' AND public.is_admin(auth.uid()));

-- Lock down next_unique_id: only service role should call it
REVOKE EXECUTE ON FUNCTION public.next_unique_id(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_unique_id(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.next_unique_id(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_unique_id(text) TO service_role;
