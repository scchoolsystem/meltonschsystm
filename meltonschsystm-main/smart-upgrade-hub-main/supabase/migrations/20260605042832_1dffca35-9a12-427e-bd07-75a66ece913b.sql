
-- ============ exam_results: verification columns ============
ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS verified    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- ============ leaving_certificates ============
ALTER TABLE public.leaving_certificates
  ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.leaving_certificates ALTER COLUMN school_id DROP NOT NULL;

-- ============ grading_bands ============
ALTER TABLE public.grading_bands
  ADD COLUMN IF NOT EXISTS remarks text;

-- ============ field_policies ============
ALTER TABLE public.field_policies
  ADD COLUMN IF NOT EXISTS notes text;

-- ============ email_send_log ============
ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS template_name text;

-- ============ Auto-fill school_id trigger ============
CREATE OR REPLACE FUNCTION public.autofill_school_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.my_school_id();
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'exam_results','leaving_certificates','classroom_posts','classroom_submissions',
    'grading_bands','grading_scales','class_fee_components','mpesa_payment_intents',
    'live_sessions','live_session_attendance','kitchen_stock','meal_plans',
    'incident_reports','gate_passes','support_tickets','support_messages',
    'email_send_log','sms_queue','notifications_log','smart_alerts',
    'pending_parent_links','student_documents','student_insurance','insurance_policies',
    'departments','sub_departments','co_curricular_activities',
    'teacher_subjects','staff_co_curricular',
    'students','staff','invoices','payments','classes','subjects','exams',
    'fee_structures','dormitories','dorm_assignments','transport_routes',
    'transport_assignments','book_loans','books','clinic_visits','announcements',
    'attendance_records','discipline_records','timetable_slots','activity_logs',
    'student_user_links','parent_student_links','user_credentials','user_roles'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_autofill_school ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_autofill_school BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.autofill_school_id()', t);
  END LOOP;
END $$;

-- ============ Helper RPCs ============
CREATE OR REPLACE FUNCTION public.current_user_school()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.my_school_id()
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(_to text, _subject text, _template text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.email_send_log (school_id, to_email, subject, template, template_name, status)
  VALUES (public.my_school_id(), _to, _subject, _template, _template, 'queued')
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
