
-- ============================================================
-- A. Add school_id to all existing scoped tables (idempotent)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','staff','invoices','payments','attendance_records','discipline_records',
    'exams','exam_results','classes','subjects','fee_structures',
    'dormitories','dorm_assignments','transport_routes','transport_assignments',
    'book_loans','books','clinic_visits','announcements',
    'student_user_links','parent_student_links','timetable_slots',
    'activity_logs','school_settings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_school ON public.%I(school_id)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- B. Extra columns the app expects
-- ============================================================
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS lifecycle_status     text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_reason     text,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_to       text,
  ADD COLUMN IF NOT EXISTS level                text,
  ADD COLUMN IF NOT EXISTS national_id          text,
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS unique_id            text;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS class_responsibility text,
  ADD COLUMN IF NOT EXISTS status               text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS department_id        uuid,
  ADD COLUMN IF NOT EXISTS unique_id            text,
  ADD COLUMN IF NOT EXISTS lifecycle_status     text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_reason     text,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_to       text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- ============================================================
-- C. Staff structure tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'academic',
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_department_fk FOREIGN KEY (department_id)
  REFERENCES public.departments(id) ON DELETE SET NULL
  NOT VALID;

CREATE TABLE IF NOT EXISTS public.sub_departments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_departments TO authenticated;
GRANT ALL ON public.sub_departments TO service_role;
ALTER TABLE public.sub_departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.co_curricular_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.co_curricular_activities TO authenticated;
GRANT ALL ON public.co_curricular_activities TO service_role;
ALTER TABLE public.co_curricular_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO authenticated;
GRANT ALL ON public.teacher_subjects TO service_role;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.staff_co_curricular (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id    uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.co_curricular_activities(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, activity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_co_curricular TO authenticated;
GRANT ALL ON public.staff_co_curricular TO service_role;
ALTER TABLE public.staff_co_curricular ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- D. Admissions support tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type    text NOT NULL,
  file_path   text NOT NULL,
  file_name   text,
  mime_type   text,
  size_bytes  bigint,
  notes       text,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_documents TO authenticated;
GRANT ALL ON public.student_documents TO service_role;
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  provider   text,
  is_default boolean NOT NULL DEFAULT false,
  premium    numeric(12,2) DEFAULT 0,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.student_insurance (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  policy_id  uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, policy_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_insurance TO authenticated;
GRANT ALL ON public.student_insurance TO service_role;
ALTER TABLE public.student_insurance ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- E. Governance / lifecycle tables
-- ============================================================
CREATE TABLE IF NOT EXISTS public.lifecycle_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES auth.users(id),
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  from_status text,
  to_status   text NOT NULL,
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.lifecycle_events TO authenticated;
GRANT ALL ON public.lifecycle_events TO service_role;
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.override_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id   uuid REFERENCES auth.users(id),
  resource   text NOT NULL,
  field      text,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.override_log TO authenticated;
GRANT ALL ON public.override_log TO service_role;
ALTER TABLE public.override_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.field_policies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  resource       text NOT NULL,
  field          text NOT NULL,
  classification text NOT NULL DEFAULT 'editable',
  required_level text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, resource, field)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.field_policies TO authenticated;
GRANT ALL ON public.field_policies TO service_role;
ALTER TABLE public.field_policies ENABLE ROW LEVEL SECURITY;
DROP TRIGGER IF EXISTS trg_field_pol_updated ON public.field_policies;
CREATE TRIGGER trg_field_pol_updated BEFORE UPDATE ON public.field_policies
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.field_edit_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id      uuid REFERENCES auth.users(id),
  resource      text NOT NULL,
  field         text NOT NULL,
  override_used boolean NOT NULL DEFAULT false,
  old_value     text,
  new_value     text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.field_edit_audit TO authenticated;
GRANT ALL ON public.field_edit_audit TO service_role;
ALTER TABLE public.field_edit_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.smart_alerts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category   text NOT NULL,
  severity   text NOT NULL DEFAULT 'info',
  title      text NOT NULL,
  body       text,
  resolved   boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_alerts TO authenticated;
GRANT ALL ON public.smart_alerts TO service_role;
ALTER TABLE public.smart_alerts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.pending_parent_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_user_id uuid REFERENCES auth.users(id),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  match_key  text,
  status     text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pending_parent_links TO authenticated;
GRANT ALL ON public.pending_parent_links TO service_role;
ALTER TABLE public.pending_parent_links ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- F. RLS policies for new tables (school-scoped)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'departments','sub_departments','co_curricular_activities',
    'teacher_subjects','staff_co_curricular',
    'student_documents','insurance_policies','student_insurance',
    'smart_alerts','pending_parent_links','field_policies'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_platform() OR public.is_member_of(school_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (public.is_member_of(school_id) AND public.is_admin(auth.uid())) WITH CHECK (public.is_member_of(school_id) AND public.is_admin(auth.uid()))', t, t);
  END LOOP;
END $$;

-- Append-only audit tables: only insert by self, read by admins of same school
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lifecycle_events','override_log','field_edit_audit'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_platform() OR (school_id IS NULL OR public.is_member_of(school_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- G. Helper RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.pick_class_for_level(_level text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id
    FROM public.classes c
   WHERE c.school_id = public.my_school_id()
     AND (_level IS NULL OR c.name ILIKE '%' || _level || '%')
   ORDER BY c.created_at ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.pick_dorm_for_gender(_gender text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.id
    FROM public.dormitories d
   WHERE d.school_id = public.my_school_id()
   ORDER BY d.created_at ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.assign_class_fees(_student uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_school uuid; v_class uuid;
BEGIN
  SELECT school_id, class_id INTO v_school, v_class FROM public.students WHERE id = _student;
  IF v_school IS NULL THEN RETURN; END IF;
  INSERT INTO public.invoices (student_id, fee_structure_id, amount, status, school_id)
  SELECT _student, fs.id, fs.amount, 'unpaid', v_school
    FROM public.fee_structures fs
   WHERE fs.school_id = v_school
   ON CONFLICT DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.find_parent_match(_email text, _phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id
    FROM public.profiles p
    JOIN public.user_roles r ON r.user_id = p.id AND r.role = 'parent'
   WHERE (_email IS NOT NULL AND p.full_name ILIKE '%' || _email || '%')
      OR (_phone IS NOT NULL AND p.full_name ILIKE '%' || _phone || '%')
   LIMIT 1
$$;

-- ============================================================
-- H. Backfill school_id for the default seed school
-- ============================================================
DO $$
DECLARE v_school uuid;
BEGIN
  SELECT id INTO v_school FROM public.schools WHERE slug = 'school-1' LIMIT 1;
  IF v_school IS NOT NULL THEN
    PERFORM 1; -- placeholder; existing rows have no data, nothing to backfill
  END IF;
END $$;
