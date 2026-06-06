-- Tenant-scope admin reads on profiles so a super_admin at School A cannot read profiles of users in School B
DROP POLICY IF EXISTS "admins view all profiles" ON public.profiles;

CREATE POLICY "admins view profiles same school"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  AND (
    is_platform_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_credentials uc1
      JOIN public.user_credentials uc2 ON uc2.school_id = uc1.school_id
      WHERE uc1.user_id = auth.uid()
        AND uc2.user_id = profiles.id
    )
  )
);