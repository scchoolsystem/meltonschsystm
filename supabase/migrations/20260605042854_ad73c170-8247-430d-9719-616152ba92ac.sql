
-- Allow auto-fill: make school_id nullable on tables that have trg_autofill_school
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'exam_results','classroom_posts','classroom_submissions',
    'grading_bands','grading_scales','class_fee_components','mpesa_payment_intents',
    'live_sessions','live_session_attendance','kitchen_stock','meal_plans',
    'incident_reports','gate_passes','support_tickets','support_messages',
    'departments','sub_departments','co_curricular_activities',
    'teacher_subjects','staff_co_curricular',
    'student_documents','student_insurance','insurance_policies','smart_alerts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id DROP NOT NULL', t);
  END LOOP;
END $$;

-- Extra columns the UI passes
ALTER TABLE public.meal_plans      ADD COLUMN IF NOT EXISTS meal text,
                                   ADD COLUMN IF NOT EXISTS served_count int;
ALTER TABLE public.kitchen_stock   ADD COLUMN IF NOT EXISTS low_threshold numeric(12,2);
ALTER TABLE public.incident_reports ADD COLUMN IF NOT EXISTS location text,
                                    ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.live_sessions   ADD COLUMN IF NOT EXISTS room_name text;
ALTER TABLE public.classroom_posts ADD COLUMN IF NOT EXISTS due_date date;

-- field_policies.required_level should be numeric, but stored values may be text;
-- convert safely.
-- SKIP: column already int
-- -- SKIPPED (column already int): ALTER TABLE public.field_policies
--   ALTER COLUMN required_level TYPE int USING NULLIF(required_level,'')::int;
