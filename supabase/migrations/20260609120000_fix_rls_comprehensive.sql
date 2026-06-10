-- Idempotency cleanup: drop all policies this migration creates before recreating them
DROP POLICY IF EXISTS "admins manage classes" ON public.classes;
DROP POLICY IF EXISTS "admins manage subjects" ON public.subjects;
DROP POLICY IF EXISTS "admins manage staff" ON public.staff;
DROP POLICY IF EXISTS "admins manage exams" ON public.exams;
DROP POLICY IF EXISTS "teaching staff manage results" ON public.exam_results;
DROP POLICY IF EXISTS "admins see all roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins manage students" ON public.students;
DROP POLICY IF EXISTS "teaching staff manage attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "finance manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "finance manage fee_structures" ON public.fee_structures;
DROP POLICY IF EXISTS "staff manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "staff manage discipline" ON public.discipline_records;
DROP POLICY IF EXISTS "librarians manage books" ON public.books;
DROP POLICY IF EXISTS "librarians manage book_loans" ON public.book_loans;
DROP POLICY IF EXISTS "boarding manage dormitories" ON public.dormitories;
DROP POLICY IF EXISTS "boarding manage dorm_assignments" ON public.dorm_assignments;
DROP POLICY IF EXISTS "nurses manage clinic_visits" ON public.clinic_visits;
DROP POLICY IF EXISTS "transport manage routes" ON public.transport_routes;
DROP POLICY IF EXISTS "transport manage assignments" ON public.transport_assignments;
DROP POLICY IF EXISTS "admins manage timetable" ON public.timetable_slots;
DROP POLICY IF EXISTS "security manage gate_passes" ON public.gate_passes;
DROP POLICY IF EXISTS "admins manage rooms" ON public.rooms;
DROP POLICY IF EXISTS "admins manage period_templates" ON public.period_templates;

-- Expand is_admin() to include all admin-tier roles
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
    AND role IN ('super_admin','principal','deputy_principal','school_admin','academic_master','admission_officer')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin_strict(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','principal'))
$$;

CREATE OR REPLACE FUNCTION public.is_finance(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','principal','deputy_principal','school_admin','bursar','finance_admin','finance_user'))
$$;

CREATE OR REPLACE FUNCTION public.is_teaching(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','principal','deputy_principal','school_admin','academic_master','class_teacher','subject_teacher','teacher','hod','exams_admin','exams_user'))
$$;

-- CLASSES
DROP POLICY IF EXISTS "admins manage classes" ON public.classes;
CREATE POLICY "admins manage classes" ON public.classes FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()));

-- SUBJECTS
DROP POLICY IF EXISTS "admins manage subjects" ON public.subjects;
CREATE POLICY "admins manage subjects" ON public.subjects FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_teaching(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_teaching(auth.uid()));

-- STAFF
DROP POLICY IF EXISTS "admins manage staff" ON public.staff;
CREATE POLICY "admins manage staff" ON public.staff FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()));

-- EXAMS
DROP POLICY IF EXISTS "admins manage exams" ON public.exams;
CREATE POLICY "admins manage exams" ON public.exams FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_teaching(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_teaching(auth.uid()));

-- EXAM RESULTS
DROP POLICY IF EXISTS "teachers manage results" ON public.exam_results;
DROP POLICY IF EXISTS "admins manage results" ON public.exam_results;
CREATE POLICY "teaching staff manage results" ON public.exam_results FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_teaching(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_teaching(auth.uid()));

-- USER ROLES
DROP POLICY IF EXISTS "admins see all roles" ON public.user_roles;
CREATE POLICY "admins see all roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));

-- STUDENTS
DROP POLICY IF EXISTS "admins manage students" ON public.students;
DROP POLICY IF EXISTS "admission manage students" ON public.students;
CREATE POLICY "admins manage students" ON public.students FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'admission_officer')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'admission_officer')));

-- ATTENDANCE
DROP POLICY IF EXISTS "teachers manage attendance" ON public.attendance_records;
DROP POLICY IF EXISTS "admins manage attendance" ON public.attendance_records;
CREATE POLICY "teaching staff manage attendance" ON public.attendance_records FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_teaching(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_teaching(auth.uid()));

-- INVOICES
DROP POLICY IF EXISTS "admins manage invoices" ON public.invoices;
DROP POLICY IF EXISTS "finance manage invoices" ON public.invoices;
CREATE POLICY "finance manage invoices" ON public.invoices FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_finance(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_finance(auth.uid()));

-- FEE STRUCTURES
DROP POLICY IF EXISTS "admins manage fee_structures" ON public.fee_structures;
DROP POLICY IF EXISTS "finance manage fee_structures" ON public.fee_structures;
CREATE POLICY "finance manage fee_structures" ON public.fee_structures FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_finance(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_finance(auth.uid()));

-- ANNOUNCEMENTS
DROP POLICY IF EXISTS "admins manage announcements" ON public.announcements;
CREATE POLICY "staff manage announcements" ON public.announcements FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.is_teaching(auth.uid())))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.is_teaching(auth.uid())));

-- DISCIPLINE
DROP POLICY IF EXISTS "admins manage discipline" ON public.discipline_records;
CREATE POLICY "staff manage discipline" ON public.discipline_records FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'class_teacher') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'discipline_admin')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'class_teacher') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'discipline_admin')));

-- LIBRARY
DROP POLICY IF EXISTS "admins manage books" ON public.books;
DROP POLICY IF EXISTS "librarians manage books" ON public.books;
CREATE POLICY "librarians manage books" ON public.books FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'librarian') OR public.has_role(auth.uid(), 'library_admin') OR public.has_role(auth.uid(), 'library_user')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'librarian') OR public.has_role(auth.uid(), 'library_admin') OR public.has_role(auth.uid(), 'library_user')));

DROP POLICY IF EXISTS "admins manage book_loans" ON public.book_loans;
DROP POLICY IF EXISTS "librarians manage book_loans" ON public.book_loans;
CREATE POLICY "librarians manage book_loans" ON public.book_loans FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'librarian') OR public.has_role(auth.uid(), 'library_admin') OR public.has_role(auth.uid(), 'library_user')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'librarian') OR public.has_role(auth.uid(), 'library_admin') OR public.has_role(auth.uid(), 'library_user')));

-- BOARDING
DROP POLICY IF EXISTS "admins manage dormitories" ON public.dormitories;
DROP POLICY IF EXISTS "boarding manage dormitories" ON public.dormitories;
CREATE POLICY "boarding manage dormitories" ON public.dormitories FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'boarding') OR public.has_role(auth.uid(), 'boarding_admin') OR public.has_role(auth.uid(), 'boarding_user') OR public.has_role(auth.uid(), 'matron')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'boarding') OR public.has_role(auth.uid(), 'boarding_admin') OR public.has_role(auth.uid(), 'boarding_user') OR public.has_role(auth.uid(), 'matron')));

DROP POLICY IF EXISTS "admins manage dorm_assignments" ON public.dorm_assignments;
DROP POLICY IF EXISTS "boarding manage dorm_assignments" ON public.dorm_assignments;
CREATE POLICY "boarding manage dorm_assignments" ON public.dorm_assignments FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'boarding') OR public.has_role(auth.uid(), 'boarding_admin') OR public.has_role(auth.uid(), 'boarding_user') OR public.has_role(auth.uid(), 'matron')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'boarding') OR public.has_role(auth.uid(), 'boarding_admin') OR public.has_role(auth.uid(), 'boarding_user') OR public.has_role(auth.uid(), 'matron')));

-- CLINIC
DROP POLICY IF EXISTS "admins manage clinic_visits" ON public.clinic_visits;
DROP POLICY IF EXISTS "nurses manage clinic_visits" ON public.clinic_visits;
CREATE POLICY "nurses manage clinic_visits" ON public.clinic_visits FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'clinic_admin') OR public.has_role(auth.uid(), 'clinic_user')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'nurse') OR public.has_role(auth.uid(), 'clinic_admin') OR public.has_role(auth.uid(), 'clinic_user')));

-- TRANSPORT
DROP POLICY IF EXISTS "admins manage transport_routes" ON public.transport_routes;
DROP POLICY IF EXISTS "transport manage routes" ON public.transport_routes;
CREATE POLICY "transport manage routes" ON public.transport_routes FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'transport_admin') OR public.has_role(auth.uid(), 'transport_officer')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'transport_admin') OR public.has_role(auth.uid(), 'transport_officer')));

DROP POLICY IF EXISTS "admins manage transport_assignments" ON public.transport_assignments;
DROP POLICY IF EXISTS "transport manage assignments" ON public.transport_assignments;
CREATE POLICY "transport manage assignments" ON public.transport_assignments FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'transport_admin') OR public.has_role(auth.uid(), 'transport_officer')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'transport_admin') OR public.has_role(auth.uid(), 'transport_officer')));

-- TIMETABLE
DROP POLICY IF EXISTS "admins manage timetable" ON public.timetable_slots;
CREATE POLICY "admins manage timetable" ON public.timetable_slots FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_teaching(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_teaching(auth.uid()));

-- GATE PASSES
DROP POLICY IF EXISTS "admins manage gate_passes" ON public.gate_passes;
DROP POLICY IF EXISTS "security manage gate_passes" ON public.gate_passes;
CREATE POLICY "security manage gate_passes" ON public.gate_passes FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'security_admin') OR public.has_role(auth.uid(), 'security_user')))
  WITH CHECK (school_id = public.current_user_school() AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'security_admin') OR public.has_role(auth.uid(), 'security_user')));

-- ROOMS + PERIOD TEMPLATES
DROP POLICY IF EXISTS "admins manage rooms" ON public.rooms;
CREATE POLICY "admins manage rooms" ON public.rooms FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins manage period_templates" ON public.period_templates;
CREATE POLICY "admins manage period_templates" ON public.period_templates FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()));

GRANT EXECUTE ON FUNCTION public.is_admin_strict(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teaching(UUID) TO authenticated;
