
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS join_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.generate_class_join_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE code text; n int;
BEGIN
  LOOP
    code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
    SELECT count(*) INTO n FROM public.classes WHERE join_code = code;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN code;
END;
$$;

UPDATE public.classes SET join_code = public.generate_class_join_code() WHERE join_code IS NULL;

CREATE OR REPLACE FUNCTION public.set_class_join_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.join_code IS NULL THEN NEW.join_code := public.generate_class_join_code(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_class_join_code ON public.classes;
CREATE TRIGGER trg_set_class_join_code
BEFORE INSERT ON public.classes FOR EACH ROW EXECUTE FUNCTION public.set_class_join_code();

CREATE TABLE IF NOT EXISTS public.classroom_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  author_id uuid,
  kind text NOT NULL DEFAULT 'announcement',
  title text NOT NULL,
  body text,
  attachment_url text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.classroom_posts TO authenticated;
GRANT ALL ON public.classroom_posts TO service_role;

ALTER TABLE public.classroom_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_classroom_posts"
ON public.classroom_posts FOR ALL TO authenticated
USING ((school_id = current_user_school()) OR has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK ((school_id = current_user_school()) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "class_members_view_posts"
ON public.classroom_posts FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'class_teacher'::app_role)
  OR has_role(auth.uid(), 'subject_teacher'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.students s
    LEFT JOIN public.student_user_links sul ON sul.student_id = s.id
    LEFT JOIN public.parent_student_links psl ON psl.student_id = s.id
    WHERE s.class_id = classroom_posts.class_id
      AND (sul.user_id = auth.uid() OR psl.parent_user_id = auth.uid())
  )
);

CREATE POLICY "teachers_manage_posts"
ON public.classroom_posts FOR ALL TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'class_teacher'::app_role) OR has_role(auth.uid(), 'subject_teacher'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'class_teacher'::app_role) OR has_role(auth.uid(), 'subject_teacher'::app_role));

CREATE INDEX IF NOT EXISTS idx_classroom_posts_class ON public.classroom_posts(class_id, created_at DESC);
