-- ACADEMICS
CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE, name text NOT NULL, level text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view subjects" ON public.subjects;
DROP POLICY IF EXISTS "auth view subjects" ON public.subjects;
CREATE POLICY "auth view subjects" ON public.subjects FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "admins manage subjects" ON public.subjects;
CREATE POLICY "admins manage subjects" ON public.subjects FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, term text NOT NULL,
  year int NOT NULL DEFAULT EXTRACT(year FROM now()),
  start_date date, end_date date,
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;
GRANT ALL ON public.exams TO service_role;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view exams" ON public.exams;
DROP POLICY IF EXISTS "auth view exams" ON public.exams;
CREATE POLICY "auth view exams" ON public.exams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage exams" ON public.exams;
DROP POLICY IF EXISTS "admins manage exams" ON public.exams;
CREATE POLICY "admins manage exams" ON public.exams FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.exam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id uuid NOT NULL, student_id uuid NOT NULL, subject_id uuid NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  grade text, remarks text, recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_id, student_id, subject_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_results TO authenticated;
GRANT ALL ON public.exam_results TO service_role;
ALTER TABLE public.exam_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view results" ON public.exam_results;
DROP POLICY IF EXISTS "auth view results" ON public.exam_results;
CREATE POLICY "auth view results" ON public.exam_results FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "teachers manage results" ON public.exam_results;
DROP POLICY IF EXISTS "teachers manage results" ON public.exam_results;
CREATE POLICY "teachers manage results" ON public.exam_results FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role));

-- FINANCE
CREATE TABLE IF NOT EXISTS public.fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, level text NOT NULL, term text NOT NULL,
  year int NOT NULL DEFAULT EXTRACT(year FROM now()),
  amount numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_structures TO authenticated;
GRANT ALL ON public.fee_structures TO service_role;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view fees" ON public.fee_structures;
DROP POLICY IF EXISTS "auth view fees" ON public.fee_structures;
CREATE POLICY "auth view fees" ON public.fee_structures FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bursar manage fees" ON public.fee_structures;
DROP POLICY IF EXISTS "bursar manage fees" ON public.fee_structures;
CREATE POLICY "bursar manage fees" ON public.fee_structures FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role));

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  student_id uuid NOT NULL, fee_structure_id uuid,
  amount numeric(12,2) NOT NULL,
  paid numeric(12,2) NOT NULL DEFAULT 0,
  due_date date,
  status text NOT NULL DEFAULT 'unpaid',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view invoices" ON public.invoices;
DROP POLICY IF EXISTS "auth view invoices" ON public.invoices;
CREATE POLICY "auth view invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bursar manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "bursar manage invoices" ON public.invoices;
CREATE POLICY "bursar manage invoices" ON public.invoices FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role));

CREATE OR REPLACE FUNCTION public.gen_invoice_no() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int;
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN
    SELECT COALESCE(MAX(CAST(split_part(invoice_no,'-',2) AS int)),0)+1 INTO n
      FROM public.invoices WHERE invoice_no LIKE 'INV'||yr||'-%';
    NEW.invoice_no := 'INV'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gen_invoice_no ON public.invoices;
CREATE TRIGGER trg_gen_invoice_no BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.gen_invoice_no();

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL DEFAULT 'cash',
  reference text,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  received_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view payments" ON public.payments;
DROP POLICY IF EXISTS "auth view payments" ON public.payments;
CREATE POLICY "auth view payments" ON public.payments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "bursar manage payments" ON public.payments;
DROP POLICY IF EXISTS "bursar manage payments" ON public.payments;
CREATE POLICY "bursar manage payments" ON public.payments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role));

CREATE OR REPLACE FUNCTION public.gen_receipt_no() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int;
BEGIN
  IF NEW.receipt_no IS NULL OR NEW.receipt_no='' THEN
    SELECT COALESCE(MAX(CAST(split_part(receipt_no,'-',2) AS int)),0)+1 INTO n
      FROM public.payments WHERE receipt_no LIKE 'RCT'||yr||'-%';
    NEW.receipt_no := 'RCT'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_gen_receipt_no ON public.payments;
CREATE TRIGGER trg_gen_receipt_no BEFORE INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.gen_receipt_no();

CREATE OR REPLACE FUNCTION public.update_invoice_paid() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE total numeric(12,2); inv_amt numeric(12,2); inv uuid;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.payments WHERE invoice_id = inv;
  SELECT amount INTO inv_amt FROM public.invoices WHERE id = inv;
  UPDATE public.invoices SET paid = total,
    status = CASE WHEN total >= inv_amt THEN 'paid' WHEN total > 0 THEN 'partial' ELSE 'unpaid' END
    WHERE id = inv;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_upd_invoice_paid ON public.payments;
CREATE TRIGGER trg_upd_invoice_paid AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_invoice_paid();

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS payments_receipt_no_unique ON public.payments (receipt_no);

-- ATTENDANCE & DISCIPLINE
CREATE TABLE IF NOT EXISTS public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL, class_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'present',
  remarks text, recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "auth view attendance" ON public.attendance_records;
CREATE POLICY "auth view attendance" ON public.attendance_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "teachers manage attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "teachers manage attendance" ON public.attendance_records;
CREATE POLICY "teachers manage attendance" ON public.attendance_records FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'deputy_principal'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'deputy_principal'::app_role));

CREATE TABLE IF NOT EXISTS public.discipline_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'minor',
  description text NOT NULL,
  action_taken text, reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.discipline_records TO authenticated;
GRANT ALL ON public.discipline_records TO service_role;
ALTER TABLE public.discipline_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "auth view discipline" ON public.discipline_records;
CREATE POLICY "auth view discipline" ON public.discipline_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "staff manage discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "staff manage discipline" ON public.discipline_records;
CREATE POLICY "staff manage discipline" ON public.discipline_records FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'deputy_principal'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'deputy_principal'::app_role));

-- LIBRARY
CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  isbn text, title text NOT NULL, author text, category text,
  copies_total int NOT NULL DEFAULT 1,
  copies_available int NOT NULL DEFAULT 1,
  shelf text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view books" ON public.books;
DROP POLICY IF EXISTS "auth view books" ON public.books;
CREATE POLICY "auth view books" ON public.books FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "librarian manage books" ON public.books;
DROP POLICY IF EXISTS "librarian manage books" ON public.books;
CREATE POLICY "librarian manage books" ON public.books FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'librarian'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'librarian'::app_role));

CREATE TABLE IF NOT EXISTS public.book_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL, student_id uuid, staff_id uuid,
  borrowed_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  returned_on date,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_loans TO authenticated;
GRANT ALL ON public.book_loans TO service_role;
ALTER TABLE public.book_loans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view loans" ON public.book_loans;
DROP POLICY IF EXISTS "auth view loans" ON public.book_loans;
CREATE POLICY "auth view loans" ON public.book_loans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "librarian manage loans" ON public.book_loans;
DROP POLICY IF EXISTS "librarian manage loans" ON public.book_loans;
CREATE POLICY "librarian manage loans" ON public.book_loans FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'librarian'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'librarian'::app_role));

-- BOARDING
CREATE TABLE IF NOT EXISTS public.dormitories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, gender text NOT NULL,
  capacity int NOT NULL DEFAULT 40, matron_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dormitories TO authenticated;
GRANT ALL ON public.dormitories TO service_role;
ALTER TABLE public.dormitories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view dorms" ON public.dormitories;
DROP POLICY IF EXISTS "auth view dorms" ON public.dormitories;
CREATE POLICY "auth view dorms" ON public.dormitories FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "matron manage dorms" ON public.dormitories;
DROP POLICY IF EXISTS "matron manage dorms" ON public.dormitories;
CREATE POLICY "matron manage dorms" ON public.dormitories FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role));

CREATE TABLE IF NOT EXISTS public.dorm_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dormitory_id uuid NOT NULL, student_id uuid NOT NULL UNIQUE,
  bed_no text, assigned_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dorm_assignments TO authenticated;
GRANT ALL ON public.dorm_assignments TO service_role;
ALTER TABLE public.dorm_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view dorm asg" ON public.dorm_assignments;
DROP POLICY IF EXISTS "auth view dorm asg" ON public.dorm_assignments;
CREATE POLICY "auth view dorm asg" ON public.dorm_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "matron manage dorm asg" ON public.dorm_assignments;
DROP POLICY IF EXISTS "matron manage dorm asg" ON public.dorm_assignments;
CREATE POLICY "matron manage dorm asg" ON public.dorm_assignments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role));

-- TRANSPORT
CREATE TABLE IF NOT EXISTS public.transport_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, vehicle_reg text,
  driver_name text, driver_phone text,
  capacity int NOT NULL DEFAULT 40,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_routes TO authenticated;
GRANT ALL ON public.transport_routes TO service_role;
ALTER TABLE public.transport_routes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view routes" ON public.transport_routes;
DROP POLICY IF EXISTS "auth view routes" ON public.transport_routes;
CREATE POLICY "auth view routes" ON public.transport_routes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "transport manage routes" ON public.transport_routes;
DROP POLICY IF EXISTS "transport manage routes" ON public.transport_routes;
CREATE POLICY "transport manage routes" ON public.transport_routes FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role));

CREATE TABLE IF NOT EXISTS public.transport_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id uuid NOT NULL, student_id uuid NOT NULL UNIQUE,
  pickup_point text, assigned_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_assignments TO authenticated;
GRANT ALL ON public.transport_assignments TO service_role;
ALTER TABLE public.transport_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view t-asg" ON public.transport_assignments;
DROP POLICY IF EXISTS "auth view t-asg" ON public.transport_assignments;
CREATE POLICY "auth view t-asg" ON public.transport_assignments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "transport manage asg" ON public.transport_assignments;
DROP POLICY IF EXISTS "transport manage asg" ON public.transport_assignments;
CREATE POLICY "transport manage asg" ON public.transport_assignments FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role));

-- HEALTH
CREATE TABLE IF NOT EXISTS public.clinic_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  visit_date date NOT NULL DEFAULT CURRENT_DATE,
  symptoms text NOT NULL, diagnosis text, treatment text,
  referred_to text, attended_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_visits TO authenticated;
GRANT ALL ON public.clinic_visits TO service_role;
ALTER TABLE public.clinic_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "medical staff view clinic" ON public.clinic_visits;
DROP POLICY IF EXISTS "medical staff view clinic" ON public.clinic_visits;
CREATE POLICY "medical staff view clinic" ON public.clinic_visits
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'nurse'::app_role));
DROP POLICY IF EXISTS "nurse manage clinic" ON public.clinic_visits;
DROP POLICY IF EXISTS "nurse manage clinic" ON public.clinic_visits;
CREATE POLICY "nurse manage clinic" ON public.clinic_visits FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'nurse'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'nurse'::app_role));

-- COMMUNICATION
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, body text NOT NULL,
  audience text NOT NULL DEFAULT 'all',
  pinned boolean NOT NULL DEFAULT false,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view announcements" ON public.announcements;
DROP POLICY IF EXISTS "auth view announcements" ON public.announcements;
CREATE POLICY "auth view announcements" ON public.announcements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "admins manage announcements" ON public.announcements;
CREATE POLICY "admins manage announcements" ON public.announcements FOR ALL
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- TIMETABLE
CREATE TABLE IF NOT EXISTS public.timetable_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL, subject_id uuid NOT NULL, teacher_id uuid,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL, end_time time NOT NULL,
  room text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.timetable_slots TO authenticated;
GRANT ALL ON public.timetable_slots TO service_role;
ALTER TABLE public.timetable_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth view timetable" ON public.timetable_slots;
DROP POLICY IF EXISTS "auth view timetable" ON public.timetable_slots;
CREATE POLICY "auth view timetable" ON public.timetable_slots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admins manage timetable" ON public.timetable_slots;
DROP POLICY IF EXISTS "admins manage timetable" ON public.timetable_slots;
CREATE POLICY "admins manage timetable" ON public.timetable_slots FOR ALL
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));