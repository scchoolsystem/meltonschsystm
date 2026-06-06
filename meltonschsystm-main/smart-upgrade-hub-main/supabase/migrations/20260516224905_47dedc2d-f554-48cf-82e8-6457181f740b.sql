
-- Add missing FK constraints required for PostgREST embeds.
-- Using NOT VALID to avoid failing on any pre-existing orphan rows.

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT invoices_fee_structure_id_fkey FOREIGN KEY (fee_structure_id) REFERENCES public.fee_structures(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.attendance_records
  ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT attendance_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.discipline_records
  ADD CONSTRAINT discipline_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.exam_results
  ADD CONSTRAINT exam_results_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT exam_results_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT exam_results_exam_id_fkey FOREIGN KEY (exam_id) REFERENCES public.exams(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.book_loans
  ADD CONSTRAINT book_loans_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT book_loans_book_id_fkey FOREIGN KEY (book_id) REFERENCES public.books(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.clinic_visits
  ADD CONSTRAINT clinic_visits_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.dorm_assignments
  ADD CONSTRAINT dorm_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT dorm_assignments_dormitory_id_fkey FOREIGN KEY (dormitory_id) REFERENCES public.dormitories(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.gate_passes
  ADD CONSTRAINT gate_passes_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.transport_assignments
  ADD CONSTRAINT transport_assignments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT transport_assignments_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.transport_routes(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.parent_student_links
  ADD CONSTRAINT parent_student_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.student_user_links
  ADD CONSTRAINT student_user_links_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE NOT VALID;

ALTER TABLE public.timetable_slots
  ADD CONSTRAINT timetable_slots_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT timetable_slots_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE NOT VALID,
  ADD CONSTRAINT timetable_slots_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.staff(id) ON DELETE SET NULL NOT VALID;

ALTER TABLE public.class_fee_components
  ADD CONSTRAINT class_fee_components_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE NOT VALID;

-- Reload PostgREST schema cache so embeds are recognized immediately.
NOTIFY pgrst, 'reload schema';
