
-- 1) Student documents -------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.student_doc_type AS ENUM (
    'birth_certificate','report_form','passport_photo',
    'medical_records','transfer_letter','national_id',
    'parent_id','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.student_documents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type    public.student_doc_type NOT NULL,
  file_path   text NOT NULL,
  file_name   text,
  mime_type   text,
  size_bytes  bigint,
  uploaded_by uuid,
  notes       text,
  school_id   uuid NOT NULL DEFAULT public.current_user_school() REFERENCES public.schools(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_documents_student ON public.student_documents(student_id);
CREATE INDEX IF NOT EXISTS idx_student_documents_school  ON public.student_documents(school_id);

ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admission staff manage student docs" ON public.student_documents;
CREATE POLICY "admission staff manage student docs" ON public.student_documents
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())
      OR public.has_role(auth.uid(),'admission_officer'::public.app_role)
      OR public.has_role(auth.uid(),'deputy_principal'::public.app_role))
  WITH CHECK (public.is_admin(auth.uid())
      OR public.has_role(auth.uid(),'admission_officer'::public.app_role)
      OR public.has_role(auth.uid(),'deputy_principal'::public.app_role));

DROP POLICY IF EXISTS "parent view child docs" ON public.student_documents;
CREATE POLICY "parent view child docs" ON public.student_documents
  FOR SELECT TO authenticated USING (public.is_parent_of(student_id));

DROP POLICY IF EXISTS "student view own docs" ON public.student_documents;
CREATE POLICY "student view own docs" ON public.student_documents
  FOR SELECT TO authenticated USING (public.is_student(student_id));

DROP POLICY IF EXISTS "tenant_isolation" ON public.student_documents;
CREATE POLICY "tenant_isolation" ON public.student_documents AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role));

DROP TRIGGER IF EXISTS trg_stamp_school_id ON public.student_documents;
CREATE TRIGGER trg_stamp_school_id BEFORE INSERT ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id();
DROP TRIGGER IF EXISTS trg_guard_school_id ON public.student_documents;
CREATE TRIGGER trg_guard_school_id BEFORE UPDATE ON public.student_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_school_id();

-- 2) Storage bucket + policies ----------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents','student-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "admission staff read student-documents" ON storage.objects;
CREATE POLICY "admission staff read student-documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'student-documents' AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'admission_officer'::public.app_role)
    OR public.has_role(auth.uid(),'deputy_principal'::public.app_role)
  ));

DROP POLICY IF EXISTS "admission staff write student-documents" ON storage.objects;
CREATE POLICY "admission staff write student-documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'student-documents' AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'admission_officer'::public.app_role)
    OR public.has_role(auth.uid(),'deputy_principal'::public.app_role)
  ));

DROP POLICY IF EXISTS "admission staff delete student-documents" ON storage.objects;
CREATE POLICY "admission staff delete student-documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'student-documents' AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(),'admission_officer'::public.app_role)
    OR public.has_role(auth.uid(),'deputy_principal'::public.app_role)
  ));

-- 3) Insurance policies + per-student enrollment -----------------------
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL DEFAULT public.current_user_school() REFERENCES public.schools(id),
  provider            text NOT NULL,
  policy_name         text NOT NULL,
  cover_amount        numeric(12,2),
  premium_per_student numeric(12,2) NOT NULL DEFAULT 0,
  starts_on           date,
  ends_on             date,
  is_default          boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_school ON public.insurance_policies(school_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_insurance_default_per_school
  ON public.insurance_policies(school_id) WHERE is_default;

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage insurance" ON public.insurance_policies;
CREATE POLICY "admin manage insurance" ON public.insurance_policies
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "auth view insurance" ON public.insurance_policies;
CREATE POLICY "auth view insurance" ON public.insurance_policies
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tenant_isolation" ON public.insurance_policies;
CREATE POLICY "tenant_isolation" ON public.insurance_policies AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_stamp_school_id ON public.insurance_policies;
CREATE TRIGGER trg_stamp_school_id BEFORE INSERT ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id();
DROP TRIGGER IF EXISTS trg_guard_school_id ON public.insurance_policies;
CREATE TRIGGER trg_guard_school_id BEFORE UPDATE ON public.insurance_policies FOR EACH ROW EXECUTE FUNCTION public.guard_school_id();

CREATE TABLE IF NOT EXISTS public.student_insurance (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  policy_id     uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE RESTRICT,
  enrolled_on   date NOT NULL DEFAULT CURRENT_DATE,
  school_id     uuid NOT NULL DEFAULT public.current_user_school() REFERENCES public.schools(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, policy_id)
);
CREATE INDEX IF NOT EXISTS idx_student_insurance_school ON public.student_insurance(school_id);

ALTER TABLE public.student_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage student insurance" ON public.student_insurance;
CREATE POLICY "admin manage student insurance" ON public.student_insurance
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "parent view child insurance" ON public.student_insurance;
CREATE POLICY "parent view child insurance" ON public.student_insurance
  FOR SELECT TO authenticated USING (public.is_parent_of(student_id));
DROP POLICY IF EXISTS "student view own insurance" ON public.student_insurance;
CREATE POLICY "student view own insurance" ON public.student_insurance
  FOR SELECT TO authenticated USING (public.is_student(student_id));
DROP POLICY IF EXISTS "tenant_isolation" ON public.student_insurance;
CREATE POLICY "tenant_isolation" ON public.student_insurance AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (school_id = public.current_user_school() OR public.has_role(auth.uid(),'super_admin'::public.app_role));
DROP TRIGGER IF EXISTS trg_stamp_school_id ON public.student_insurance;
CREATE TRIGGER trg_stamp_school_id BEFORE INSERT ON public.student_insurance FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id();
DROP TRIGGER IF EXISTS trg_guard_school_id ON public.student_insurance;
CREATE TRIGGER trg_guard_school_id BEFORE UPDATE ON public.student_insurance FOR EACH ROW EXECUTE FUNCTION public.guard_school_id();

-- 4) Helpers: auto-pick stream and dorm by capacity --------------------
CREATE OR REPLACE FUNCTION public.pick_class_for_level(_level text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH candidates AS (
    SELECT c.id, c.capacity,
           (SELECT count(*) FROM public.students s
             WHERE s.class_id = c.id AND s.status = 'active') AS load
    FROM public.classes c
    WHERE c.school_id = public.current_user_school()
      AND lower(c.name) = lower(_level)
      AND c.year = EXTRACT(year FROM now())::int
  )
  SELECT id FROM candidates
  WHERE load < capacity
  ORDER BY load ASC, random()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.pick_class_for_level(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pick_dorm_for_gender(_gender text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH candidates AS (
    SELECT d.id, d.capacity,
           (SELECT count(*) FROM public.dorm_assignments a
             WHERE a.dormitory_id = d.id) AS load
    FROM public.dormitories d
    WHERE d.school_id = public.current_user_school()
      AND (d.gender = _gender OR d.gender = 'mixed')
  )
  SELECT id FROM candidates
  WHERE load < capacity
  ORDER BY load ASC, random()
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.pick_dorm_for_gender(text) TO authenticated;
