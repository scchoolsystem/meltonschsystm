-- ============================================================
-- FIX: user_roles unique constraint must include school_id
-- ============================================================
-- The original migration created UNIQUE(user_id, role) without school_id.
-- This blocks assigning the same role to a user across multiple schools.
-- provisionSchoolAdmin already uses onConflict:"user_id,role,school_id"
-- which silently fails or errors against the old constraint.
--
-- Safe: this LOOSENS the constraint (allows same role in different schools)
-- while keeping per-school uniqueness. No existing valid data is affected.
-- ============================================================

-- 1. Drop the old two-column unique constraint
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

-- 2. Add the correct school-scoped unique index
--    (using a partial approach: when school_id is present, enforce uniqueness per school)
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_school_role_key
  ON public.user_roles (user_id, school_id, role);

-- 3. Also update the auto-assign trigger that fires on first user creation
--    (it inserted without school_id — needs to not conflict now that school_id is NOT NULL)
--    The trigger was from the original migration. We drop it entirely;
--    role assignment is now handled exclusively by provisionSchoolAdmin and createAccount.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
