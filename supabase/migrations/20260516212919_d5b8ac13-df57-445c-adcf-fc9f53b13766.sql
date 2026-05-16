
-- ============================================================
-- Phase 7: Governance, Lifecycle, Permission Engine, Intelligence
-- ============================================================

-- ---------- 1. STATUS / LIFECYCLE COLUMNS ----------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_reason text,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by uuid,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_to text,
  ADD COLUMN IF NOT EXISTS parent_auth_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS national_id text;

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS lifecycle_reason text,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by uuid,
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_to text;

ALTER TABLE public.parent_student_links
  ADD COLUMN IF NOT EXISTS link_method text NOT NULL DEFAULT 'admin_override',
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS linked_by uuid;

-- ---------- 2. LIFECYCLE EVENTS ----------

CREATE TABLE IF NOT EXISTS public.lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  target_type text NOT NULL,   -- student | staff | profile
  target_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lifecycle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view lifecycle"   ON public.lifecycle_events FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "admins insert lifecycle" ON public.lifecycle_events FOR INSERT TO authenticated WITH CHECK (is_admin(auth.uid()) AND actor_id = auth.uid());

-- ---------- 3. PERMISSION ENGINE ----------

CREATE TABLE IF NOT EXISTS public.field_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  field text NOT NULL,
  required_level int NOT NULL DEFAULT 50,
  classification text NOT NULL DEFAULT 'editable',   -- editable | restricted | locked
  notes text,
  UNIQUE (resource, field)
);
ALTER TABLE public.field_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read policies"   ON public.field_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin manage policies" ON public.field_policies FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.override_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL,
  resource text NOT NULL,
  resource_id text NOT NULL,
  field text NOT NULL,
  old_value text,
  new_value text,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.override_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view overrides"   ON public.override_log FOR SELECT TO authenticated USING (is_admin(auth.uid()));
CREATE POLICY "auth insert overrides"  ON public.override_log FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.field_edit_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_role text,
  resource text NOT NULL,
  resource_id text NOT NULL,
  field text,
  old_value jsonb,
  new_value jsonb,
  override_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.field_edit_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view edits" ON public.field_edit_audit FOR SELECT TO authenticated USING (is_admin(auth.uid()));

-- role_level helper
CREATE OR REPLACE FUNCTION public.role_level(_user uuid)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(MAX(CASE role::text
    WHEN 'super_admin'     THEN 100
    WHEN 'principal'       THEN 90
    WHEN 'deputy_principal'THEN 80
    WHEN 'academic_master' THEN 75
    WHEN 'exams_admin'     THEN 70
    WHEN 'bursar'          THEN 70
    WHEN 'finance_admin'   THEN 70
    WHEN 'hod'             THEN 60
    WHEN 'class_teacher'   THEN 50
    WHEN 'subject_teacher' THEN 40
    WHEN 'teacher'         THEN 40
    WHEN 'admission_officer' THEN 60
    WHEN 'librarian'       THEN 50
    WHEN 'nurse'           THEN 50
    WHEN 'matron'          THEN 50
    WHEN 'boarding_admin'  THEN 60
    WHEN 'kitchen_admin'   THEN 60
    WHEN 'security_admin'  THEN 60
    WHEN 'transport_admin' THEN 60
    WHEN 'staff'           THEN 30
    WHEN 'student'         THEN 10
    WHEN 'parent'          THEN 5
    ELSE 20 END), 0)
  FROM public.user_roles WHERE user_id = _user
$$;

-- can_edit: returns (allowed, requires_override)
CREATE OR REPLACE FUNCTION public.can_edit(_user uuid, _resource text, _field text)
RETURNS TABLE(allowed boolean, requires_override boolean, classification text, required_level int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  pol record;
  lvl int := public.role_level(_user);
BEGIN
  SELECT * INTO pol FROM public.field_policies WHERE resource = _resource AND field = _field LIMIT 1;
  IF pol IS NULL THEN
    -- default: editable for level >= 50, otherwise no
    RETURN QUERY SELECT (lvl >= 50)::boolean, false::boolean, 'editable'::text, 50;
    RETURN;
  END IF;
  IF pol.classification = 'locked' THEN
    RETURN QUERY SELECT (lvl >= 90)::boolean, true::boolean, pol.classification, pol.required_level;
  ELSIF pol.classification = 'restricted' THEN
    RETURN QUERY SELECT (lvl >= pol.required_level)::boolean, false::boolean, pol.classification, pol.required_level;
  ELSE
    RETURN QUERY SELECT (lvl >= pol.required_level)::boolean, false::boolean, pol.classification, pol.required_level;
  END IF;
END $$;

-- Seed field policies
INSERT INTO public.field_policies (resource, field, required_level, classification, notes) VALUES
  ('students','admission_no',     100,'locked','Immutable after admission'),
  ('students','unique_id',        100,'locked','Immutable'),
  ('students','first_name',        60,'restricted','Name correction needs HOD+'),
  ('students','last_name',         60,'restricted',null),
  ('students','date_of_birth',     90,'locked','Identity field'),
  ('students','national_id',       90,'locked',null),
  ('students','class_id',          60,'restricted','Class change'),
  ('students','phone',             30,'editable',null),
  ('students','address',           30,'editable',null),
  ('students','parent_phone',      30,'editable',null),
  ('students','parent_email',      30,'editable',null),
  ('students','medical_notes',     50,'editable',null),
  ('students','photo_url',         30,'editable',null),
  ('staff','employee_no',         100,'locked',null),
  ('staff','unique_id',           100,'locked',null),
  ('staff','first_name',           80,'restricted',null),
  ('staff','last_name',            80,'restricted',null),
  ('staff','role',                 90,'locked','Role change is principal+'),
  ('staff','department',           70,'restricted',null),
  ('staff','email',                70,'restricted',null),
  ('staff','phone',                30,'editable',null),
  ('staff','photo_url',            30,'editable',null),
  ('invoices','amount',           100,'locked','Invoice amounts immutable'),
  ('invoices','status',           100,'locked',null),
  ('payments','amount',           100,'locked',null),
  ('exam_results','score',         70,'restricted','Subject teacher+'),
  ('exam_results','grade',         70,'restricted',null),
  ('exam_results','verified',      75,'restricted','Academic master verifies')
ON CONFLICT (resource, field) DO NOTHING;

-- ---------- 4. CLASS-BASED FEES ----------

CREATE TABLE IF NOT EXISTS public.class_fee_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL,
  component text NOT NULL,    -- tuition | boarding | transport | meals
  amount numeric(12,2) NOT NULL DEFAULT 0,
  term text NOT NULL,
  year int NOT NULL DEFAULT EXTRACT(year FROM now()),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, component, term, year)
);
ALTER TABLE public.class_fee_components ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view fee components"   ON public.class_fee_components FOR SELECT TO authenticated USING (true);
CREATE POLICY "bursar manage fee components" ON public.class_fee_components FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar') OR has_role(auth.uid(),'finance_admin'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar') OR has_role(auth.uid(),'finance_admin'));

-- assign_class_fees: creates one invoice per component for a student's class+term
CREATE OR REPLACE FUNCTION public.assign_class_fees(_student uuid, _term text DEFAULT NULL, _year int DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s record; comp record; created_count int := 0; tterm text; tyear int;
BEGIN
  SELECT id, class_id INTO s FROM public.students WHERE id = _student;
  IF s.id IS NULL OR s.class_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(_term, current_term, 'Term 1'), COALESCE(_year, academic_year, EXTRACT(year FROM now())::int)
    INTO tterm, tyear FROM public.school_settings LIMIT 1;
  FOR comp IN
    SELECT * FROM public.class_fee_components
    WHERE class_id = s.class_id AND term = tterm AND year = tyear AND amount > 0
  LOOP
    INSERT INTO public.invoices (student_id, amount, due_date, status, invoice_no)
    SELECT s.id, comp.amount, CURRENT_DATE + INTERVAL '30 days', 'unpaid', ''
    WHERE NOT EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.student_id = s.id AND i.amount = comp.amount
        AND date_trunc('month', i.created_at) = date_trunc('month', now())
    );
    created_count := created_count + 1;
  END LOOP;
  RETURN created_count;
END $$;

-- ---------- 5. PARENT CODE + PENDING LINKS ----------

CREATE OR REPLACE FUNCTION public.generate_parent_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE code text; tries int := 0;
BEGIN
  LOOP
    code := 'PRN-' || EXTRACT(year FROM now())::text || '-' ||
            upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.students WHERE parent_auth_code = code);
    tries := tries + 1;
    IF tries > 10 THEN RAISE EXCEPTION 'Could not generate unique parent code'; END IF;
  END LOOP;
  RETURN code;
END $$;

CREATE OR REPLACE FUNCTION public.gen_parent_code_trg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.parent_auth_code IS NULL OR NEW.parent_auth_code = '' THEN
    NEW.parent_auth_code := public.generate_parent_code();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gen_parent_code ON public.students;
CREATE TRIGGER trg_gen_parent_code BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.gen_parent_code_trg();

-- backfill existing
UPDATE public.students SET parent_auth_code = public.generate_parent_code()
  WHERE parent_auth_code IS NULL;

CREATE TABLE IF NOT EXISTS public.pending_parent_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  parent_email text,
  parent_phone text,
  attempted_code text,
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_parent_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage pending links" ON public.pending_parent_links FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'admission_officer'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'admission_officer'));
CREATE POLICY "parent view own pending" ON public.pending_parent_links FOR SELECT TO authenticated
  USING (parent_user_id = auth.uid());

-- ---------- 6. SMART ALERTS ----------

CREATE TABLE IF NOT EXISTS public.smart_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,         -- academic | finance | attendance | discipline | workload | anomaly
  severity text NOT NULL DEFAULT 'info',  -- info | warn | high | critical
  title text NOT NULL,
  body text,
  subject_type text,              -- student | staff | class | system
  subject_id uuid,
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.smart_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin view alerts"   ON public.smart_alerts FOR SELECT TO authenticated USING (
  is_admin(auth.uid()) OR has_role(auth.uid(),'deputy_principal') OR has_role(auth.uid(),'academic_master')
  OR has_role(auth.uid(),'hod') OR has_role(auth.uid(),'class_teacher') OR has_role(auth.uid(),'bursar')
);
CREATE POLICY "admin manage alerts"  ON public.smart_alerts FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ---------- 7. BLOCK HARD DELETES ----------

CREATE OR REPLACE FUNCTION public.block_hard_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is not permitted on %. Use archive instead.', TG_TABLE_NAME;
END $$;

DROP TRIGGER IF EXISTS trg_block_delete_students ON public.students;
CREATE TRIGGER trg_block_delete_students BEFORE DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete();

DROP TRIGGER IF EXISTS trg_block_delete_staff ON public.staff;
CREATE TRIGGER trg_block_delete_staff BEFORE DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete();

DROP TRIGGER IF EXISTS trg_block_delete_profiles ON public.profiles;
CREATE TRIGGER trg_block_delete_profiles BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_hard_delete();

-- ---------- 8. AUDIT TRIGGERS ON SENSITIVE TABLES ----------

DROP TRIGGER IF EXISTS trg_audit_students ON public.students;
CREATE TRIGGER trg_audit_students AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_staff ON public.staff;
CREATE TRIGGER trg_audit_staff AFTER INSERT OR UPDATE OR DELETE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_exam_results ON public.exam_results;
CREATE TRIGGER trg_audit_exam_results AFTER INSERT OR UPDATE OR DELETE ON public.exam_results
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_invoices ON public.invoices;
CREATE TRIGGER trg_audit_invoices AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_payments ON public.payments;
CREATE TRIGGER trg_audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------- 9. TIGHTEN LOGIN LOOKUP ----------

CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uc.synthetic_email
  FROM public.user_credentials uc
  LEFT JOIN public.profiles p ON p.id = uc.user_id
  WHERE upper(uc.unique_id) = upper(_unique_id)
    AND uc.is_active = true
    AND (p.status IS NULL OR p.status = 'active')
  LIMIT 1;
$$;

-- ---------- 10. RESTRICT EXPELLED STUDENT VISIBILITY ----------

DROP POLICY IF EXISTS "relevant staff view students" ON public.students;
CREATE POLICY "relevant staff view students" ON public.students FOR SELECT TO authenticated
USING (
  (lifecycle_status NOT IN ('expelled','archived') AND (
    is_admin(auth.uid())
    OR has_role(auth.uid(),'teacher') OR has_role(auth.uid(),'class_teacher')
    OR has_role(auth.uid(),'subject_teacher') OR has_role(auth.uid(),'deputy_principal')
    OR has_role(auth.uid(),'admission_officer') OR has_role(auth.uid(),'nurse')
    OR has_role(auth.uid(),'matron') OR has_role(auth.uid(),'bursar')
    OR has_role(auth.uid(),'librarian') OR has_role(auth.uid(),'transport_officer')
    OR has_role(auth.uid(),'boarding') OR has_role(auth.uid(),'hod')
  ))
  OR (lifecycle_status IN ('expelled','archived','transferred') AND is_admin(auth.uid()))
);

-- ---------- 11. PARENT LINK MATCH HELPER ----------

CREATE OR REPLACE FUNCTION public.find_parent_match(_email text, _phone text)
RETURNS TABLE(student_id uuid, method text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, 'auto_email'::text FROM public.students
    WHERE _email IS NOT NULL AND _email <> '' AND lower(parent_email) = lower(_email)
  UNION
  SELECT id, 'auto_phone'::text FROM public.students
    WHERE _phone IS NOT NULL AND _phone <> '' AND parent_phone = _phone
$$;
