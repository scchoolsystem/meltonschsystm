-- ====================================================================
-- WEEK 1: SECURITY EMERGENCIES
-- ====================================================================

-- ---------- 1. Fix handle_new_user: remove first-user auto-elevation ----------
-- BUG A1-1: any user signup could become super_admin if user_roles empty
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  -- All new users get 'staff' by default. Elevated roles must be assigned
  -- explicitly by an admin (or by provisionSchoolAdmin / createAccount).
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'staff');
  RETURN NEW;
END;
$$;

-- ---------- 2. Revoke anon EXECUTE on role-check helpers (BUG F4) ----------
-- lookup_login_email stays callable by anon (required by login form)
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.role_level(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_user_school() FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_student(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_parent_of(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_owner(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_school_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_children_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_student_id() FROM anon;

-- ---------- 3. MPESA duplicate-payment protection (BUG B8-1) ----------
-- Receipt no is the first token of reference for mpesa rows: "<RECEIPT> (<phone>)"
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_mpesa_receipt
  ON public.payments ((split_part(reference, ' ', 1)))
  WHERE method = 'mpesa' AND reference IS NOT NULL;

-- ---------- 4. Rotate leaked bootstrap password (BUG A1-3) ----------
-- One-time secrets table — platform_owner reads it once then deletes the row.
CREATE TABLE IF NOT EXISTS public._one_time_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public._one_time_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_owner_read_secrets" ON public._one_time_secrets;
CREATE POLICY "platform_owner_read_secrets"
  ON public._one_time_secrets FOR SELECT TO authenticated
  USING (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS "platform_owner_delete_secrets" ON public._one_time_secrets;
CREATE POLICY "platform_owner_delete_secrets"
  ON public._one_time_secrets FOR DELETE TO authenticated
  USING (public.is_platform_owner(auth.uid()));

-- Rotate the password to a strong random value generated at apply time.
DO $$
DECLARE
  new_pwd text := encode(gen_random_bytes(18), 'base64');
BEGIN
  UPDATE auth.users
     SET encrypted_password = crypt(new_pwd, gen_salt('bf'))
   WHERE email = 'meltongraymond1@gmail.com';

  IF FOUND THEN
    INSERT INTO public._one_time_secrets(label, value)
    VALUES ('rotated_password:meltongraymond1@gmail.com', new_pwd);
  END IF;
END $$;

-- ---------- 5. Hash parent_auth_code at rest (BUG B5-5 / D3-1 prep) ----------
-- Add a hashed column. We will migrate values + drop plaintext in Week 2
-- after server fns are updated to verify via hash.
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parent_auth_code_hash text;