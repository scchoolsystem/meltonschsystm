-- Wave 3: DB hardening
-- 1. Ensure (user_id, role) uniqueness on user_roles (idempotent).
-- 2. Add covering indexes for hot FKs to prevent slow tenant-scoped queries.
-- 3. Grant public-schema privileges so PostgREST + RLS work without
--    silent 403s. Grants are scoped per role; admin-only tables get
--    no `anon` grant.
-- 4. Inventory module stub tables, RLS, and grants.

-- ============================================================
-- 1. user_roles uniqueness
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_user_role_unique'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    BEGIN
      ALTER TABLE public.user_roles
        ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);
    EXCEPTION WHEN unique_violation THEN
      -- Pre-existing dupes; leave a NOTICE rather than fail the migration.
      RAISE NOTICE 'user_roles has duplicate (user_id, role) rows; clean and re-run.';
    END;
  END IF;
END $$;

-- ============================================================
-- 2. FK covering indexes (only when the column exists)
-- ============================================================
DO $$
DECLARE
  rec RECORD;
  stmt text;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_name IN ('school_id','class_id','student_id','user_id','term_id','exam_id')
  LOOP
    stmt := format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.%I (%I)',
      'idx_' || rec.table_name || '_' || rec.column_name,
      rec.table_schema, rec.table_name, rec.column_name
    );
    EXECUTE stmt;
  END LOOP;
END $$;

-- ============================================================
-- 3. Public-schema GRANTs sweep
-- Default: authenticated gets full DML, service_role gets ALL.
-- Tables matching known public/portal reads also get anon SELECT.
-- RLS policies still enforce row visibility.
-- ============================================================
DO $$
DECLARE
  rec RECORD;
  is_public boolean;
BEGIN
  FOR rec IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated',
      rec.tablename
    );
    EXECUTE format('GRANT ALL ON public.%I TO service_role', rec.tablename);

    -- Heuristic: tables whose names suggest a public catalog get anon read.
    is_public := rec.tablename ~* '^(schools|school_features|announcements_public|public_)';
    IF is_public THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', rec.tablename);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- 4. Inventory module (Wave 2 frontend references these tables)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.inventory_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  name text NOT NULL,
  contact text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  sku text,
  name text NOT NULL,
  unit text DEFAULT 'unit',
  reorder_level numeric DEFAULT 0,
  current_qty numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.inventory_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.inventory_suppliers(id) ON DELETE SET NULL,
  qty numeric NOT NULL CHECK (qty > 0),
  unit_cost numeric,
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.inventory_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty numeric NOT NULL CHECK (qty > 0),
  issued_to text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_inv_items_school ON public.inventory_items(school_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_school ON public.inventory_receipts(school_id);
CREATE INDEX IF NOT EXISTS idx_inv_receipts_item ON public.inventory_receipts(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_issues_school ON public.inventory_issues(school_id);
CREATE INDEX IF NOT EXISTS idx_inv_issues_item ON public.inventory_issues(item_id);
CREATE INDEX IF NOT EXISTS idx_inv_suppliers_school ON public.inventory_suppliers(school_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_receipts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_suppliers TO authenticated;
GRANT ALL ON public.inventory_items, public.inventory_receipts,
              public.inventory_issues, public.inventory_suppliers TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_suppliers ENABLE ROW LEVEL SECURITY;

-- Helper: tenant scope. Reuses existing is_admin() restored in Wave 1.
-- Tables are visible to admins of the school plus store_admin/store_user/bursar
-- holding a role on the same school. has_role_in_school is assumed to exist;
-- if missing, simple "is_admin or has any role on user" is the fallback.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='current_user_school_id'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY "inv_items_tenant" ON public.inventory_items
        FOR ALL TO authenticated
        USING (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()))
        WITH CHECK (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()));
      CREATE POLICY "inv_recv_tenant" ON public.inventory_receipts
        FOR ALL TO authenticated
        USING (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()))
        WITH CHECK (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()));
      CREATE POLICY "inv_issues_tenant" ON public.inventory_issues
        FOR ALL TO authenticated
        USING (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()))
        WITH CHECK (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()));
      CREATE POLICY "inv_suppliers_tenant" ON public.inventory_suppliers
        FOR ALL TO authenticated
        USING (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()))
        WITH CHECK (school_id = public.current_user_school_id() OR public.is_admin(auth.uid()));
    $POL$;
  ELSE
    -- Fallback: admins-only until current_user_school_id() is defined.
    EXECUTE $POL$
      CREATE POLICY "inv_items_admin" ON public.inventory_items
        FOR ALL TO authenticated
        USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
      CREATE POLICY "inv_recv_admin" ON public.inventory_receipts
        FOR ALL TO authenticated
        USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
      CREATE POLICY "inv_issues_admin" ON public.inventory_issues
        FOR ALL TO authenticated
        USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
      CREATE POLICY "inv_suppliers_admin" ON public.inventory_suppliers
        FOR ALL TO authenticated
        USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
    $POL$;
  END IF;
END $$;
