CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "admins manage roles in own school" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND (school_id = public.current_user_school() OR school_id IS NULL))
  WITH CHECK (public.is_admin(auth.uid()) AND (school_id = public.current_user_school() OR school_id IS NULL));
