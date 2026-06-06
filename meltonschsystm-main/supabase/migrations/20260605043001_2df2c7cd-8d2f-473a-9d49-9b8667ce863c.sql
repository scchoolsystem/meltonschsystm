
ALTER TABLE public.classroom_submissions
  ADD COLUMN IF NOT EXISTS grade numeric(6,2),
  ADD COLUMN IF NOT EXISTS feedback text,
  ADD COLUMN IF NOT EXISTS graded_by uuid REFERENCES auth.users(id);

ALTER TABLE public.parent_student_links
  ADD COLUMN IF NOT EXISTS link_method text,
  ADD COLUMN IF NOT EXISTS verified boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_by uuid REFERENCES auth.users(id);

ALTER TABLE public.pending_parent_links
  ADD COLUMN IF NOT EXISTS parent_email text,
  ADD COLUMN IF NOT EXISTS parent_phone text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.email_send_log ADD COLUMN IF NOT EXISTS recipient_email text;
ALTER TABLE public.incident_reports ALTER COLUMN title DROP NOT NULL;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS sub_department_id uuid REFERENCES public.sub_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_title text,
  ADD COLUMN IF NOT EXISTS staff_category text,
  ADD COLUMN IF NOT EXISTS admin_unit text,
  ADD COLUMN IF NOT EXISTS support_unit text,
  ADD COLUMN IF NOT EXISTS assigned_area text,
  ADD COLUMN IF NOT EXISTS shift text,
  ADD COLUMN IF NOT EXISTS oversight text;

-- Replace role_level with _user-named signature
DROP FUNCTION IF EXISTS public.role_level(uuid);
CREATE FUNCTION public.role_level(_user uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(CASE role
    WHEN 'platform_owner' THEN 100 WHEN 'platform_support' THEN 90
    WHEN 'super_admin' THEN 80 WHEN 'principal' THEN 70
    WHEN 'deputy_principal' THEN 60 WHEN 'school_admin' THEN 60
    WHEN 'academic_master' THEN 50 WHEN 'hod' THEN 45 WHEN 'bursar' THEN 40
    WHEN 'class_teacher' THEN 30 WHEN 'subject_teacher' THEN 25 WHEN 'teacher' THEN 25
    WHEN 'staff' THEN 20 WHEN 'parent' THEN 10 WHEN 'student' THEN 5
    ELSE 15 END), 0)
  FROM public.user_roles WHERE user_id = _user
$$;

DROP FUNCTION IF EXISTS public.can_edit(uuid, text, text);
CREATE FUNCTION public.can_edit(_user uuid, _resource text, _field text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; lvl int;
BEGIN
  SELECT classification, required_level INTO p
    FROM public.field_policies WHERE resource = _resource AND field = _field LIMIT 1;
  IF NOT FOUND OR p.classification = 'editable' THEN
    RETURN jsonb_build_object('allowed', true, 'requires_override', false, 'classification','editable', 'required_level', 0);
  END IF;
  SELECT public.role_level(_user) INTO lvl;
  IF p.classification = 'locked' THEN
    RETURN jsonb_build_object('allowed', lvl >= 90, 'requires_override', true, 'classification','locked', 'required_level', 90);
  END IF;
  RETURN jsonb_build_object('allowed', lvl >= COALESCE(p.required_level,50), 'requires_override', false, 'classification','restricted', 'required_level', COALESCE(p.required_level,50));
END $$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'platform_owner')
$$;

CREATE OR REPLACE FUNCTION public.enqueue_email(_to text, _subject text, _template text, _payload jsonb, _queue_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_id uuid;
BEGIN
  INSERT INTO public.email_send_log (school_id, to_email, recipient_email, subject, template, template_name, status)
  VALUES (public.my_school_id(), _to, _to, _subject, _template, _template, 'queued')
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
