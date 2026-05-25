
ALTER FUNCTION public.generate_parent_code() SET search_path = public;
ALTER FUNCTION public.gen_parent_code_trg() SET search_path = public;
ALTER FUNCTION public.block_hard_delete() SET search_path = public;
ALTER FUNCTION public.find_parent_match(text, text) SET search_path = public;
ALTER FUNCTION public.can_edit(uuid, text, text) SET search_path = public;
ALTER FUNCTION public.role_level(uuid) SET search_path = public;
ALTER FUNCTION public.assign_class_fees(uuid, text, int) SET search_path = public;

-- Restrict execute on new SECURITY DEFINER functions to authenticated only
REVOKE EXECUTE ON FUNCTION public.role_level(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_class_fees(uuid, text, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_parent_match(text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.role_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_class_fees(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_parent_match(text, text) TO authenticated;
