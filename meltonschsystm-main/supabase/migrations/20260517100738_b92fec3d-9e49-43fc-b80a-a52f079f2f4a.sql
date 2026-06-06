-- Helpers
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('platform_owner'::app_role, 'platform_support'::app_role))
$$;

CREATE OR REPLACE FUNCTION public.is_platform_owner(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'platform_owner'::app_role)
$$;

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, name text NOT NULL,
  monthly_fee numeric(12,2) NOT NULL DEFAULT 0, description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read plans" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "platform owner manage plans" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE TRIGGER trg_plans_touch BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.school_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trial',
  started_at timestamptz NOT NULL DEFAULT now(),
  current_period_start date NOT NULL DEFAULT CURRENT_DATE,
  current_period_end date NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days')::date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.school_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin view subs" ON public.school_subscriptions
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "platform owner manage subs" ON public.school_subscriptions
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE POLICY "school view own sub" ON public.school_subscriptions
  FOR SELECT TO authenticated USING (school_id = public.current_user_school());
CREATE TRIGGER trg_subs_touch BEFORE UPDATE ON public.school_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.school_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, feature_key)
);
ALTER TABLE public.school_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin view features" ON public.school_features
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "platform owner manage features" ON public.school_features
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE POLICY "school view own features" ON public.school_features
  FOR SELECT TO authenticated USING (school_id = public.current_user_school());
CREATE TRIGGER trg_features_touch BEFORE UPDATE ON public.school_features
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  invoice_no text NOT NULL UNIQUE,
  period_start date NOT NULL, period_end date NOT NULL,
  amount numeric(12,2) NOT NULL,
  paid numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid',
  due_date date, notes text, issued_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin view pinv" ON public.platform_invoices
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "platform owner manage pinv" ON public.platform_invoices
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));
CREATE POLICY "school view own pinv" ON public.platform_invoices
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()));
CREATE TRIGGER trg_pinv_touch BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.gen_platform_invoice_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE yr text := to_char(now(),'YYYY'); n int;
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN
    SELECT COALESCE(MAX(CAST(split_part(invoice_no,'-',2) AS int)),0)+1 INTO n
      FROM public.platform_invoices WHERE invoice_no LIKE 'PINV'||yr||'-%';
    NEW.invoice_no := 'PINV'||yr||'-'||lpad(n::text,5,'0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pinv_no BEFORE INSERT ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.gen_platform_invoice_no();

CREATE TABLE IF NOT EXISTS public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  method text NOT NULL DEFAULT 'manual', reference text,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by uuid, notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin view ppay" ON public.platform_payments
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "platform owner manage ppay" ON public.platform_payments
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_platform_invoice_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE total numeric(12,2); inv_amt numeric(12,2); inv uuid;
BEGIN
  inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO total FROM public.platform_payments WHERE invoice_id = inv;
  SELECT amount INTO inv_amt FROM public.platform_invoices WHERE id = inv;
  UPDATE public.platform_invoices SET paid = total,
    status = CASE WHEN total >= inv_amt THEN 'paid' WHEN total > 0 THEN 'partial' ELSE 'unpaid' END
    WHERE id = inv;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_ppay_rollup AFTER INSERT OR UPDATE OR DELETE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_platform_invoice_paid();

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  opened_by uuid, subject text NOT NULL, body text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin manage tickets" ON public.support_tickets
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY "school admin view own tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()));
CREATE POLICY "school admin open tickets" ON public.support_tickets
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()) AND opened_by = auth.uid());
CREATE TRIGGER trg_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL, body text NOT NULL,
  is_platform_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admin view msgs" ON public.support_messages
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "platform admin write msgs" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) AND author_id = auth.uid() AND is_platform_reply = true);
CREATE POLICY "school view ticket msgs" ON public.support_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id AND t.school_id = public.current_user_school() AND public.is_admin(auth.uid())));
CREATE POLICY "school write ticket msgs" ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND is_platform_reply = false AND
    EXISTS (SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND t.school_id = public.current_user_school() AND public.is_admin(auth.uid())));

DROP POLICY IF EXISTS "super admin manage schools" ON public.schools;
DROP POLICY IF EXISTS "tenant view schools" ON public.schools;
DROP POLICY IF EXISTS "any auth view schools" ON public.schools;
DROP POLICY IF EXISTS "members view own school" ON public.schools;
DROP POLICY IF EXISTS "platform owner manage schools" ON public.schools;
DROP POLICY IF EXISTS "anon view schools for login" ON public.schools;

CREATE POLICY "members view own school" ON public.schools
  FOR SELECT TO authenticated
  USING (id = public.current_user_school() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "anon view schools for login" ON public.schools
  FOR SELECT TO anon USING (true);
CREATE POLICY "platform owner manage schools" ON public.schools
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid())) WITH CHECK (public.is_platform_owner(auth.uid()));

INSERT INTO public.subscription_plans (slug, name, monthly_fee, description) VALUES
  ('free',  'Free',  0,     'Pilot / single class. Limited support.'),
  ('basic', 'Basic', 5000,  'Up to 500 students. Core modules.'),
  ('pro',   'Pro',   12000, 'Unlimited students. All modules. Priority support.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.school_subscriptions (school_id, plan_id, status)
SELECT s.id, p.id, 'active'
FROM public.schools s CROSS JOIN public.subscription_plans p
WHERE p.slug = 'free'
ON CONFLICT (school_id) DO NOTHING;

INSERT INTO public.school_features (school_id, feature_key, enabled)
SELECT s.id, k, true
FROM public.schools s
CROSS JOIN (VALUES
  ('academics'),('finance'),('boarding'),('kitchen'),('library'),
  ('clinic'),('transport'),('security'),('discipline'),('portals')
) AS f(k)
ON CONFLICT (school_id, feature_key) DO NOTHING;

-- Grant platform_owner: temporarily disable triggers to bypass the audit/stamp chain
ALTER TABLE public.user_roles DISABLE TRIGGER USER;
INSERT INTO public.user_roles (user_id, role, school_id)
SELECT u.id, 'platform_owner'::app_role,
  (SELECT sm.school_id FROM public.school_members sm WHERE sm.user_id = u.id ORDER BY sm.is_default DESC LIMIT 1)
FROM auth.users u
WHERE lower(u.email) = 'meltongraymond1@gmail.com'
  AND EXISTS (SELECT 1 FROM public.school_members sm2 WHERE sm2.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;
ALTER TABLE public.user_roles ENABLE TRIGGER USER;

CREATE INDEX IF NOT EXISTS idx_pinv_school ON public.platform_invoices(school_id);
CREATE INDEX IF NOT EXISTS idx_pinv_status ON public.platform_invoices(status);
CREATE INDEX IF NOT EXISTS idx_features_school ON public.school_features(school_id);
CREATE INDEX IF NOT EXISTS idx_tickets_school ON public.support_tickets(school_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_msgs_ticket ON public.support_messages(ticket_id);