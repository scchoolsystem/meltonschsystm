-- =========================================================================
-- 1. Staff table additions (all nullable, backward compatible)
-- =========================================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS staff_category text,
  ADD COLUMN IF NOT EXISTS department_id uuid,
  ADD COLUMN IF NOT EXISTS sub_department_id uuid,
  ADD COLUMN IF NOT EXISTS class_responsibility text,
  ADD COLUMN IF NOT EXISTS admin_unit text,
  ADD COLUMN IF NOT EXISTS position_title text,
  ADD COLUMN IF NOT EXISTS oversight text[],
  ADD COLUMN IF NOT EXISTS support_unit text,
  ADD COLUMN IF NOT EXISTS assigned_area text,
  ADD COLUMN IF NOT EXISTS shift text;

ALTER TABLE public.staff
  ADD CONSTRAINT staff_category_check
  CHECK (staff_category IS NULL OR staff_category IN ('teaching','administration','support'));

-- =========================================================================
-- 2. departments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  kind text NOT NULL CHECK (kind IN ('academics','administration','co_curricular','support')),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, kind, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_departments" ON public.departments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "auth view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage departments" ON public.departments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================================
-- 3. sub_departments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.sub_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sub_departments TO authenticated;
GRANT ALL ON public.sub_departments TO service_role;
ALTER TABLE public.sub_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_sub_departments" ON public.sub_departments
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "auth view sub_departments" ON public.sub_departments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage sub_departments" ON public.sub_departments
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_sub_departments_dept ON public.sub_departments(department_id);

-- =========================================================================
-- 4. co_curricular_activities
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.co_curricular_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.co_curricular_activities TO authenticated;
GRANT ALL ON public.co_curricular_activities TO service_role;
ALTER TABLE public.co_curricular_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_cca" ON public.co_curricular_activities
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "auth view cca" ON public.co_curricular_activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage cca" ON public.co_curricular_activities
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- =========================================================================
-- 5. teacher_subjects
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, subject_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO authenticated;
GRANT ALL ON public.teacher_subjects TO service_role;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_teacher_subjects" ON public.teacher_subjects
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "auth view teacher_subjects" ON public.teacher_subjects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage teacher_subjects" ON public.teacher_subjects
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'academic_master'::app_role) OR public.has_role(auth.uid(),'hod'::app_role))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'academic_master'::app_role) OR public.has_role(auth.uid(),'hod'::app_role));

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_staff ON public.teacher_subjects(staff_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON public.teacher_subjects(subject_id);

-- =========================================================================
-- 6. staff_co_curricular
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.staff_co_curricular (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.co_curricular_activities(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'coach',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, activity_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_co_curricular TO authenticated;
GRANT ALL ON public.staff_co_curricular TO service_role;
ALTER TABLE public.staff_co_curricular ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_staff_cc" ON public.staff_co_curricular
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::app_role));

CREATE POLICY "auth view staff_cc" ON public.staff_co_curricular
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage staff_cc" ON public.staff_co_curricular
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_staff_cc_staff ON public.staff_co_curricular(staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_cc_activity ON public.staff_co_curricular(activity_id);

-- =========================================================================
-- 7. FK on staff.department_id
-- =========================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staff_department_id_fkey') THEN
    ALTER TABLE public.staff ADD CONSTRAINT staff_department_id_fkey
      FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='staff_sub_department_id_fkey') THEN
    ALTER TABLE public.staff ADD CONSTRAINT staff_sub_department_id_fkey
      FOREIGN KEY (sub_department_id) REFERENCES public.sub_departments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_staff_department ON public.staff(department_id);
CREATE INDEX IF NOT EXISTS idx_staff_sub_department ON public.staff(sub_department_id);
CREATE INDEX IF NOT EXISTS idx_staff_category ON public.staff(staff_category);

-- =========================================================================
-- 8. Backfill staff_category
-- =========================================================================
UPDATE public.staff SET staff_category = CASE
  WHEN role::text IN ('teacher','class_teacher','subject_teacher','hod','academic_master') THEN 'teaching'
  WHEN role::text IN ('principal','deputy_principal','school_admin','super_admin','bursar',
                      'finance_admin','finance_user','admission_officer','discipline_admin',
                      'ict_admin','guidance_admin','exams_admin','exams_user') THEN 'administration'
  ELSE 'support'
END
WHERE staff_category IS NULL;

-- =========================================================================
-- 9. Seed departments per school
-- =========================================================================
DO $seed$
DECLARE
  s record;
  dept_id uuid;
  spec record;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    FOR spec IN SELECT * FROM (VALUES
      ('academics','Mathematics'), ('academics','Sciences'), ('academics','Languages'),
      ('academics','Humanities'), ('academics','Technical'), ('academics','Arts'), ('academics','ICT'),
      ('administration','Principal Office'), ('administration','Deputy Principal'),
      ('administration','Finance'), ('administration','Admissions'), ('administration','HR'),
      ('administration','Discipline'), ('administration','ICT Administration'),
      ('co_curricular','Sports'), ('co_curricular','Drama'), ('co_curricular','Debate'),
      ('co_curricular','Music'), ('co_curricular','Journalism'), ('co_curricular','Scouts'),
      ('co_curricular','Clubs'),
      ('support','Security'), ('support','Kitchen'), ('support','Health'),
      ('support','Maintenance'), ('support','Transport'), ('support','Library')
    ) AS t(kind, name) LOOP
      INSERT INTO public.departments (school_id, kind, name)
      VALUES (s.id, spec.kind, spec.name)
      ON CONFLICT (school_id, kind, name) DO NOTHING;
    END LOOP;

    SELECT id INTO dept_id FROM public.departments
      WHERE school_id = s.id AND kind='co_curricular' AND name='Sports' LIMIT 1;
    IF dept_id IS NOT NULL THEN
      INSERT INTO public.co_curricular_activities (school_id, department_id, name)
      SELECT s.id, dept_id, n FROM (VALUES ('Football'),('Rugby'),('Basketball'),('Volleyball'),('Athletics')) AS t(n)
      ON CONFLICT (school_id, name) DO NOTHING;
    END IF;
  END LOOP;
END $seed$;
