-- Department Subjects: explicit link, not inferred from teacher_subjects
--
-- Bug: the department workspace page derived "Department Subjects" by
-- unioning every subject taught (via teacher_subjects) by every staff
-- member assigned to that department. A teacher who teaches two subjects
-- (e.g. Faith Akinyi: Agriculture + Biology) made BOTH subjects show up
-- under the Agriculture department, even though Biology has nothing to do
-- with Agriculture — it's just that one teacher's second subject.
--
-- Fix: an explicit school-scoped junction table. subjects itself can't
-- carry a department_id directly because subjects is a shared, global
-- catalogue (no school_id) reused across every school on the platform —
-- department_id would collide across tenants. This table scopes the link
-- per school instead.

CREATE TABLE IF NOT EXISTS public.department_subjects (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  subject_id    uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, subject_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_subjects TO authenticated;
GRANT ALL ON public.department_subjects TO service_role;
ALTER TABLE public.department_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view department subjects" ON public.department_subjects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "admins manage department subjects" ON public.department_subjects
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_department_subjects_dept ON public.department_subjects(department_id);
CREATE INDEX IF NOT EXISTS idx_department_subjects_subject ON public.department_subjects(subject_id);

-- ── Backfill: match academics-kind departments to the subject of the same
-- name, per school. This is a one-time seed based on the naming convention
-- already in place (department "Biology" ↔ subject "Biology"). Departments
-- with no matching subject name (Administration, Finance, ICT, Sports,
-- Library, etc.) simply get no rows, which is correct — they aren't
-- single-subject departments.
INSERT INTO public.department_subjects (school_id, department_id, subject_id)
SELECT d.school_id, d.id, s.id
FROM public.departments d
JOIN public.subjects s ON lower(trim(s.name)) = lower(trim(d.name))
WHERE d.kind = 'academics'
ON CONFLICT (department_id, subject_id) DO NOTHING;
