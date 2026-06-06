
-- ============================================================
-- Phase 2: Student & Parent portal links + read access
-- ============================================================

-- 1. Link tables
CREATE TABLE IF NOT EXISTS public.parent_student_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  student_id uuid NOT NULL,
  relationship text NOT NULL DEFAULT 'parent',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_user_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.student_user_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  student_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.parent_student_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_user_links  ENABLE ROW LEVEL SECURITY;

-- 2. Helper functions (SECURITY DEFINER to avoid recursive RLS)
CREATE OR REPLACE FUNCTION public.is_parent_of(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_links
    WHERE parent_user_id = auth.uid() AND student_id = _student_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_student(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_user_links
    WHERE user_id = auth.uid() AND student_id = _student_id
  )
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM public.student_user_links WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_children_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT student_id FROM public.parent_student_links WHERE parent_user_id = auth.uid()
$$;

-- 3. RLS on link tables (admins manage; users read own links)
CREATE POLICY "admin manage parent links" ON public.parent_student_links
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "parent read own links" ON public.parent_student_links
  FOR SELECT TO authenticated USING (parent_user_id = auth.uid());

CREATE POLICY "admin manage student links" ON public.student_user_links
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "student read own link" ON public.student_user_links
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- 4. Extend SELECT policies on existing data tables for student + parent read

-- students: a student/parent can read their own/child profile
CREATE POLICY "student self view"  ON public.students
  FOR SELECT TO authenticated USING (is_student(id));
CREATE POLICY "parent child view"  ON public.students
  FOR SELECT TO authenticated USING (is_parent_of(id));

-- attendance
CREATE POLICY "student self view attendance" ON public.attendance_records
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view attendance" ON public.attendance_records
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- exam results
CREATE POLICY "student self view results" ON public.exam_results
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view results" ON public.exam_results
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- invoices
CREATE POLICY "student self view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- payments (via invoice -> student)
CREATE POLICY "student self view payments" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_student(i.student_id))
  );
CREATE POLICY "parent child view payments" ON public.payments
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND is_parent_of(i.student_id))
  );

-- book loans
CREATE POLICY "student self view loans" ON public.book_loans
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view loans" ON public.book_loans
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- discipline records
CREATE POLICY "student self view discipline" ON public.discipline_records
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view discipline" ON public.discipline_records
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- clinic visits
CREATE POLICY "parent child view clinic" ON public.clinic_visits
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- dorm assignments
CREATE POLICY "student self view dorm" ON public.dorm_assignments
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view dorm" ON public.dorm_assignments
  FOR SELECT TO authenticated USING (is_parent_of(student_id));

-- transport assignments
CREATE POLICY "student self view transport" ON public.transport_assignments
  FOR SELECT TO authenticated USING (is_student(student_id));
CREATE POLICY "parent child view transport" ON public.transport_assignments
  FOR SELECT TO authenticated USING (is_parent_of(student_id));
