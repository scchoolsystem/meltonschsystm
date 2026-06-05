
-- Indexes for fast aggregation
CREATE INDEX IF NOT EXISTS idx_invoices_school ON public.invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_payments_school_paid_on ON public.payments(school_id, paid_on);
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance_records(school_id, date);
CREATE INDEX IF NOT EXISTS idx_exam_results_school ON public.exam_results(school_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_subject ON public.exam_results(subject_id);
CREATE INDEX IF NOT EXISTS idx_students_school_admission ON public.students(school_id, admission_no DESC);
CREATE INDEX IF NOT EXISTS idx_staff_school_emp ON public.staff(school_id, employee_no DESC);

-- Finance summary view (per-school)
CREATE OR REPLACE VIEW public.v_finance_summary
WITH (security_invoker = true) AS
SELECT
  school_id,
  COUNT(*)::int                            AS invoice_count,
  COALESCE(SUM(amount),0)::numeric         AS total_invoiced,
  COALESCE(SUM(paid),0)::numeric           AS total_paid,
  COUNT(*) FILTER (WHERE status <> 'paid')::int AS defaulters,
  CASE WHEN COALESCE(SUM(amount),0) > 0
       THEN ROUND((SUM(paid) / SUM(amount)) * 100, 2)
       ELSE 0 END                          AS collection_pct
FROM public.invoices
GROUP BY school_id;

-- Daily attendance (per-school, per-date)
CREATE OR REPLACE VIEW public.v_attendance_daily
WITH (security_invoker = true) AS
SELECT
  school_id,
  date,
  COUNT(*) FILTER (WHERE status = 'present')::int AS present,
  COUNT(*) FILTER (WHERE status = 'absent')::int  AS absent,
  COUNT(*) FILTER (WHERE status = 'late')::int    AS late,
  COUNT(*)::int AS total
FROM public.attendance_records
GROUP BY school_id, date;

-- Subject mean scores (per-school, per-subject)
CREATE OR REPLACE VIEW public.v_subject_means
WITH (security_invoker = true) AS
SELECT
  r.school_id,
  r.subject_id,
  s.code  AS subject_code,
  s.name  AS subject_name,
  COUNT(*)::int                           AS sample_size,
  ROUND(AVG(r.score)::numeric, 2)         AS mean_score
FROM public.exam_results r
LEFT JOIN public.subjects s ON s.id = r.subject_id
GROUP BY r.school_id, r.subject_id, s.code, s.name;

-- Class × subject mean
CREATE OR REPLACE VIEW public.v_results_by_class
WITH (security_invoker = true) AS
SELECT
  r.school_id,
  st.class_id,
  c.name  AS class_name,
  r.subject_id,
  s.code  AS subject_code,
  COUNT(*)::int                   AS sample_size,
  ROUND(AVG(r.score)::numeric, 2) AS mean_score
FROM public.exam_results r
JOIN public.students st ON st.id = r.student_id
LEFT JOIN public.classes c ON c.id = st.class_id
LEFT JOIN public.subjects s ON s.id = r.subject_id
GROUP BY r.school_id, st.class_id, c.name, r.subject_id, s.code;

-- Weak students (mean score < 50)
CREATE OR REPLACE VIEW public.v_weak_students
WITH (security_invoker = true) AS
SELECT
  r.school_id,
  r.student_id,
  st.admission_no,
  st.first_name,
  st.last_name,
  COUNT(*)::int                   AS sample_size,
  ROUND(AVG(r.score)::numeric, 2) AS mean_score
FROM public.exam_results r
JOIN public.students st ON st.id = r.student_id
GROUP BY r.school_id, r.student_id, st.admission_no, st.first_name, st.last_name
HAVING AVG(r.score) < 50;

GRANT SELECT ON public.v_finance_summary, public.v_attendance_daily,
  public.v_subject_means, public.v_results_by_class, public.v_weak_students
  TO authenticated;
