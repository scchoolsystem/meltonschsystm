-- Fix: drop individual unique constraints on student_user_links that break
-- multi-school inserts, replace with composite constraints per school.

ALTER TABLE public.student_user_links 
  DROP CONSTRAINT IF EXISTS student_user_links_user_id_key;

ALTER TABLE public.student_user_links 
  DROP CONSTRAINT IF EXISTS student_user_links_student_id_key;

ALTER TABLE public.student_user_links
  ADD CONSTRAINT student_user_links_user_school_uniq 
  UNIQUE (user_id, school_id);

ALTER TABLE public.student_user_links
  ADD CONSTRAINT student_user_links_student_school_uniq
  UNIQUE (student_id, school_id);
