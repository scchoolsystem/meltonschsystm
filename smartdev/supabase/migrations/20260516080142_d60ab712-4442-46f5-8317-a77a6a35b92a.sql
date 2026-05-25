
-- 1) Extend the role enum with enterprise roles (existing values preserved)
DO $$
BEGIN
  PERFORM 1;
  -- add each value if not present
END $$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'school_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'academic_master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exams_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exams_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boarding_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boarding_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'library_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'library_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'clinic_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'clinic_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sports_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sports_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'transport_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'guidance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ict_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'discipline_admin';

-- 2) school_settings singleton
CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  school_name text NOT NULL DEFAULT 'Greenfield Academy',
  email_domain text NOT NULL DEFAULT 'school.erp',
  credential_delivery_mode text NOT NULL DEFAULT 'hybrid'
    CHECK (credential_delivery_mode IN ('on_screen','email','hybrid')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_settings_singleton_unique UNIQUE (singleton)
);

INSERT INTO public.school_settings (singleton) VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read settings" ON public.school_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage settings" ON public.school_settings
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 3) user_credentials table (the unique-ID directory)
CREATE TABLE IF NOT EXISTS public.user_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unique_id text NOT NULL UNIQUE,
  category text NOT NULL,
  synthetic_email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  password_reset_required boolean NOT NULL DEFAULT false,
  last_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self read credentials" ON public.user_credentials
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "admin manage credentials" ON public.user_credentials
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 4) Public lookup function: unique_id -> synthetic_email (no auth required, used by login)
CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT synthetic_email
  FROM public.user_credentials
  WHERE upper(unique_id) = upper(_unique_id)
    AND is_active = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_login_email(text) TO anon, authenticated;

-- 5) Add unique_id columns to students and staff
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS unique_id text UNIQUE;
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS unique_id text UNIQUE;

-- 6) Sequence-based unique-id generator
CREATE TABLE IF NOT EXISTS public.unique_id_counters (
  category text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL DEFAULT 0,
  PRIMARY KEY (category, year)
);

ALTER TABLE public.unique_id_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read counters" ON public.unique_id_counters
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_unique_id(_category text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr int := EXTRACT(YEAR FROM now())::int;
  n  int;
  pad int := 6;
BEGIN
  INSERT INTO public.unique_id_counters (category, year, last_value)
  VALUES (_category, yr, 1)
  ON CONFLICT (category, year)
  DO UPDATE SET last_value = public.unique_id_counters.last_value + 1
  RETURNING last_value INTO n;

  RETURN _category || '-' || yr::text || '-' || lpad(n::text, pad, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_unique_id(text) TO authenticated;

-- 7) Backfill unique IDs for existing auth users based on their role
DO $$
DECLARE
  r RECORD;
  cat text;
  uid text;
BEGIN
  FOR r IN
    SELECT u.id AS user_id, u.email,
           COALESCE(
             (SELECT role::text FROM public.user_roles ur WHERE ur.user_id = u.id ORDER BY
                CASE role::text
                  WHEN 'super_admin' THEN 1
                  WHEN 'principal' THEN 2
                  WHEN 'deputy_principal' THEN 3
                  ELSE 10
                END LIMIT 1),
             'staff'
           ) AS top_role
    FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.user_credentials c WHERE c.user_id = u.id)
  LOOP
    cat := CASE r.top_role
      WHEN 'super_admin' THEN 'SUP'
      WHEN 'principal' THEN 'SUP'
      WHEN 'deputy_principal' THEN 'STF'
      WHEN 'class_teacher' THEN 'STF'
      WHEN 'subject_teacher' THEN 'STF'
      WHEN 'teacher' THEN 'STF'
      WHEN 'hod' THEN 'STF'
      WHEN 'bursar' THEN 'FIN'
      WHEN 'librarian' THEN 'LIB'
      WHEN 'nurse' THEN 'CLN'
      WHEN 'matron' THEN 'BRD'
      WHEN 'sports' THEN 'SPT'
      WHEN 'boarding' THEN 'BRD'
      WHEN 'transport_officer' THEN 'TRP'
      WHEN 'admission_officer' THEN 'ADM'
      WHEN 'parent' THEN 'PAR'
      WHEN 'student' THEN 'STU'
      ELSE 'STF'
    END;

    uid := public.next_unique_id(cat);

    INSERT INTO public.user_credentials (user_id, unique_id, category, synthetic_email, is_active)
    VALUES (r.user_id, uid, cat, COALESCE(r.email, lower(uid) || '@school.erp'), true)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END $$;

-- 8) Backfill unique_id on students and staff tables (linked or stand-alone)
DO $$
DECLARE
  s RECORD;
  uid text;
BEGIN
  FOR s IN SELECT id FROM public.students WHERE unique_id IS NULL LOOP
    uid := public.next_unique_id('STU');
    UPDATE public.students SET unique_id = uid WHERE id = s.id;
  END LOOP;

  FOR s IN SELECT id, role::text AS rl FROM public.staff WHERE unique_id IS NULL LOOP
    uid := public.next_unique_id(
      CASE s.rl
        WHEN 'bursar' THEN 'FIN'
        WHEN 'librarian' THEN 'LIB'
        WHEN 'sports' THEN 'SPT'
        WHEN 'boarding' THEN 'BRD'
        ELSE 'STF'
      END
    );
    UPDATE public.staff SET unique_id = uid WHERE id = s.id;
  END LOOP;
END $$;

-- 9) Updated-at trigger for school_settings
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_school_settings_updated ON public.school_settings;
CREATE TRIGGER trg_school_settings_updated
BEFORE UPDATE ON public.school_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
