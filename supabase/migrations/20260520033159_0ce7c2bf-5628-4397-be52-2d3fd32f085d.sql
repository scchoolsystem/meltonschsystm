
DROP POLICY IF EXISTS "anon view schools basic" ON public.schools;
DROP POLICY IF EXISTS "anon view schools for login" ON public.schools;
REVOKE SELECT ON public.schools FROM anon;
GRANT SELECT (id, slug, name, motto, primary_color, logo_url, email_domain, created_at)
  ON public.schools TO anon;
CREATE POLICY "anon view schools public fields"
  ON public.schools FOR SELECT TO anon USING (true);

DROP TRIGGER IF EXISTS gen_parent_code_trg ON public.students;
DROP TRIGGER IF EXISTS trg_sync_parent_code_hash ON public.students;
DROP TRIGGER IF EXISTS sync_parent_code_hash ON public.students;
DROP FUNCTION IF EXISTS public.sync_parent_code_hash() CASCADE;
DROP FUNCTION IF EXISTS public.gen_parent_code_trg() CASCADE;
DROP FUNCTION IF EXISTS public.generate_parent_code() CASCADE;
ALTER TABLE public.students DROP COLUMN IF EXISTS parent_auth_code;

ALTER FUNCTION public.enqueue_email(text, jsonb)            SET search_path = pgmq, public;
ALTER FUNCTION public.delete_email(text, bigint)            SET search_path = pgmq, public;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = pgmq, public;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = pgmq, public;
