
-- ============ PLATFORM ROLES (idempotent additions to app_role) ============
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_owner';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_support';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ SCHOOLS ============
CREATE TABLE IF NOT EXISTS public.schools (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text UNIQUE NOT NULL,
  name            text NOT NULL,
  motto           text,
  primary_color   text,
  logo_url        text,
  email           text,
  phone           text,
  address         text,
  academic_year   int,
  current_term    text,
  email_domain    text,
  status          text NOT NULL DEFAULT 'active',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_schools_updated ON public.schools;
CREATE TRIGGER trg_schools_updated BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ SCHOOL MEMBERS ============
CREATE TABLE IF NOT EXISTS public.school_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_school_members_user ON public.school_members(user_id);
CREATE INDEX IF NOT EXISTS idx_school_members_school ON public.school_members(school_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_members TO authenticated;
GRANT ALL ON public.school_members TO service_role;
ALTER TABLE public.school_members ENABLE ROW LEVEL SECURITY;

-- ============ FEATURE FLAGS ============
CREATE TABLE IF NOT EXISTS public.school_features (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, feature_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_features TO authenticated;
GRANT ALL ON public.school_features TO service_role;
ALTER TABLE public.school_features ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_school_features_updated ON public.school_features;
CREATE TRIGGER trg_school_features_updated BEFORE UPDATE ON public.school_features
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PLANS & SUBSCRIPTIONS ============
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,
  name        text NOT NULL,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_plans_updated ON public.subscription_plans;
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.school_subscriptions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_id               uuid NOT NULL REFERENCES public.subscription_plans(id),
  status                text NOT NULL DEFAULT 'active',
  amount_override       numeric(12,2),
  current_period_start  date,
  current_period_end    date,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_subscriptions TO authenticated;
GRANT ALL ON public.school_subscriptions TO service_role;
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_subs_updated ON public.school_subscriptions;
CREATE TRIGGER trg_subs_updated BEFORE UPDATE ON public.school_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ PLATFORM INVOICES & PAYMENTS ============
CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_no   text UNIQUE NOT NULL,
  period_start date,
  period_end   date,
  due_date     date,
  amount       numeric(12,2) NOT NULL DEFAULT 0,
  paid         numeric(12,2) NOT NULL DEFAULT 0,
  status       text NOT NULL DEFAULT 'unpaid',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_pinv_updated ON public.platform_invoices;
CREATE TRIGGER trg_pinv_updated BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  amount       numeric(12,2) NOT NULL,
  method       text NOT NULL DEFAULT 'manual',
  reference    text,
  notes        text,
  recorded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_payments TO authenticated;
GRANT ALL ON public.platform_payments TO service_role;
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;

-- Update invoice paid totals when payments change
CREATE OR REPLACE FUNCTION public.update_platform_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE total numeric(12,2); inv_amt numeric(12,2); inv uuid;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.platform_payments WHERE invoice_id = inv;
  SELECT amount INTO inv_amt FROM public.platform_invoices WHERE id = inv;
  UPDATE public.platform_invoices
    SET paid = total,
        status = CASE WHEN total >= inv_amt THEN 'paid' WHEN total > 0 THEN 'partial' ELSE 'unpaid' END
    WHERE id = inv;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_pp_update_inv ON public.platform_payments;
CREATE TRIGGER trg_pp_update_inv AFTER INSERT OR UPDATE OR DELETE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_invoice_paid();

-- ============ SCHOOL_ID columns on existing scoping tables ============
ALTER TABLE public.user_roles       ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.user_credentials ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_user_roles_school       ON public.user_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_credentials_school ON public.user_credentials(school_id);

-- ============ TENANT HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.my_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.school_members
   WHERE user_id = auth.uid()
   ORDER BY is_default DESC, created_at ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_member_of(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.school_members
     WHERE user_id = auth.uid() AND school_id = _school_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_platform()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid()
       AND role IN ('platform_owner','platform_support')
  )
$$;

CREATE OR REPLACE FUNCTION public.current_school_email_domain()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(s.email_domain, s.slug || '.school.erp')
    FROM public.school_members m
    JOIN public.schools s ON s.id = m.school_id
   WHERE m.user_id = auth.uid()
   ORDER BY m.is_default DESC, m.created_at ASC
   LIMIT 1
$$;

-- Overloaded lookup_login_email that accepts a school slug
CREATE OR REPLACE FUNCTION public.lookup_login_email(_unique_id text, _school_slug text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uc.synthetic_email
    FROM public.user_credentials uc
    LEFT JOIN public.schools s ON s.id = uc.school_id
   WHERE upper(uc.unique_id) = upper(_unique_id)
     AND uc.is_active = true
     AND (_school_slug IS NULL OR s.slug = _school_slug)
   LIMIT 1
$$;

-- ============ RLS POLICIES ============

-- schools
DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools FOR SELECT TO authenticated
  USING (public.is_platform() OR public.is_member_of(id));

DROP POLICY IF EXISTS schools_insert ON public.schools;
CREATE POLICY schools_insert ON public.schools FOR INSERT TO authenticated
  WITH CHECK (public.is_platform());

DROP POLICY IF EXISTS schools_update ON public.schools;
CREATE POLICY schools_update ON public.schools FOR UPDATE TO authenticated
  USING (public.is_platform() OR (public.is_member_of(id) AND public.is_admin(auth.uid())))
  WITH CHECK (public.is_platform() OR (public.is_member_of(id) AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS schools_delete ON public.schools;
CREATE POLICY schools_delete ON public.schools FOR DELETE TO authenticated
  USING (public.is_platform());

-- school_members
DROP POLICY IF EXISTS sm_select ON public.school_members;
CREATE POLICY sm_select ON public.school_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform() OR public.is_member_of(school_id));

DROP POLICY IF EXISTS sm_write ON public.school_members;
CREATE POLICY sm_write ON public.school_members FOR ALL TO authenticated
  USING (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid())))
  WITH CHECK (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid())));

-- school_features
DROP POLICY IF EXISTS sf_select ON public.school_features;
CREATE POLICY sf_select ON public.school_features FOR SELECT TO authenticated
  USING (public.is_platform() OR public.is_member_of(school_id));

DROP POLICY IF EXISTS sf_write ON public.school_features;
CREATE POLICY sf_write ON public.school_features FOR ALL TO authenticated
  USING (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid())))
  WITH CHECK (public.is_platform() OR (public.is_member_of(school_id) AND public.is_admin(auth.uid())));

-- subscription_plans
DROP POLICY IF EXISTS sp_select ON public.subscription_plans;
CREATE POLICY sp_select ON public.subscription_plans FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sp_write ON public.subscription_plans;
CREATE POLICY sp_write ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_platform()) WITH CHECK (public.is_platform());

-- school_subscriptions
DROP POLICY IF EXISTS ss_select ON public.school_subscriptions;
CREATE POLICY ss_select ON public.school_subscriptions FOR SELECT TO authenticated
  USING (public.is_platform() OR public.is_member_of(school_id));

DROP POLICY IF EXISTS ss_write ON public.school_subscriptions;
CREATE POLICY ss_write ON public.school_subscriptions FOR ALL TO authenticated
  USING (public.is_platform()) WITH CHECK (public.is_platform());

-- platform_invoices
DROP POLICY IF EXISTS pi_select ON public.platform_invoices;
CREATE POLICY pi_select ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.is_platform() OR public.is_member_of(school_id));

DROP POLICY IF EXISTS pi_write ON public.platform_invoices;
CREATE POLICY pi_write ON public.platform_invoices FOR ALL TO authenticated
  USING (public.is_platform()) WITH CHECK (public.is_platform());

-- platform_payments
DROP POLICY IF EXISTS pp_select ON public.platform_payments;
CREATE POLICY pp_select ON public.platform_payments FOR SELECT TO authenticated
  USING (
    public.is_platform()
    OR EXISTS (SELECT 1 FROM public.platform_invoices i
                WHERE i.id = invoice_id AND public.is_member_of(i.school_id))
  );

DROP POLICY IF EXISTS pp_write ON public.platform_payments;
CREATE POLICY pp_write ON public.platform_payments FOR ALL TO authenticated
  USING (public.is_platform()) WITH CHECK (public.is_platform());

-- ============ SEED A DEFAULT SCHOOL + FREE PLAN ============
INSERT INTO public.subscription_plans (slug, name, monthly_fee, description, is_active)
VALUES ('free', 'Free', 0, 'Default starter plan', true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.schools (slug, name, status)
VALUES ('school-1', 'My School', 'active')
ON CONFLICT (slug) DO NOTHING;
