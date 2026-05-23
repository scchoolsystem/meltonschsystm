-- ============================================================
-- FIX: Suspended school blocking
-- ============================================================
-- 1. current_user_school() now only returns a school_id if that school
--    is still active. Suspended/deleted schools return NULL → RLS blocks all access.
-- 2. lookup_login_email() now refuses to resolve a login email if the
--    school is suspended — blocking authentication at the entry point.
-- ============================================================

-- 1. Harden current_user_school() to filter on school status
CREATE OR REPLACE FUNCTION public.current_user_school()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sm.school_id
  FROM public.school_members sm
  INNER JOIN public.schools s ON s.id = sm.school_id
  WHERE sm.user_id = auth.uid()
    AND s.status = 'active'
  ORDER BY sm.is_default DESC, sm.created_at ASC
  LIMIT 1;
$$;

-- 2. Harden lookup_login_email() to reject logins for suspended schools
CREATE OR REPLACE FUNCTION public.lookup_login_email(
  _unique_id text,
  _school_slug text DEFAULT NULL::text
)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Direct email login path (e.g. platform admins, super admins)
  IF position('@' IN _unique_id) > 0 THEN
    SELECT u.email INTO v_email
    FROM auth.users u
    LEFT JOIN public.school_members m ON m.user_id = u.id
    LEFT JOIN public.schools s ON s.id = m.school_id
    WHERE lower(u.email) = lower(_unique_id)
      AND (
        -- No school slug provided → allow (platform admins, etc.)
        _school_slug IS NULL
        -- School slug matches AND school is active
        OR (s.slug = lower(_school_slug) AND s.status = 'active')
        -- Platform/super admins bypass school status check
        OR EXISTS (
          SELECT 1 FROM public.user_roles r
          WHERE r.user_id = u.id
            AND r.role IN ('platform_owner', 'platform_support', 'super_admin')
        )
      )
    LIMIT 1;
    RETURN v_email;
  END IF;

  -- Unique-ID login path (synthetic email lookup)
  SELECT uc.synthetic_email INTO v_email
  FROM public.user_credentials uc
  LEFT JOIN public.profiles p ON p.id = uc.user_id
  LEFT JOIN public.schools s ON s.id = uc.school_id
  WHERE upper(uc.unique_id) = upper(_unique_id)
    AND uc.is_active = true
    AND (p.status IS NULL OR p.status = 'active')
    -- School must be active
    AND (s.status IS NULL OR s.status = 'active')
    AND (_school_slug IS NULL OR s.slug = lower(_school_slug));

  RETURN v_email;
END;
$$;

REVOKE ALL ON FUNCTION public.lookup_login_email(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lookup_login_email(text, text) TO anon, authenticated;

-- 3. Grant updated current_user_school to authenticated (was already granted)
GRANT EXECUTE ON FUNCTION public.current_user_school() TO authenticated;
