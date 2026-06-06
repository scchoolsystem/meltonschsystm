CREATE OR REPLACE FUNCTION public.lookup_login_email(_school_slug text, _unique_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT au.email INTO v_email
  FROM auth.users au
  JOIN school_members sm ON sm.user_id = au.id
  JOIN schools s ON s.id = sm.school_id
  JOIN students st ON st.user_id = au.id
  WHERE s.slug = _school_slug
    AND st.unique_id = _unique_id
  LIMIT 1;

  IF v_email IS NULL THEN
    SELECT au.email INTO v_email
    FROM auth.users au
    JOIN school_members sm ON sm.user_id = au.id
    JOIN schools s ON s.id = sm.school_id
    JOIN staff st ON st.user_id = au.id
    WHERE s.slug = _school_slug
      AND st.unique_id = _unique_id
    LIMIT 1;
  END IF;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_login_email(text, text) TO anon, authenticated;
