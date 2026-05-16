
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
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN school_id SET DEFAULT public.current_user_school()', tbl);
  END LOOP;
END $$;
