
SET session_replication_role = replica;

-- 1. schools table
CREATE TABLE IF NOT EXISTS public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  motto text,
  primary_color text,
  logo_url text,
  email text,
  phone text,
  address text,
  academic_year int DEFAULT EXTRACT(year FROM now())::int,
  current_term text DEFAULT 'Term 1',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view schools" ON public.schools;
CREATE POLICY "auth view schools" ON public.schools FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "anon view schools basic" ON public.schools;
CREATE POLICY "anon view schools basic" ON public.schools FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS "super admin manage schools" ON public.schools;
CREATE POLICY "super admin manage schools" ON public.schools FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 2. school_members
CREATE TABLE IF NOT EXISTS public.school_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, school_id)
);
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users view own memberships" ON public.school_members;
CREATE POLICY "users view own memberships" ON public.school_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));
DROP POLICY IF EXISTS "super admin manage memberships" ON public.school_members;
CREATE POLICY "super admin manage memberships" ON public.school_members FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- 3. Seed School 1
INSERT INTO public.schools (slug, name, motto, primary_color, logo_url, email, phone, address, academic_year, current_term)
SELECT 'school-1', COALESCE(school_name, 'School 1'), motto, primary_color, logo_url, email, phone, address,
       COALESCE(academic_year, EXTRACT(year FROM now())::int), COALESCE(current_term, 'Term 1')
FROM public.school_settings LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.schools (slug, name)
SELECT 'school-1', 'School 1'
WHERE NOT EXISTS (SELECT 1 FROM public.schools WHERE slug = 'school-1');

-- 4. Memberships
INSERT INTO public.school_members (user_id, school_id, is_default)
SELECT DISTINCT ur.user_id, s.id, true
FROM public.user_roles ur, public.schools s
WHERE s.slug = 'school-1'
ON CONFLICT (user_id, school_id) DO NOTHING;

-- 5. current_user_school()
CREATE OR REPLACE FUNCTION public.current_user_school()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.school_members
  WHERE user_id = auth.uid()
  ORDER BY is_default DESC, created_at ASC LIMIT 1;
$$;

-- 6. Add school_id to tenant tables + backfill + NOT NULL + index
DO $$
DECLARE
  tbl text;
  school1 uuid;
  tenant_tables text[] := ARRAY[
    'students','staff','classes','subjects','exams','exam_results',
    'attendance_records','invoices','payments','fee_structures','class_fee_components',
    'announcements','books','book_loans','dormitories','dorm_assignments',
    'clinic_visits','discipline_records','gate_passes','incident_reports',
    'kitchen_stock','meal_plans','transport_routes','transport_assignments',
    'timetable_slots','smart_alerts','lifecycle_events','field_edit_audit',
    'override_log','activity_logs','parent_student_links','student_user_links',
    'pending_parent_links','user_credentials','user_roles','field_policies'
  ];
BEGIN
  SELECT id INTO school1 FROM public.schools WHERE slug = 'school-1';
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id)', tbl);
    EXECUTE format('UPDATE public.%I SET school_id = %L WHERE school_id IS NULL', tbl, school1);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id SET NOT NULL', tbl);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (school_id)', 'idx_' || tbl || '_school', tbl);
  END LOOP;
END $$;

-- 7. Stamp trigger function
CREATE OR REPLACE FUNCTION public.stamp_school_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.current_user_school();
  END IF;
  IF NEW.school_id IS NULL THEN
    RAISE EXCEPTION 'school_id is required but user has no school membership';
  END IF;
  RETURN NEW;
END $$;

-- 8. Guard trigger function
CREATE OR REPLACE FUNCTION public.guard_school_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id
     AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'Changing school_id is not permitted';
  END IF;
  RETURN NEW;
END $$;

-- 9. Triggers + RESTRICTIVE tenant isolation policy
DO $$
DECLARE
  tbl text;
  tenant_tables text[] := ARRAY[
    'students','staff','classes','subjects','exams','exam_results',
    'attendance_records','invoices','payments','fee_structures','class_fee_components',
    'announcements','books','book_loans','dormitories','dorm_assignments',
    'clinic_visits','discipline_records','gate_passes','incident_reports',
    'kitchen_stock','meal_plans','transport_routes','transport_assignments',
    'timetable_slots','smart_alerts','lifecycle_events','field_edit_audit',
    'override_log','activity_logs','parent_student_links','student_user_links',
    'pending_parent_links','user_credentials','user_roles','field_policies'
  ];
BEGIN
  FOREACH tbl IN ARRAY tenant_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_stamp_school_id ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_stamp_school_id BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id()', tbl);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_guard_school_id ON public.%I', tbl);
    EXECUTE format('CREATE TRIGGER trg_guard_school_id BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_school_id()', tbl);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
      'USING (school_id = public.current_user_school() OR has_role(auth.uid(), ''super_admin''::app_role)) '
      'WITH CHECK (school_id = public.current_user_school() OR has_role(auth.uid(), ''super_admin''::app_role))',
      tbl
    );
  END LOOP;
END $$;

-- 10. Per-school unique_id counters
ALTER TABLE public.unique_id_counters ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
UPDATE public.unique_id_counters SET school_id = (SELECT id FROM public.schools WHERE slug='school-1') WHERE school_id IS NULL;
ALTER TABLE public.unique_id_counters ALTER COLUMN school_id SET NOT NULL;
ALTER TABLE public.unique_id_counters DROP CONSTRAINT IF EXISTS unique_id_counters_pkey;
ALTER TABLE public.unique_id_counters ADD PRIMARY KEY (school_id, category, year);

CREATE OR REPLACE FUNCTION public.next_unique_id(_category text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  yr int := EXTRACT(YEAR FROM now())::int;
  n  int;
  pad int := 6;
  sch uuid := public.current_user_school();
BEGIN
  IF sch IS NULL THEN
    RAISE EXCEPTION 'No school context for unique ID generation';
  END IF;
  INSERT INTO public.unique_id_counters (school_id, category, year, last_value)
  VALUES (sch, _category, yr, 1)
  ON CONFLICT (school_id, category, year)
  DO UPDATE SET last_value = public.unique_id_counters.last_value + 1
  RETURNING last_value INTO n;
  RETURN _category || '-' || yr::text || '-' || lpad(n::text, pad, '0');
END;
$function$;

-- 11. schools updated_at
DROP TRIGGER IF EXISTS schools_touch ON public.schools;
CREATE TRIGGER schools_touch BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

SET session_replication_role = origin;
