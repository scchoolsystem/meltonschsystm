-- Phase 6: Kitchen + Security

CREATE TABLE IF NOT EXISTS public.kitchen_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'kg',
  low_threshold numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.meal_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_date date NOT NULL DEFAULT CURRENT_DATE,
  meal text NOT NULL CHECK (meal IN ('breakfast','lunch','snack','supper')),
  menu text NOT NULL,
  served_count integer NOT NULL DEFAULT 0,
  posted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gate_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  reason text NOT NULL,
  exit_time timestamptz NOT NULL DEFAULT now(),
  expected_return timestamptz,
  actual_return timestamptz,
  status text NOT NULL DEFAULT 'out' CHECK (status IN ('out','returned','overdue')),
  authorized_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_date date NOT NULL DEFAULT CURRENT_DATE,
  location text NOT NULL,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  reported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kitchen_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_passes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;

-- Kitchen stock
CREATE POLICY "kitchen view stock" ON public.kitchen_stock FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role) OR has_role(auth.uid(), 'kitchen_user'::app_role));
CREATE POLICY "kitchen manage stock" ON public.kitchen_stock FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role));

-- Meal plans (also viewable by boarding/matron for menu awareness)
CREATE POLICY "kitchen view meals" ON public.meal_plans FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role) OR has_role(auth.uid(), 'kitchen_user'::app_role)
         OR has_role(auth.uid(), 'matron'::app_role) OR has_role(auth.uid(), 'boarding'::app_role) OR has_role(auth.uid(), 'boarding_admin'::app_role));
CREATE POLICY "kitchen manage meals" ON public.meal_plans FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role) OR has_role(auth.uid(), 'kitchen_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'kitchen_admin'::app_role) OR has_role(auth.uid(), 'kitchen_user'::app_role));

-- Gate passes
CREATE POLICY "security view passes" ON public.gate_passes FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role)
         OR has_role(auth.uid(), 'deputy_principal'::app_role) OR has_role(auth.uid(), 'discipline_admin'::app_role));
CREATE POLICY "security manage passes" ON public.gate_passes FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role));
CREATE POLICY "parent view own gate" ON public.gate_passes FOR SELECT TO authenticated USING (is_parent_of(student_id));
CREATE POLICY "student view own gate" ON public.gate_passes FOR SELECT TO authenticated USING (is_student(student_id));

-- Incidents
CREATE POLICY "security view incidents" ON public.incident_reports FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role)
         OR has_role(auth.uid(), 'deputy_principal'::app_role) OR has_role(auth.uid(), 'discipline_admin'::app_role));
CREATE POLICY "security manage incidents" ON public.incident_reports FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'security_admin'::app_role) OR has_role(auth.uid(), 'security_user'::app_role));

CREATE TRIGGER trg_kitchen_stock_updated BEFORE UPDATE ON public.kitchen_stock
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();