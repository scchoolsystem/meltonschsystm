-- Wave 3: READ-ONLY audit script (NOT a migration). Do not run from CI.
-- Copy-paste into the Supabase SQL editor to inspect data quality.
--
-- 1. Tables in public.* that have a school_id column allowing NULL.
SELECT table_name, column_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'school_id'
  AND is_nullable = 'YES'
ORDER BY table_name;

-- 2. Tables in public.* with a school_id column but no FK to public.schools.
SELECT c.table_name, c.column_name
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage k
  ON k.table_schema = c.table_schema
 AND k.table_name = c.table_name
 AND k.column_name = c.column_name
LEFT JOIN information_schema.referential_constraints r
  ON r.constraint_name = k.constraint_name
WHERE c.table_schema = 'public'
  AND c.column_name = 'school_id'
  AND r.constraint_name IS NULL
ORDER BY c.table_name;

-- 3. Orphan row check: rows where school_id points to a non-existent school.
-- Build a dynamic UNION ALL of every public.* table that has school_id.
DO $$
DECLARE rec RECORD; sql text := '';
BEGIN
  FOR rec IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'school_id'
  LOOP
    sql := sql || format(
      'SELECT %L AS table_name, count(*) AS orphan_rows FROM public.%I t WHERE t.school_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.schools s WHERE s.id = t.school_id) UNION ALL ',
      rec.table_name, rec.table_name
    );
  END LOOP;
  IF sql <> '' THEN
    sql := left(sql, length(sql) - length(' UNION ALL '));
    sql := 'SELECT * FROM (' || sql || ') q WHERE orphan_rows > 0 ORDER BY orphan_rows DESC';
    RAISE NOTICE 'Run this to see orphans: %', sql;
  END IF;
END $$;

-- 4. Duplicate user_roles rows that would block the unique constraint.
SELECT user_id, role, count(*) AS dupes
FROM public.user_roles
GROUP BY user_id, role
HAVING count(*) > 1;

-- 5. user_roles entries pointing to a non-existent auth.users id.
SELECT ur.id, ur.user_id, ur.role
FROM public.user_roles ur
LEFT JOIN auth.users u ON u.id = ur.user_id
WHERE u.id IS NULL;
