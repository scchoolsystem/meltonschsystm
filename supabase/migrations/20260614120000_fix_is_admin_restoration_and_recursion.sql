-- Wave 1, Fix C-1 + C-2
-- C-1: Restore is_admin() to recognize the full 6-role admin superset.
--      The 20260610120000 migration narrowed it to (super_admin, principal),
--      silently blocking writes for deputy_principal, school_admin,
--      academic_master, admission_officer.
-- C-2: Remove the inline EXISTS self-reference on public.user_roles in the
--      "principals manage roles" policy (recursion / self-permission hazard).
--      Use the SECURITY DEFINER is_admin() instead.

-- 1. Restore is_admin() with the 6-role superset.
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN (
        'super_admin',
        'principal',
        'deputy_principal',
        'school_admin',
        'academic_master',
        'admission_officer'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin TO anon;

-- 2. Rebuild user_roles policies without self-referential EXISTS.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_roles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_roles', pol.policyname);
  END LOOP;
END $$;

-- Users can always read their own role rows.
CREATE POLICY "users read own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins manage all role rows, via SECURITY DEFINER helper (no recursion).
CREATE POLICY "admins manage roles"
  ON public.user_roles
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
