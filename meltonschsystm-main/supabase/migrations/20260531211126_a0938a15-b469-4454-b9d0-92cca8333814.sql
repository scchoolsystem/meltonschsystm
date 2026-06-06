-- =========================================================================
-- Insurance policies (idempotent — table may already exist with same shape)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school(),
  policy_name text NOT NULL,
  provider text NOT NULL,
  premium_per_student numeric(12,2) NOT NULL DEFAULT 0,
  cover_amount numeric(12,2),
  starts_on date,
  ends_on date,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_policies TO authenticated;
GRANT ALL ON public.insurance_policies TO service_role;

-- =========================================================================
-- Student ↔ Insurance enrolments
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.student_insurance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  policy_id uuid NOT NULL REFERENCES public.insurance_policies(id) ON DELETE RESTRICT,
  enrolled_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, policy_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_insurance TO authenticated;
GRANT ALL ON public.student_insurance TO service_role;
ALTER TABLE public.student_insurance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_student_insurance" ON public.student_insurance;
CREATE POLICY "tenant_isolation_student_insurance" ON public.student_insurance
  FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role));

-- =========================================================================
-- Student documents
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.student_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('birth_certificate','report_form','passport_photo','medical_records','transfer_letter','national_id','parent_id','other')),
  file_path text NOT NULL,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_documents TO authenticated;
GRANT ALL ON public.student_documents TO service_role;
ALTER TABLE public.student_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_student_documents" ON public.student_documents;
CREATE POLICY "tenant_isolation_student_documents" ON public.student_documents
  FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role));

-- =========================================================================
-- Storage bucket for student documents (private)
-- =========================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-documents', 'student-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated can upload student docs" ON storage.objects;
CREATE POLICY "Authenticated can upload student docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'student-documents');

DROP POLICY IF EXISTS "Authenticated can read student docs" ON storage.objects;
CREATE POLICY "Authenticated can read student docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'student-documents');

DROP POLICY IF EXISTS "Admins can delete student docs" ON storage.objects;
CREATE POLICY "Admins can delete student docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'student-documents' AND is_admin(auth.uid()));

-- =========================================================================
-- Analytics views — drop first to allow column renames
-- =========================================================================
DROP VIEW IF EXISTS public.v_finance_summary CASCADE;
DROP VIEW IF EXISTS public.v_attendance_daily CASCADE;
DROP VIEW IF EXISTS public.v_subject_means CASCADE;
DROP VIEW IF EXISTS public.v_weak_students CASCADE;

CREATE VIEW public.v_finance_summary AS
SELECT
  school_id,
  COALESCE(SUM(amount), 0) AS total_invoiced,
  COALESCE(SUM(paid), 0) AS total_paid,
  COALESCE(SUM(amount) - SUM(paid), 0) AS total_outstanding,
  CASE WHEN SUM(amount) > 0 THEN ROUND((SUM(paid)/SUM(amount)*100)::numeric,1) ELSE 0 END AS collection_pct,
  COUNT(*) FILTER (WHERE paid < amount AND status != 'cancelled') AS defaulters
FROM public.invoices
GROUP BY school_id;

CREATE VIEW public.v_attendance_daily AS
SELECT date, school_id,
  COUNT(*) FILTER (WHERE status = 'present') AS present,
  COUNT(*) FILTER (WHERE status = 'absent') AS absent,
  COUNT(*) FILTER (WHERE status = 'late') AS late,
  COUNT(*) AS total
FROM public.attendance_records
GROUP BY date, school_id;

CREATE VIEW public.v_subject_means AS
SELECT s.id AS subject_id, s.code AS subject_code, s.name AS subject_name,
  ROUND(AVG(er.score)::numeric, 1) AS mean_score,
  er.school_id
FROM public.exam_results er
JOIN public.subjects s ON s.id = er.subject_id
GROUP BY s.id, s.code, s.name, er.school_id;

CREATE VIEW public.v_weak_students AS
SELECT st.id AS student_id, st.admission_no, st.first_name, st.last_name,
  ROUND(AVG(er.score)::numeric, 1) AS mean_score,
  st.school_id
FROM public.exam_results er
JOIN public.students st ON st.id = er.student_id
GROUP BY st.id, st.admission_no, st.first_name, st.last_name, st.school_id
HAVING AVG(er.score) < 50;

GRANT SELECT ON public.v_finance_summary TO authenticated;
GRANT SELECT ON public.v_attendance_daily TO authenticated;
GRANT SELECT ON public.v_subject_means TO authenticated;
GRANT SELECT ON public.v_weak_students TO authenticated;
