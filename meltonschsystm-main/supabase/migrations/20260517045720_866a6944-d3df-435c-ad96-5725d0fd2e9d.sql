
-- A1: Tenant-scope login lookup
DROP FUNCTION IF EXISTS public.lookup_login_email(text);

CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text, _school_slug text DEFAULT NULL)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT uc.synthetic_email
  FROM public.user_credentials uc
  LEFT JOIN public.profiles p ON p.id = uc.user_id
  LEFT JOIN public.schools s ON s.id = uc.school_id
  WHERE upper(uc.unique_id) = upper(_unique_id)
    AND uc.is_active = true
    AND (p.status IS NULL OR p.status = 'active')
    AND (_school_slug IS NULL OR s.slug = lower(_school_slug))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_login_email(text, text) TO anon, authenticated;

-- Allow same unique_id across different schools (composite uniqueness)
ALTER TABLE public.user_credentials DROP CONSTRAINT IF EXISTS user_credentials_unique_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_credentials_school_unique_id_key
  ON public.user_credentials (school_id, upper(unique_id));

-- Helper: caller's school resolved from membership (used by server fns via RPC)
CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.current_user_school();
$$;

GRANT EXECUTE ON FUNCTION public.my_school_id() TO authenticated;
