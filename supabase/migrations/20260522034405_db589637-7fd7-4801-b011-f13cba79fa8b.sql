DROP POLICY IF EXISTS "tenant_isolation_bands" ON public.grading_bands;
CREATE POLICY "tenant_isolation_bands" ON public.grading_bands
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage bands" ON public.grading_bands;
CREATE POLICY "admin manage bands" ON public.grading_bands
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "tenant_isolation_scales" ON public.grading_scales;
CREATE POLICY "tenant_isolation_scales" ON public.grading_scales
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (school_id = current_user_school() OR has_role(auth.uid(),'super_admin'::app_role) OR is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "admin manage scales" ON public.grading_scales;
CREATE POLICY "admin manage scales" ON public.grading_scales
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role) OR is_platform_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'academic_master'::app_role) OR has_role(auth.uid(),'exams_admin'::app_role) OR is_platform_admin(auth.uid()));
