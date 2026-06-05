
-- Audit trigger: logs changes to sensitive tables into activity_logs
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_entity_id text;
BEGIN
  v_entity_id := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END)::text,
    ''
  );
  INSERT INTO public.activity_logs(user_id, action, entity, entity_id, metadata)
  VALUES (
    v_uid,
    TG_OP || ':' || TG_TABLE_NAME,
    TG_TABLE_NAME,
    v_entity_id,
    jsonb_build_object(
      'before', CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
      'after',  CASE WHEN TG_OP IN ('UPDATE','INSERT') THEN to_jsonb(NEW) ELSE NULL END
    )
  );
  RETURN COALESCE(NEW, OLD);
END $$;

-- Attach audit triggers to sensitive tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'students','staff','user_roles','user_credentials','invoices','payments',
    'exam_results','timetable_slots','fee_structures','exams','school_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()',
      t, t
    );
  END LOOP;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON public.activity_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students (class_id);
CREATE INDEX IF NOT EXISTS idx_exam_results_exam_student ON public.exam_results (exam_id, student_id);
CREATE INDEX IF NOT EXISTS idx_invoices_student_status ON public.invoices (student_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_date_status ON public.attendance_records (date, status);
CREATE INDEX IF NOT EXISTS idx_tt_class_day ON public.timetable_slots (class_id, day_of_week, start_time);

-- Extend school_settings for branding & multi-school metadata
ALTER TABLE public.school_settings
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text,
  ADD COLUMN IF NOT EXISTS motto text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS academic_year integer DEFAULT EXTRACT(year FROM now())::int,
  ADD COLUMN IF NOT EXISTS current_term text DEFAULT 'Term 1';
