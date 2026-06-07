-- Only the SELECT policy belongs here.
-- Write policies (INSERT/UPDATE/DELETE) already exist in 20260527000001.
DROP POLICY IF EXISTS "admins manage roles in own school" ON public.user_roles;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_roles' AND policyname='users read own roles'
  ) THEN
    CREATE POLICY "users read own roles" ON public.user_roles
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
