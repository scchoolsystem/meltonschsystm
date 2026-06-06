-- school_features.feature_key already exists in the original schema; no rename needed.

-- Fix user_roles unique constraint to include school_id (multi-school support)
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_school_key;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_user_id_role_school_key
  UNIQUE (user_id, role, school_id);
