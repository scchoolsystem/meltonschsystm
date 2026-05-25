
-- 1. Grading scales
CREATE TABLE IF NOT EXISTS public.grading_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school() REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_scale_per_school
  ON public.grading_scales(school_id) WHERE is_default;

CREATE TABLE IF NOT EXISTS public.grading_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scale_id uuid NOT NULL REFERENCES public.grading_scales(id) ON DELETE CASCADE,
  school_id uuid NOT NULL DEFAULT current_user_school() REFERENCES public.schools(id) ON DELETE CASCADE,
  min_score numeric NOT NULL,
  max_score numeric NOT NULL,
  grade text NOT NULL,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (min_score <= max_score)
);
CREATE INDEX IF NOT EXISTS idx_bands_scale ON public.grading_bands(scale_id);

ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_bands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view scales" ON public.grading_scales;
CREATE POLICY "auth view scales" ON public.grading_scales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage scales" ON public.grading_scales;
DROP POLICY IF EXISTS "admin manage scales" ON public.grading_scales;
CREATE POLICY "admin manage scales" ON public.grading_scales FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role));
DROP POLICY IF EXISTS "tenant_isolation_scales" ON public.grading_scales;
DROP POLICY IF EXISTS "tenant_isolation_scales" ON public.grading_scales;
CREATE POLICY "tenant_isolation_scales" ON public.grading_scales AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "auth view bands" ON public.grading_bands;
CREATE POLICY "auth view bands" ON public.grading_bands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin manage bands" ON public.grading_bands;
DROP POLICY IF EXISTS "admin manage bands" ON public.grading_bands;
CREATE POLICY "admin manage bands" ON public.grading_bands FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role));
DROP POLICY IF EXISTS "tenant_isolation_bands" ON public.grading_bands;
DROP POLICY IF EXISTS "tenant_isolation_bands" ON public.grading_bands;
CREATE POLICY "tenant_isolation_bands" ON public.grading_bands AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role));

-- 2. Seed a default scale for every existing school
DO $$
DECLARE s record; sid uuid;
BEGIN
  FOR s IN SELECT id FROM public.schools LOOP
    IF NOT EXISTS (SELECT 1 FROM public.grading_scales WHERE school_id = s.id AND is_default) THEN
      INSERT INTO public.grading_scales(school_id,name,is_default)
        VALUES (s.id,'Default 8-4-4',true) RETURNING id INTO sid;
      INSERT INTO public.grading_bands(scale_id,school_id,min_score,max_score,grade,remarks) VALUES
        (sid,s.id,80,100,'A','Excellent'),
        (sid,s.id,75,79.99,'A-','Very good'),
        (sid,s.id,70,74.99,'B+','Very good'),
        (sid,s.id,65,69.99,'B','Good'),
        (sid,s.id,60,64.99,'B-','Good'),
        (sid,s.id,55,59.99,'C+','Above average'),
        (sid,s.id,50,54.99,'C','Average'),
        (sid,s.id,45,49.99,'C-','Below average'),
        (sid,s.id,40,44.99,'D+','Weak — needs improvement'),
        (sid,s.id,35,39.99,'D','Weak — needs improvement'),
        (sid,s.id,30,34.99,'D-','Poor — urgent help needed'),
        (sid,s.id,0,29.99,'E','Fail — repeat work required');
    END IF;
  END LOOP;
END $$;

-- 3. grade_for function — returns label + remarks for a school + raw score
CREATE OR REPLACE FUNCTION public.grade_for(p_school_id uuid, p_score numeric)
RETURNS TABLE(grade text, remarks text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.grade, b.remarks
  FROM public.grading_bands b
  JOIN public.grading_scales s ON s.id = b.scale_id AND s.is_default
  WHERE s.school_id = p_school_id
    AND p_score >= b.min_score AND p_score <= b.max_score
  ORDER BY b.min_score DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.grade_for(uuid, numeric) TO authenticated, anon;

-- 4. Leaving certificates
CREATE TABLE IF NOT EXISTS public.leaving_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school() REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  serial_no text NOT NULL,
  leaving_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text NOT NULL DEFAULT 'completion',
  conduct text NOT NULL DEFAULT 'good',
  achievements text,
  signed_by_name text,
  signed_by_title text,
  issued_by uuid,
  issued_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, serial_no),
  UNIQUE (school_id, student_id)
);
ALTER TABLE public.leaving_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin manage leaving" ON public.leaving_certificates;
CREATE POLICY "admin manage leaving" ON public.leaving_certificates FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
DROP POLICY IF EXISTS "student self view leaving" ON public.leaving_certificates;
CREATE POLICY "student self view leaving" ON public.leaving_certificates FOR SELECT TO authenticated
  USING (is_student(student_id));
DROP POLICY IF EXISTS "parent child view leaving" ON public.leaving_certificates;
CREATE POLICY "parent child view leaving" ON public.leaving_certificates FOR SELECT TO authenticated
  USING (is_parent_of(student_id));
DROP POLICY IF EXISTS "tenant_isolation_leaving" ON public.leaving_certificates;
CREATE POLICY "tenant_isolation_leaving" ON public.leaving_certificates AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role));

-- 5. M-Pesa payment intents (records STK push requests)
CREATE TABLE IF NOT EXISTS public.mpesa_payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT current_user_school() REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  initiated_by uuid,
  phone text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','completed')),
  checkout_request_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpesa_intents_inv ON public.mpesa_payment_intents(invoice_id);

ALTER TABLE public.mpesa_payment_intents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin bursar manage intents" ON public.mpesa_payment_intents;
CREATE POLICY "admin bursar manage intents" ON public.mpesa_payment_intents FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'bursar'::app_role));
DROP POLICY IF EXISTS "student self view intents" ON public.mpesa_payment_intents;
CREATE POLICY "student self view intents" ON public.mpesa_payment_intents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND is_student(i.student_id)));
DROP POLICY IF EXISTS "parent child view intents" ON public.mpesa_payment_intents;
CREATE POLICY "parent child view intents" ON public.mpesa_payment_intents FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND is_parent_of(i.student_id)));
DROP POLICY IF EXISTS "student insert own intents" ON public.mpesa_payment_intents;
CREATE POLICY "student insert own intents" ON public.mpesa_payment_intents FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM invoices i WHERE i.id = invoice_id AND (is_student(i.student_id) OR is_parent_of(i.student_id)))
    AND initiated_by = auth.uid()
  );
DROP POLICY IF EXISTS "tenant_isolation_intents" ON public.mpesa_payment_intents;
CREATE POLICY "tenant_isolation_intents" ON public.mpesa_payment_intents AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role));
