-- Fix school_features column name to match application code
ALTER TABLE school_features 
RENAME COLUMN feature TO feature_key;

-- Fix user_roles unique constraint to include school_id
ALTER TABLE user_roles 
DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;

ALTER TABLE user_roles 
ADD CONSTRAINT user_roles_user_id_role_school_key 
UNIQUE (user_id, role, school_id);
