DROP FUNCTION IF EXISTS public.lookup_login_email(text);
DROP FUNCTION IF EXISTS public.lookup_login_email(text, text);
CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text, _school_slug text DEFAULT NULL)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT uc.synthetic_email FROM public.user_credentials uc
  LEFT JOIN public.schools s ON s.id = uc.school_id
  WHERE upper(uc.unique_id) = upper(_unique_id) AND uc.is_active = true
  AND (_school_slug IS NULL OR lower(s.slug) = lower(_school_slug)) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_login_email(text, text) TO anon, authenticated;
