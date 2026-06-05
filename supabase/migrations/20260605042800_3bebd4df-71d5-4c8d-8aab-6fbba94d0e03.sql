
-- ============ extra columns ============
ALTER TABLE public.classes  ADD COLUMN IF NOT EXISTS join_code text UNIQUE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_auth_code_hash text;

-- ============ helper RPCs ============
CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = auth.uid() AND role = 'platform_owner')
$$;

CREATE OR REPLACE FUNCTION public.role_level(_user_id uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(CASE role
    WHEN 'platform_owner'   THEN 100
    WHEN 'platform_support' THEN 90
    WHEN 'super_admin'      THEN 80
    WHEN 'principal'        THEN 70
    WHEN 'deputy_principal' THEN 60
    WHEN 'school_admin'     THEN 60
    WHEN 'academic_master'  THEN 50
    WHEN 'hod'              THEN 45
    WHEN 'bursar'           THEN 40
    WHEN 'class_teacher'    THEN 30
    WHEN 'subject_teacher'  THEN 25
    WHEN 'teacher'          THEN 25
    WHEN 'staff'            THEN 20
    WHEN 'parent'           THEN 10
    WHEN 'student'          THEN 5
    ELSE 15 END), 0)
  FROM public.user_roles WHERE user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.can_edit(_user_id uuid, _resource text, _field text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; lvl int;
BEGIN
  SELECT classification, required_level INTO p
    FROM public.field_policies WHERE resource = _resource AND field = _field LIMIT 1;
  IF NOT FOUND OR p.classification = 'editable' THEN RETURN true; END IF;
  IF p.classification = 'locked' THEN RETURN false; END IF;
  -- restricted
  SELECT public.role_level(_user_id) INTO lvl;
  RETURN lvl >= COALESCE(NULLIF(p.required_level,'')::int, 50);
END $$;

-- ============ helper to create a school-scoped table + RLS ============
-- (we inline below for clarity)

-- ============ Classroom ============
CREATE TABLE IF NOT EXISTS public.classroom_posts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id   uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES auth.users(id),
  kind       text NOT NULL DEFAULT 'note',
  title      text NOT NULL,
  body       text,
  due_at     timestamptz,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.classroom_submissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  post_id    uuid NOT NULL REFERENCES public.classroom_posts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  body       text,
  file_path  text,
  score      numeric(6,2),
  status     text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  graded_at  timestamptz,
  UNIQUE (post_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.live_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id        uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  host_id         uuid REFERENCES auth.users(id),
  title           text NOT NULL,
  scheduled_start timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'scheduled',
  started_at      timestamptz,
  ended_at        timestamptz,
  meeting_url     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.live_session_attendance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id       uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status           text NOT NULL DEFAULT 'present',
  duration_seconds int NOT NULL DEFAULT 0,
  joined_at        timestamptz,
  left_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

-- ============ Finance ============
CREATE TABLE IF NOT EXISTS public.class_fee_components (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id   uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  term       text,
  name       text NOT NULL,
  amount     numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mpesa_payment_intents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id     uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  phone          text NOT NULL,
  amount         numeric(12,2) NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  checkout_request_id text,
  mpesa_receipt  text,
  result_desc    text,
  error          text,
  initiated_by   uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_mpi_upd ON public.mpesa_payment_intents;
CREATE TRIGGER trg_mpi_upd BEFORE UPDATE ON public.mpesa_payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ Leaving certs ============
CREATE TABLE IF NOT EXISTS public.leaving_certificates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  serial_no       text NOT NULL,
  leaving_date    date NOT NULL,
  reason          text NOT NULL,
  conduct         text NOT NULL,
  achievements    text,
  signed_by_name  text,
  signed_by_title text,
  issued_by       uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, serial_no)
);

-- ============ Communications ============
CREATE TABLE IF NOT EXISTS public.email_send_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  to_email   text NOT NULL,
  subject    text,
  template   text,
  status     text NOT NULL DEFAULT 'queued',
  error      text,
  message_id text,
  sent_by    uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sms_queue (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  to_phone   text NOT NULL,
  body       text NOT NULL,
  status     text NOT NULL DEFAULT 'queued',
  error      text,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  channel    text NOT NULL,
  recipient  text,
  subject    text,
  body       text,
  status     text NOT NULL DEFAULT 'sent',
  error      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Grading ============
CREATE TABLE IF NOT EXISTS public.grading_scales (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.grading_bands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  scale_id   uuid NOT NULL REFERENCES public.grading_scales(id) ON DELETE CASCADE,
  grade      text NOT NULL,
  min_score  numeric(5,2) NOT NULL,
  max_score  numeric(5,2) NOT NULL,
  points     numeric(5,2) DEFAULT 0,
  remark     text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Kitchen / Catering ============
CREATE TABLE IF NOT EXISTS public.kitchen_stock (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item          text NOT NULL,
  quantity      numeric(12,2) NOT NULL DEFAULT 0,
  unit          text,
  reorder_level numeric(12,2) DEFAULT 0,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  meal_date  date NOT NULL,
  meal_type  text NOT NULL DEFAULT 'lunch',
  menu       text NOT NULL,
  posted_by  uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ Discipline / Ops ============
CREATE TABLE IF NOT EXISTS public.incident_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title         text NOT NULL,
  body          text,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  severity      text NOT NULL DEFAULT 'minor',
  reported_by   uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  exit_time   timestamptz,
  return_time timestamptz,
  reason      text,
  approved_by uuid REFERENCES auth.users(id),
  status      text NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ============ Support desk ============
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  subject    text NOT NULL,
  status     text NOT NULL DEFAULT 'open',
  opened_by  uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_st_upd ON public.support_tickets;
CREATE TRIGGER trg_st_upd BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.support_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ticket_id  uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id  uuid REFERENCES auth.users(id),
  body       text NOT NULL,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ GRANTS + RLS for all new tables (school-scoped) ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'classroom_posts','classroom_submissions','live_sessions','live_session_attendance',
    'class_fee_components','mpesa_payment_intents','leaving_certificates',
    'email_send_log','sms_queue','notifications_log',
    'grading_scales','grading_bands','kitchen_stock','meal_plans',
    'incident_reports','gate_passes','support_tickets','support_messages'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated '
      'USING (public.is_platform() OR school_id IS NULL OR public.is_member_of(school_id))',
      t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated '
      'USING (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid()))) '
      'WITH CHECK (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid())))',
      t, t);
  END LOOP;
END $$;
