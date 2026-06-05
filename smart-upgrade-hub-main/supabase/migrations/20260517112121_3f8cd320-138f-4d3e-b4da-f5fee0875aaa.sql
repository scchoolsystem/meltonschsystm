CREATE OR REPLACE FUNCTION public.stamp_school_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.school_id IS NULL THEN
    NEW.school_id := public.current_user_school();
  END IF;
  -- Allow NULL when there is no auth context (e.g. service-role inserts
  -- during auth.admin.createUser → handle_new_user trigger). The caller
  -- is responsible for linking the user to a school afterwards.
  IF NEW.school_id IS NULL AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'school_id is required but user has no school membership';
  END IF;
  RETURN NEW;
END
$function$;