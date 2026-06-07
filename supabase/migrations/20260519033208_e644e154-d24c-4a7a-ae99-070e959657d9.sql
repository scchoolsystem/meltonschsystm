ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS email_domain text;
CREATE OR REPLACE FUNCTION public.current_school_email_domain()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(s.email_domain, 'school.erp')
  FROM public.schools s
  WHERE s.id = public.current_user_school()
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.current_school_email_domain() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_school_email_domain() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text, _school_slug text DEFAULT NULL::text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF position('@' IN _unique_id) > 0 THEN
    SELECT u.email INTO v_email
    FROM auth.users u
    LEFT JOIN public.school_members m ON m.user_id = u.id
    LEFT JOIN public.schools s ON s.id = m.school_id
    WHERE lower(u.email) = lower(_unique_id)
      AND (_school_slug IS NULL OR s.slug = lower(_school_slug)
           OR EXISTS (SELECT 1 FROM public.user_roles r
                      WHERE r.user_id = u.id
                        AND r.role IN ('platform_owner','platform_support','super_admin')))
    LIMIT 1;
    RETURN v_email;
  END IF;

  SELECT uc.synthetic_email INTO v_email
  FROM public.user_credentials uc
  LEFT JOIN public.profiles p ON p.id = uc.user_id
  LEFT JOIN public.schools s ON s.id = uc.school_id
  WHERE upper(uc.unique_id) = upper(_unique_id)
    AND uc.is_active = true
    AND (p.status IS NULL OR p.status = 'active')
    AND (_school_slug IS NULL OR s.slug = lower(_school_slug));
  RETURN v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.lookup_login_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_login_email(text, text) TO anon, authenticated;

DROP POLICY IF EXISTS "school admin update own school" ON public.schools;
CREATE POLICY "school admin update own school" ON public.schools
  FOR UPDATE TO authenticated
  USING (id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (id = public.current_user_school() AND public.is_admin(auth.uid()));