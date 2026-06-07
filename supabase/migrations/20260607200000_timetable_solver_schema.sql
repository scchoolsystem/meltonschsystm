-- =============================================================================
-- TIMETABLE SOLVER SCHEMA
-- Adds: period_templates, rooms, staff_availability, subject_room_requirements
-- Upgrades: subjects (lessons_per_week, preferred_time_of_day, allow_double_period)
--           timetable_slots (period_index, room_id)
-- All tables scoped to school_id, RLS-protected, additive only (IF NOT EXISTS)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.period_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  day_of_week  int         NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_index int         NOT NULL CHECK (period_index >= 1),
  label        text        NOT NULL,
  start_time   time        NOT NULL,
  end_time     time        NOT NULL,
  is_break     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, day_of_week, period_index)
);
CREATE INDEX IF NOT EXISTS idx_period_templates_school ON public.period_templates(school_id);
CREATE INDEX IF NOT EXISTS idx_period_templates_day    ON public.period_templates(school_id, day_of_week);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_templates TO authenticated;
GRANT ALL ON public.period_templates TO service_role;
ALTER TABLE public.period_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view period_templates" ON public.period_templates FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "admins manage period_templates" ON public.period_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = period_templates.school_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = period_templates.school_id));

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_period_templates_updated_at ON public.period_templates;
CREATE TRIGGER trg_period_templates_updated_at BEFORE UPDATE ON public.period_templates FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.rooms (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  room_type  text        NOT NULL DEFAULT 'classroom' CHECK (room_type IN ('classroom','science_lab','computer_lab','art_room','music_room','gym','library','other')),
  capacity   int         NOT NULL DEFAULT 40,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_rooms_school      ON public.rooms(school_id);
CREATE INDEX IF NOT EXISTS idx_rooms_school_type ON public.rooms(school_id, room_type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view rooms" ON public.rooms FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "admins manage rooms" ON public.rooms FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = rooms.school_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = rooms.school_id));
DROP TRIGGER IF EXISTS trg_rooms_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_updated_at BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.staff_availability (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  staff_id     uuid        NOT NULL REFERENCES public.staff(id)   ON DELETE CASCADE,
  day_of_week  int         NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  period_index int         NOT NULL CHECK (period_index >= 1),
  available    boolean     NOT NULL DEFAULT true,
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_id, day_of_week, period_index)
);
CREATE INDEX IF NOT EXISTS idx_staff_availability_school ON public.staff_availability(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_availability_staff  ON public.staff_availability(staff_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_availability TO authenticated;
GRANT ALL ON public.staff_availability TO service_role;
ALTER TABLE public.staff_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff view own availability" ON public.staff_availability FOR SELECT TO authenticated
  USING (staff_id IN (SELECT id FROM public.staff WHERE user_id = auth.uid()) OR EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = staff_availability.school_id));
CREATE POLICY "admins manage staff_availability" ON public.staff_availability FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = staff_availability.school_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = staff_availability.school_id));
DROP TRIGGER IF EXISTS trg_staff_availability_updated_at ON public.staff_availability;
CREATE TRIGGER trg_staff_availability_updated_at BEFORE UPDATE ON public.staff_availability FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.subject_room_requirements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  subject_id uuid        NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  room_type  text        NOT NULL DEFAULT 'classroom' CHECK (room_type IN ('classroom','science_lab','computer_lab','art_room','music_room','gym','library','other')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_subject_room_req_school  ON public.subject_room_requirements(school_id);
CREATE INDEX IF NOT EXISTS idx_subject_room_req_subject ON public.subject_room_requirements(subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subject_room_requirements TO authenticated;
GRANT ALL ON public.subject_room_requirements TO service_role;
ALTER TABLE public.subject_room_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view subject_room_requirements" ON public.subject_room_requirements FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "admins manage subject_room_requirements" ON public.subject_room_requirements FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = subject_room_requirements.school_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = subject_room_requirements.school_id));

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES public.schools(id)  ON DELETE CASCADE,
  staff_id   uuid        NOT NULL REFERENCES public.staff(id)    ON DELETE CASCADE,
  subject_id uuid        NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  is_primary boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, staff_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school  ON public.teacher_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_staff   ON public.teacher_subjects(staff_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_subject ON public.teacher_subjects(subject_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_subjects TO authenticated;
GRANT ALL ON public.teacher_subjects TO service_role;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school members view teacher_subjects" ON public.teacher_subjects FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM public.staff WHERE user_id = auth.uid()));
CREATE POLICY "admins manage teacher_subjects" ON public.teacher_subjects FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = teacher_subjects.school_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.staff s ON s.user_id = ur.user_id WHERE ur.user_id = auth.uid() AND ur.role IN ('super_admin','principal','deputy_principal') AND s.school_id = teacher_subjects.school_id));

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS lessons_per_week      int     NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS preferred_time_of_day text    NOT NULL DEFAULT 'any' CHECK (preferred_time_of_day IN ('morning','afternoon','any')),
  ADD COLUMN IF NOT EXISTS allow_double_period   boolean NOT NULL DEFAULT false;

ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS period_index int  REFERENCES public.period_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id      uuid REFERENCES public.rooms(id)            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timetable_slots_period ON public.timetable_slots(period_index);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_room   ON public.timetable_slots(room_id);

NOTIFY pgrst, 'reload schema';
