
CREATE TABLE public.live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  room_name TEXT NOT NULL UNIQUE,
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended','cancelled')),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_sessions_class_start ON public.live_sessions(class_id, scheduled_start DESC);
CREATE INDEX idx_live_sessions_school_id ON public.live_sessions(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_sessions TO authenticated;
GRANT ALL ON public.live_sessions TO service_role;
ALTER TABLE public.live_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view live sessions" ON public.live_sessions FOR SELECT TO authenticated
USING (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = public.current_student_id() AND s.class_id = live_sessions.class_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.class_id = live_sessions.class_id AND s.id IN (SELECT public.my_children_ids()))
  )
);

CREATE POLICY "manage live sessions" ON public.live_sessions FOR ALL TO authenticated
USING (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
  )
)
WITH CHECK (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
  )
);

CREATE TRIGGER trg_live_sessions_school BEFORE INSERT ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id();
CREATE TRIGGER trg_live_sessions_touch BEFORE UPDATE ON public.live_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.live_session_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  user_id UUID,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  duration_seconds INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX idx_lsa_session ON public.live_session_attendance(session_id);
CREATE INDEX idx_lsa_student ON public.live_session_attendance(student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_session_attendance TO authenticated;
GRANT ALL ON public.live_session_attendance TO service_role;
ALTER TABLE public.live_session_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view attendance" ON public.live_session_attendance FOR SELECT TO authenticated
USING (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
    OR student_id = public.current_student_id()
    OR student_id IN (SELECT public.my_children_ids())
  )
);

CREATE POLICY "student insert own attendance" ON public.live_session_attendance FOR INSERT TO authenticated
WITH CHECK (
  school_id = public.current_user_school()
  AND student_id = public.current_student_id()
);

CREATE POLICY "student update own attendance" ON public.live_session_attendance FOR UPDATE TO authenticated
USING (student_id = public.current_student_id())
WITH CHECK (student_id = public.current_student_id());

CREATE POLICY "staff manage attendance" ON public.live_session_attendance FOR ALL TO authenticated
USING (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
  )
)
WITH CHECK (
  school_id = public.current_user_school() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'teacher'::app_role)
    OR public.has_role(auth.uid(), 'class_teacher'::app_role)
    OR public.has_role(auth.uid(), 'subject_teacher'::app_role)
    OR public.has_role(auth.uid(), 'hod'::app_role)
    OR public.has_role(auth.uid(), 'academic_master'::app_role)
  )
);

CREATE TRIGGER trg_lsa_school BEFORE INSERT ON public.live_session_attendance
  FOR EACH ROW EXECUTE FUNCTION public.stamp_school_id();
