-- Extended RLS scoping
DROP POLICY IF EXISTS "auth view discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "staff view discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "staff view discipline" ON public.discipline_records;
CREATE POLICY "staff view discipline" ON public.discipline_records
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'deputy_principal'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
  );

DROP POLICY IF EXISTS "staff view students" ON public.students;
DROP POLICY IF EXISTS "relevant staff view students" ON public.students;
DROP POLICY IF EXISTS "relevant staff view students" ON public.students;
CREATE POLICY "relevant staff view students" ON public.students
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
    OR has_role(auth.uid(), 'subject_teacher'::app_role)
    OR has_role(auth.uid(), 'deputy_principal'::app_role)
    OR has_role(auth.uid(), 'admission_officer'::app_role)
    OR has_role(auth.uid(), 'nurse'::app_role)
    OR has_role(auth.uid(), 'matron'::app_role)
    OR has_role(auth.uid(), 'bursar'::app_role)
    OR has_role(auth.uid(), 'librarian'::app_role)
    OR has_role(auth.uid(), 'transport_officer'::app_role)
    OR has_role(auth.uid(), 'boarding'::app_role)
    OR has_role(auth.uid(), 'hod'::app_role)
  );

DROP POLICY IF EXISTS "auth view staff" ON public.staff;
DROP POLICY IF EXISTS "admins or self view staff" ON public.staff;
DROP POLICY IF EXISTS "admins or self view staff" ON public.staff;
CREATE POLICY "admins or self view staff" ON public.staff
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS "auth view invoices" ON public.invoices;
DROP POLICY IF EXISTS "bursar view invoices" ON public.invoices;
DROP POLICY IF EXISTS "bursar view invoices" ON public.invoices;
CREATE POLICY "bursar view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'bursar'::app_role));

DROP POLICY IF EXISTS "auth view payments" ON public.payments;
DROP POLICY IF EXISTS "bursar view payments" ON public.payments;
DROP POLICY IF EXISTS "bursar view payments" ON public.payments;
CREATE POLICY "bursar view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'bursar'::app_role));

DROP POLICY IF EXISTS "auth view dorm asg" ON public.dorm_assignments;
DROP POLICY IF EXISTS "matron view dorm asg" ON public.dorm_assignments;
DROP POLICY IF EXISTS "matron view dorm asg" ON public.dorm_assignments;
CREATE POLICY "matron view dorm asg" ON public.dorm_assignments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'matron'::app_role) OR has_role(auth.uid(), 'boarding'::app_role));

DROP POLICY IF EXISTS "auth view t-asg" ON public.transport_assignments;
DROP POLICY IF EXISTS "transport view asg" ON public.transport_assignments;
DROP POLICY IF EXISTS "transport view asg" ON public.transport_assignments;
CREATE POLICY "transport view asg" ON public.transport_assignments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'transport_officer'::app_role));

DROP POLICY IF EXISTS "auth view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "teachers view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "teachers view attendance" ON public.attendance_records;
CREATE POLICY "teachers view attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
    OR has_role(auth.uid(), 'subject_teacher'::app_role)
    OR has_role(auth.uid(), 'deputy_principal'::app_role)
  );

DROP POLICY IF EXISTS "auth view results" ON public.exam_results;
DROP POLICY IF EXISTS "teachers view results" ON public.exam_results;
DROP POLICY IF EXISTS "teachers view results" ON public.exam_results;
CREATE POLICY "teachers view results" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
    OR has_role(auth.uid(), 'subject_teacher'::app_role)
    OR has_role(auth.uid(), 'hod'::app_role)
  );

DROP POLICY IF EXISTS "auth view loans" ON public.book_loans;
DROP POLICY IF EXISTS "librarian view loans" ON public.book_loans;
DROP POLICY IF EXISTS "librarian view loans" ON public.book_loans;
CREATE POLICY "librarian view loans" ON public.book_loans
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'librarian'::app_role));

-- Extended roles
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'school_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'academic_master';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exams_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'exams_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'finance_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boarding_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'boarding_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'kitchen_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'security_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'library_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'library_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'clinic_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'clinic_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sports_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sports_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'store_user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'transport_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'guidance_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'ict_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'discipline_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_support';

-- school_settings singleton
CREATE TABLE IF NOT EXISTS public.school_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  school_name text NOT NULL DEFAULT 'Greenfield Academy',
  email_domain text NOT NULL DEFAULT 'school.erp',
  credential_delivery_mode text NOT NULL DEFAULT 'hybrid'
    CHECK (credential_delivery_mode IN ('on_screen','email','hybrid')),
  logo_url text,
  primary_color text,
  motto text,
  address text,
  phone text,
  email text,
  academic_year integer DEFAULT EXTRACT(year FROM now())::int,
  current_term text DEFAULT 'Term 1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_settings_singleton_unique UNIQUE (singleton)
);
INSERT INTO public.school_settings (singleton) VALUES (true) ON CONFLICT (singleton) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_settings TO authenticated;
GRANT ALL ON public.school_settings TO service_role;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read settings" ON public.school_settings;
DROP POLICY IF EXISTS "auth read settings" ON public.school_settings;
CREATE POLICY "auth read settings" ON public.school_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage settings" ON public.school_settings;
DROP POLICY IF EXISTS "admin manage settings" ON public.school_settings;
CREATE POLICY "admin manage settings" ON public.school_settings
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- user_credentials
CREATE TABLE IF NOT EXISTS public.user_credentials (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  unique_id text NOT NULL UNIQUE,
  category text NOT NULL,
  synthetic_email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  password_reset_required boolean NOT NULL DEFAULT false,
  last_reset_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_credentials TO authenticated;
GRANT ALL ON public.user_credentials TO service_role;
ALTER TABLE public.user_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "self read credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "self read credentials" ON public.user_credentials;
CREATE POLICY "self read credentials" ON public.user_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
DROP POLICY IF EXISTS "admin manage credentials" ON public.user_credentials;
DROP POLICY IF EXISTS "admin manage credentials" ON public.user_credentials;
CREATE POLICY "admin manage credentials" ON public.user_credentials
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT synthetic_email FROM public.user_credentials
  WHERE upper(unique_id) = upper(_unique_id) AND is_active = true LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_login_email(text) TO anon, authenticated;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS unique_id text UNIQUE;
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS unique_id text UNIQUE;
ALTER TABLE public.staff    ADD COLUMN IF NOT EXISTS photo_url text;

CREATE TABLE IF NOT EXISTS public.unique_id_counters (
  category text NOT NULL,
  year int NOT NULL,
  last_value int NOT NULL DEFAULT 0,
  PRIMARY KEY (category, year)
);
GRANT SELECT, INSERT, UPDATE ON public.unique_id_counters TO authenticated;
GRANT ALL ON public.unique_id_counters TO service_role;
ALTER TABLE public.unique_id_counters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin read counters" ON public.unique_id_counters;
DROP POLICY IF EXISTS "admin read counters" ON public.unique_id_counters;
CREATE POLICY "admin read counters" ON public.unique_id_counters
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_unique_id(_category text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE yr int := EXTRACT(YEAR FROM now())::int; n int; pad int := 6;
BEGIN
  INSERT INTO public.unique_id_counters (category, year, last_value)
  VALUES (_category, yr, 1)
  ON CONFLICT (category, year)
  DO UPDATE SET last_value = public.unique_id_counters.last_value + 1
  RETURNING last_value INTO n;
  RETURN _category || '-' || yr::text || '-' || lpad(n::text, pad, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.next_unique_id(text) TO authenticated;

-- touch_updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_school_settings_updated ON public.school_settings;
DROP TRIGGER IF EXISTS trg_school_settings_updated ON public.school_settings;
CREATE TRIGGER trg_school_settings_updated
BEFORE UPDATE ON public.school_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- parent/student portal links
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  student_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'parent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_student_links TO authenticated;
GRANT ALL ON public.parent_student_links TO service_role;
ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.student_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  student_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_user_links TO authenticated;
GRANT ALL ON public.student_user_links TO service_role;
ALTER TABLE public.student_user_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_parent_of(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.parent_student_links
    WHERE parent_user_id = auth.uid() AND student_id = _student_id)
$$;

CREATE OR REPLACE FUNCTION public.is_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.student_user_links
    WHERE user_id = auth.uid() AND student_id = _student_id)
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM public.student_user_links WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM public.parent_student_links WHERE parent_user_id = auth.uid()
$$;

DROP POLICY IF EXISTS "admin manage parent links" ON public.parent_student_links;
DROP POLICY IF EXISTS "admin manage parent links" ON public.parent_student_links;
CREATE POLICY "admin manage parent links" ON public.parent_student_links
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "parent read own links" ON public.parent_student_links;
DROP POLICY IF EXISTS "parent read own links" ON public.parent_student_links;
CREATE POLICY "parent read own links" ON public.parent_student_links
  FOR SELECT TO authenticated USING (parent_user_id = auth.uid());
DROP POLICY IF EXISTS "admin manage student links" ON public.student_user_links;
DROP POLICY IF EXISTS "admin manage student links" ON public.student_user_links;
CREATE POLICY "admin manage student links" ON public.student_user_links
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "student read own link" ON public.student_user_links;
DROP POLICY IF EXISTS "student read own link" ON public.student_user_links;
CREATE POLICY "student read own link" ON public.student_user_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "student self view" ON public.students;
CREATE POLICY "student self view"  ON public.students FOR SELECT TO authenticated USING (is_student(id));
CREATE POLICY "parent child view"  ON public.students FOR SELECT TO authenticated USING (is_parent_of(id));
DROP POLICY IF EXISTS "student self view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "student self view attendance" ON public.attendance_records;
CREATE POLICY "student self view attendance" ON public.attendance_records FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "parent child view attendance" ON public.attendance_records;
CREATE POLICY "parent child view attendance" ON public.attendance_records FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view results" ON public.exam_results;
DROP POLICY IF EXISTS "student self view results" ON public.exam_results;
CREATE POLICY "student self view results" ON public.exam_results FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view results" ON public.exam_results;
DROP POLICY IF EXISTS "parent child view results" ON public.exam_results;
CREATE POLICY "parent child view results" ON public.exam_results FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view invoices" ON public.invoices;
DROP POLICY IF EXISTS "student self view invoices" ON public.invoices;
CREATE POLICY "student self view invoices" ON public.invoices FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view invoices" ON public.invoices;
DROP POLICY IF EXISTS "parent child view invoices" ON public.invoices;
CREATE POLICY "parent child view invoices" ON public.invoices FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view payments" ON public.payments;
DROP POLICY IF EXISTS "student self view payments" ON public.payments;
CREATE POLICY "student self view payments" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_student(i.student_id)));
DROP POLICY IF EXISTS "parent child view payments" ON public.payments;
DROP POLICY IF EXISTS "parent child view payments" ON public.payments;
CREATE POLICY "parent child view payments" ON public.payments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_parent_of(i.student_id)));
DROP POLICY IF EXISTS "student self view loans" ON public.book_loans;
DROP POLICY IF EXISTS "student self view loans" ON public.book_loans;
CREATE POLICY "student self view loans" ON public.book_loans FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view loans" ON public.book_loans;
DROP POLICY IF EXISTS "parent child view loans" ON public.book_loans;
CREATE POLICY "parent child view loans" ON public.book_loans FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "student self view discipline" ON public.discipline_records;
CREATE POLICY "student self view discipline" ON public.discipline_records FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "parent child view discipline" ON public.discipline_records;
CREATE POLICY "parent child view discipline" ON public.discipline_records FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "parent child view clinic" ON public.clinic_visits;
DROP POLICY IF EXISTS "parent child view clinic" ON public.clinic_visits;
CREATE POLICY "parent child view clinic" ON public.clinic_visits FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view dorm" ON public.dorm_assignments;
DROP POLICY IF EXISTS "student self view dorm" ON public.dorm_assignments;
CREATE POLICY "student self view dorm" ON public.dorm_assignments FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view dorm" ON public.dorm_assignments;
DROP POLICY IF EXISTS "parent child view dorm" ON public.dorm_assignments;
CREATE POLICY "parent child view dorm" ON public.dorm_assignments FOR SELECT TO authenticated USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "student self view transport" ON public.transport_assignments;
DROP POLICY IF EXISTS "student self view transport" ON public.transport_assignments;
CREATE POLICY "student self view transport" ON public.transport_assignments FOR SELECT TO authenticated USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view transport" ON public.transport_assignments;
DROP POLICY IF EXISTS "parent child view transport" ON public.transport_assignments;
CREATE POLICY "parent child view transport" ON public.transport_assignments FOR SELECT TO authenticated USING (is_parent_of(student_id));