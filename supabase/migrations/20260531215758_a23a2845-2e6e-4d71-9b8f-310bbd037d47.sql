CREATE OR REPLACE FUNCTION public.tg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.classroom_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id UUID NOT NULL DEFAULT current_user_school(),
  post_id UUID NOT NULL REFERENCES public.classroom_posts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  content TEXT,
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  grade NUMERIC,
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_by UUID,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_submissions TO authenticated;
GRANT ALL ON public.classroom_submissions TO service_role;

ALTER TABLE public.classroom_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_submissions"
ON public.classroom_submissions AS RESTRICTIVE FOR ALL TO authenticated
USING (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "students view own submissions"
ON public.classroom_submissions FOR SELECT TO authenticated
USING (is_student(student_id));

CREATE POLICY "students insert own submissions"
ON public.classroom_submissions FOR INSERT TO authenticated
WITH CHECK (is_student(student_id));

CREATE POLICY "students update own ungraded submissions"
ON public.classroom_submissions FOR UPDATE TO authenticated
USING (is_student(student_id) AND status = 'submitted')
WITH CHECK (is_student(student_id) AND status = 'submitted');

CREATE POLICY "parents view child submissions"
ON public.classroom_submissions FOR SELECT TO authenticated
USING (is_parent_of(student_id));

CREATE POLICY "teachers manage submissions"
ON public.classroom_submissions FOR ALL TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'class_teacher'::app_role)
  OR has_role(auth.uid(), 'subject_teacher'::app_role)
  OR has_role(auth.uid(), 'academic_master'::app_role)
)
WITH CHECK (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'class_teacher'::app_role)
  OR has_role(auth.uid(), 'subject_teacher'::app_role)
  OR has_role(auth.uid(), 'academic_master'::app_role)
);

CREATE INDEX idx_submissions_post ON public.classroom_submissions(post_id);
CREATE INDEX idx_submissions_student ON public.classroom_submissions(student_id);

CREATE TRIGGER tg_classroom_submissions_updated_at
BEFORE UPDATE ON public.classroom_submissions
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();
