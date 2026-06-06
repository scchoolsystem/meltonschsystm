
-- clinic_visits
DROP POLICY IF EXISTS "auth view clinic" ON public.clinic_visits;
CREATE POLICY "medical staff view clinic" ON public.clinic_visits
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'nurse'::app_role));

-- discipline_records
DROP POLICY IF EXISTS "auth view discipline" ON public.discipline_records;
CREATE POLICY "staff view discipline" ON public.discipline_records
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'deputy_principal'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
  );

-- students
DROP POLICY IF EXISTS "staff view students" ON public.students;
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

-- staff (allow self-view + admin)
DROP POLICY IF EXISTS "auth view staff" ON public.staff;
CREATE POLICY "admins or self view staff" ON public.staff
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR user_id = auth.uid());

-- invoices
DROP POLICY IF EXISTS "auth view invoices" ON public.invoices;
CREATE POLICY "bursar view invoices" ON public.invoices
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'bursar'::app_role));

-- payments
DROP POLICY IF EXISTS "auth view payments" ON public.payments;
CREATE POLICY "bursar view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'bursar'::app_role));

-- dorm_assignments
DROP POLICY IF EXISTS "auth view dorm asg" ON public.dorm_assignments;
CREATE POLICY "matron view dorm asg" ON public.dorm_assignments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'matron'::app_role) OR has_role(auth.uid(), 'boarding'::app_role));

-- transport_assignments
DROP POLICY IF EXISTS "auth view t-asg" ON public.transport_assignments;
CREATE POLICY "transport view asg" ON public.transport_assignments
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'transport_officer'::app_role));

-- attendance_records
DROP POLICY IF EXISTS "auth view attendance" ON public.attendance_records;
CREATE POLICY "teachers view attendance" ON public.attendance_records
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
    OR has_role(auth.uid(), 'subject_teacher'::app_role)
    OR has_role(auth.uid(), 'deputy_principal'::app_role)
  );

-- exam_results
DROP POLICY IF EXISTS "auth view results" ON public.exam_results;
CREATE POLICY "teachers view results" ON public.exam_results
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'teacher'::app_role)
    OR has_role(auth.uid(), 'class_teacher'::app_role)
    OR has_role(auth.uid(), 'subject_teacher'::app_role)
    OR has_role(auth.uid(), 'hod'::app_role)
  );

-- book_loans
DROP POLICY IF EXISTS "auth view loans" ON public.book_loans;
CREATE POLICY "librarian view loans" ON public.book_loans
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'librarian'::app_role));

-- Restrict execute on SECURITY DEFINER helper functions
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated;
