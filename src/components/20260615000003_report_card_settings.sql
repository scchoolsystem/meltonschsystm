-- Migration: school-defined report card calculation settings
-- Schools define exactly how totals, means, overall grades and remarks work.

CREATE TABLE IF NOT EXISTS public.report_card_settings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,

  -- How to calculate the total score shown on report card
  -- 'sum'  = add all subject scores (e.g. 540 / 700)
  -- 'mean' = average of all subject scores (e.g. 77.1)
  total_method        TEXT NOT NULL DEFAULT 'sum' CHECK (total_method IN ('sum', 'mean')),

  -- Max score per subject (used to show e.g. 78/100)
  max_score_per_subject NUMERIC NOT NULL DEFAULT 100,

  -- Whether to show class position (rank) on report card
  show_position       BOOLEAN NOT NULL DEFAULT true,

  -- Whether to show subject position per subject
  show_subject_position BOOLEAN NOT NULL DEFAULT false,

  -- Overall grade: which scale to use for the mean score
  -- NULL means use the school default grading scale
  overall_scale_id    UUID REFERENCES public.grading_scales(id) ON DELETE SET NULL,

  -- Custom remarks mapped to grade letters (JSON: {"A":"Excellent","B":"Good",...})
  grade_remarks       JSONB NOT NULL DEFAULT '{
    "A":  "Excellent performance. Keep it up!",
    "A-": "Very good performance.",
    "B+": "Good performance. Aim higher.",
    "B":  "Good performance.",
    "B-": "Above average. Work harder.",
    "C+": "Average performance. More effort needed.",
    "C":  "Average. Needs to improve.",
    "C-": "Below average. Seek help.",
    "D+": "Weak performance. Must work harder.",
    "D":  "Weak. Urgent attention needed.",
    "D-": "Poor. Repeat work required.",
    "E":  "Fail. Must repeat.",
    "P":  "Pass.",
    "F":  "Fail."
  }'::jsonb,

  -- Principal / head teacher name shown on report card
  principal_name      TEXT,
  principal_title     TEXT DEFAULT 'Principal',

  -- Footer note printed at bottom of report card
  footer_note         TEXT DEFAULT 'This report card is computer generated and is valid without a signature.',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.report_card_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "school admin manage rc settings"
  ON public.report_card_settings FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_member_of(school_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.is_member_of(school_id));

CREATE POLICY "auth view rc settings"
  ON public.report_card_settings FOR SELECT TO authenticated
  USING (public.is_member_of(school_id));

CREATE TRIGGER report_card_settings_updated_at
  BEFORE UPDATE ON public.report_card_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Seed default settings for all existing schools
INSERT INTO public.report_card_settings (school_id)
SELECT id FROM public.schools
ON CONFLICT (school_id) DO NOTHING;

-- Function: calculate overall grade for a student in an exam
-- Uses the school's chosen overall scale and total_method
CREATE OR REPLACE FUNCTION public.get_student_report_summary(
  p_student_id UUID,
  p_exam_id    UUID,
  p_school_id  UUID
)
RETURNS TABLE(
  total_score    NUMERIC,
  mean_score     NUMERIC,
  subject_count  INT,
  overall_grade  TEXT,
  overall_remarks TEXT,
  position       INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_scale_id UUID;
  v_total_method TEXT;
  v_grade TEXT;
  v_remarks TEXT;
BEGIN
  -- Get school's report card settings
  SELECT
    COALESCE(rcs.overall_scale_id,
      (SELECT id FROM grading_scales WHERE school_id = p_school_id AND is_default LIMIT 1)),
    rcs.total_method
  INTO v_scale_id, v_total_method
  FROM report_card_settings rcs
  WHERE rcs.school_id = p_school_id;

  -- Fall back if no settings row yet
  IF v_scale_id IS NULL THEN
    SELECT id INTO v_scale_id
    FROM grading_scales WHERE school_id = p_school_id AND is_default LIMIT 1;
  END IF;
  IF v_total_method IS NULL THEN v_total_method := 'sum'; END IF;

  RETURN QUERY
  WITH results AS (
    SELECT er.score
    FROM exam_results er
    WHERE er.student_id = p_student_id AND er.exam_id = p_exam_id
  ),
  stats AS (
    SELECT
      COALESCE(SUM(score), 0)                    AS total,
      COALESCE(AVG(score), 0)                    AS mean,
      COUNT(*)::INT                              AS cnt
    FROM results
  ),
  grade_lookup AS (
    SELECT b.grade, COALESCE(
      (SELECT (rcs.grade_remarks->b.grade)::text
       FROM report_card_settings rcs WHERE rcs.school_id = p_school_id),
      b.remarks
    ) AS remarks
    FROM grading_bands b
    WHERE b.scale_id = v_scale_id
      AND (SELECT mean FROM stats) >= b.min_score
      AND (SELECT mean FROM stats) <= b.max_score
    ORDER BY b.min_score DESC
    LIMIT 1
  ),
  pos AS (
    -- Class position: rank this student's mean among all students in same exam
    SELECT COUNT(*) + 1 AS rank
    FROM (
      SELECT er2.student_id, AVG(er2.score) AS avg_score
      FROM exam_results er2
      WHERE er2.exam_id = p_exam_id
        AND er2.student_id != p_student_id
        AND er2.student_id IN (
          SELECT s.id FROM students s
          WHERE s.class_id = (SELECT class_id FROM students WHERE id = p_student_id)
        )
      GROUP BY er2.student_id
      HAVING AVG(er2.score) > (SELECT mean FROM stats)
    ) ranked
  )
  SELECT
    (SELECT total FROM stats),
    ROUND((SELECT mean FROM stats)::NUMERIC, 2),
    (SELECT cnt FROM stats),
    COALESCE((SELECT grade FROM grade_lookup), '—'),
    COALESCE((SELECT remarks FROM grade_lookup), ''),
    (SELECT rank FROM pos)::INT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_student_report_summary(UUID, UUID, UUID) TO authenticated;
