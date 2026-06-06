-- ============================================================
-- FIX: user_roles RLS — scope all writes to the admin's school
-- ============================================================
-- Problem 1: the old "admins manage roles" FOR ALL policy used
--   is_admin() alone. With the unique index now being
--   (user_id, school_id, role), a DELETE without school_id in
--   the WHERE matches 0 rows after RLS evaluation — silent no-op.
--
-- Problem 2: INSERT was not supplying school_id either, so
--   upsert conflicts were being silently swallowed or erroring
--   against the wrong constraint column list.
--
-- Fix: drop the blanket policy, replace with three scoped
--   policies that require school_id = current_user_school().
-- ============================================================

-- Drop the old blanket write policy (SELECT policies are fine, keep them)
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;

-- INSERT: admin can only insert roles for their own school
CREATE POLICY "admins insert roles in own school" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    AND school_id = public.current_user_school()
  );

-- UPDATE: admin can only update roles within their own school
CREATE POLICY "admins update roles in own school" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND school_id = public.current_user_school()
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    AND school_id = public.current_user_school()
  );

-- DELETE: admin can only delete roles within their own school
-- This is the critical fix — previously school_id was not checked
-- so the delete matched nothing and silently appeared to succeed
CREATE POLICY "admins delete roles in own school" ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.is_admin(auth.uid())
    AND school_id = public.current_user_school()
  );
