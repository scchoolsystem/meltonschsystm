-- Migration: per-subject grading scale override
-- Adds an optional scale_id to subjects so e.g. PE can use pass/fail
-- while Math uses the school default 8-4-4 scale.
-- Falls back to the school default scale when scale_id is NULL.

-- 1. Add nullable scale_id to subjects
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS scale_id UUID REFERENCES public.grading_scales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_scale ON public.subjects(scale_id);

-- 2. Update grade_for to accept an optional subject_id and resolve scale automatically.
--    Priority: subject's own scale → school default scale → null
CREATE OR REPLACE FUNCTION public.grade_for(
  p_school_id UUID,
  p_score     NUMERIC,
  p_subject_id UUID DEFAULT NULL
)
RETURNS TABLE(grade TEXT, remarks TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.grade, b.remarks
  FROM public.grading_bands b
  JOIN public.grading_scales s ON s.id = b.scale_id
  WHERE s.school_id = p_school_id
    AND p_score >= b.min_score
    AND p_score <= b.max_score
    AND s.id = COALESCE(
      -- Use subject's own scale if set
      (SELECT scale_id FROM public.subjects WHERE id = p_subject_id AND scale_id IS NOT NULL),
      -- Otherwise fall back to school default
      (SELECT id FROM public.grading_scales WHERE school_id = p_school_id AND is_default LIMIT 1)
    )
  ORDER BY b.min_score DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.grade_for(UUID, NUMERIC, UUID) TO authenticated, anon;

-- 3. Helper function: get scale bands for a subject (used by UI to show preview)
CREATE OR REPLACE FUNCTION public.get_subject_scale_bands(p_subject_id UUID, p_school_id UUID)
RETURNS TABLE(
  scale_id   UUID,
  scale_name TEXT,
  is_default BOOLEAN,
  min_score  NUMERIC,
  max_score  NUMERIC,
  grade      TEXT,
  remarks    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    s.id, s.name, s.is_default,
    b.min_score, b.max_score, b.grade, b.remarks
  FROM public.grading_bands b
  JOIN public.grading_scales s ON s.id = b.scale_id
  WHERE s.school_id = p_school_id
    AND s.id = COALESCE(
      (SELECT scale_id FROM public.subjects WHERE id = p_subject_id AND scale_id IS NOT NULL),
      (SELECT id FROM public.grading_scales WHERE school_id = p_school_id AND is_default LIMIT 1)
    )
  ORDER BY b.min_score DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_subject_scale_bands(UUID, UUID) TO authenticated, anon;
