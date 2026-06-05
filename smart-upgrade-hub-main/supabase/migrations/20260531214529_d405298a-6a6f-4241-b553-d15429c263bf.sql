
-- 1. SCHOOLS: revoke sensitive columns + RESTRICTIVE tenant isolation
REVOKE SELECT (email, email_user, email_pass, email_host, email_port)
  ON public.schools FROM authenticated;

DROP POLICY IF EXISTS "schools tenant isolation" ON public.schools;
CREATE POLICY "schools tenant isolation"
  ON public.schools AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id = public.current_user_school() OR public.is_platform_admin(auth.uid()));

-- 2. SCHOOL_SETTINGS: RESTRICTIVE tenant isolation
DROP POLICY IF EXISTS "school_settings tenant isolation" ON public.school_settings;
CREATE POLICY "school_settings tenant isolation"
  ON public.school_settings AS RESTRICTIVE FOR SELECT TO authenticated
  USING (id = public.current_user_school() OR public.is_platform_admin(auth.uid()));

-- 3. STORAGE: lock down student-documents bucket
DROP POLICY IF EXISTS "Authenticated can read student docs"   ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload student docs" ON storage.objects;

DROP POLICY IF EXISTS "parents read student docs" ON storage.objects;
CREATE POLICY "parents read student docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND EXISTS (
      SELECT 1 FROM public.student_documents d
      WHERE d.file_path = storage.objects.name
        AND public.is_parent_of(d.student_id)
    )
  );

DROP POLICY IF EXISTS "students read own docs" ON storage.objects;
CREATE POLICY "students read own docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'student-documents'
    AND EXISTS (
      SELECT 1 FROM public.student_documents d
      WHERE d.file_path = storage.objects.name
        AND public.is_student(d.student_id)
    )
  );

-- 4. Recreate analytics views with security_invoker (no SECURITY DEFINER)
DROP VIEW IF EXISTS public.v_finance_summary  CASCADE;
DROP VIEW IF EXISTS public.v_attendance_daily CASCADE;
DROP VIEW IF EXISTS public.v_subject_means    CASCADE;
DROP VIEW IF EXISTS public.v_weak_students    CASCADE;

CREATE VIEW public.v_finance_summary WITH (security_invoker = true) AS
SELECT school_id,
  COALESCE(SUM(amount), 0) AS total_invoiced,
  COALESCE(SUM(paid), 0) AS total_paid,
  COALESCE(SUM(amount) - SUM(paid), 0) AS total_outstanding,
  CASE WHEN SUM(amount) > 0 THEN ROUND((SUM(paid)/SUM(amount)*100)::numeric,1) ELSE 0 END AS collection_pct,
  COUNT(*) FILTER (WHERE paid < amount AND status != 'cancelled') AS defaulters
FROM public.invoices GROUP BY school_id;

CREATE VIEW public.v_attendance_daily WITH (security_invoker = true) AS
SELECT date, school_id,
  COUNT(*) FILTER (WHERE status = 'present') AS present,
  COUNT(*) FILTER (WHERE status = 'absent') AS absent,
  COUNT(*) FILTER (WHERE status = 'late') AS late,
  COUNT(*) AS total
FROM public.attendance_records GROUP BY date, school_id;

CREATE VIEW public.v_subject_means WITH (security_invoker = true) AS
SELECT s.id AS subject_id, s.code AS subject_code, s.name AS subject_name,
  ROUND(AVG(er.score)::numeric, 1) AS mean_score, er.school_id
FROM public.exam_results er
JOIN public.subjects s ON s.id = er.subject_id
GROUP BY s.id, s.code, s.name, er.school_id;

CREATE VIEW public.v_weak_students WITH (security_invoker = true) AS
SELECT st.id AS student_id, st.admission_no, st.first_name, st.last_name,
  ROUND(AVG(er.score)::numeric, 1) AS mean_score, st.school_id
FROM public.exam_results er
JOIN public.students st ON st.id = er.student_id
GROUP BY st.id, st.admission_no, st.first_name, st.last_name, st.school_id
HAVING AVG(er.score) < 50;

GRANT SELECT ON public.v_finance_summary, public.v_attendance_daily,
                public.v_subject_means, public.v_weak_students TO authenticated;

-- 5. Fix mutable search_path on classroom helpers
CREATE OR REPLACE FUNCTION public.generate_class_join_code()
 RETURNS text LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE code text; n int;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    SELECT count(*) INTO n FROM public.classes WHERE join_code = code;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN code;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_class_join_code()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.join_code IS NULL THEN NEW.join_code := public.generate_class_join_code(); END IF;
  RETURN NEW;
END;
$function$;
