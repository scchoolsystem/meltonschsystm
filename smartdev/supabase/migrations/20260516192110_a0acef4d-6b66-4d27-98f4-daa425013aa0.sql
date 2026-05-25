-- Phase 5: Exam verification + timetable clash prevention

ALTER TABLE public.exam_results
  ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

-- Prevent duplicate entries for the same student/subject/exam (enables upsert)
CREATE UNIQUE INDEX IF NOT EXISTS exam_results_unique_entry
  ON public.exam_results (exam_id, student_id, subject_id);

-- Let exams_admin manage results (in addition to existing teacher/admin policies)
DROP POLICY IF EXISTS "exams admin manage results" ON public.exam_results;
CREATE POLICY "exams admin manage results"
  ON public.exam_results
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'exams_admin'::app_role) OR public.has_role(auth.uid(), 'academic_master'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'exams_admin'::app_role) OR public.has_role(auth.uid(), 'academic_master'::app_role));

DROP POLICY IF EXISTS "exams admin view results" ON public.exam_results;
CREATE POLICY "exams admin view results"
  ON public.exam_results
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'exams_admin'::app_role) OR public.has_role(auth.uid(), 'academic_master'::app_role));

-- Timetable clash prevention (teacher OR room double-booked at overlapping times same day)
CREATE OR REPLACE FUNCTION public.check_timetable_clash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- teacher clash
  IF NEW.teacher_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.timetable_slots s
    WHERE s.id <> COALESCE(NEW.id, gen_random_uuid())
      AND s.teacher_id = NEW.teacher_id
      AND s.day_of_week = NEW.day_of_week
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Teacher is already booked in another class at this time';
  END IF;

  -- room clash
  IF NEW.room IS NOT NULL AND NEW.room <> '' AND EXISTS (
    SELECT 1 FROM public.timetable_slots s
    WHERE s.id <> COALESCE(NEW.id, gen_random_uuid())
      AND s.room = NEW.room
      AND s.day_of_week = NEW.day_of_week
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'Room % is already booked at this time', NEW.room;
  END IF;

  -- same-class same-time
  IF EXISTS (
    SELECT 1 FROM public.timetable_slots s
    WHERE s.id <> COALESCE(NEW.id, gen_random_uuid())
      AND s.class_id = NEW.class_id
      AND s.day_of_week = NEW.day_of_week
      AND s.start_time < NEW.end_time
      AND s.end_time > NEW.start_time
  ) THEN
    RAISE EXCEPTION 'This class already has a lesson scheduled in this time slot';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_timetable_clash ON public.timetable_slots;
CREATE TRIGGER trg_timetable_clash
  BEFORE INSERT OR UPDATE ON public.timetable_slots
  FOR EACH ROW EXECUTE FUNCTION public.check_timetable_clash();