-- SmartDev v11: Communications hub tables
CREATE TABLE IF NOT EXISTS public.sms_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  audience jsonb NOT NULL DEFAULT '{}',
  message text NOT NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'queued',
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sms_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_iso_sms_queue" ON public.sms_queue;
CREATE POLICY "tenant_iso_sms_queue" ON public.sms_queue
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school())
  WITH CHECK (school_id = public.current_user_school());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.sms_queue TO authenticated;
GRANT ALL ON public.sms_queue TO service_role;

CREATE TABLE IF NOT EXISTS public.notifications_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL DEFAULT public.current_user_school(),
  recipient_count int NOT NULL DEFAULT 0,
  channel text NOT NULL,
  subject text,
  body text,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_view_notif_log" ON public.notifications_log;
CREATE POLICY "admin_view_notif_log" ON public.notifications_log
  FOR ALL TO authenticated
  USING (school_id = public.current_user_school() AND public.is_admin(auth.uid()))
  WITH CHECK (school_id = public.current_user_school() AND public.is_admin(auth.uid()));
GRANT SELECT,INSERT ON public.notifications_log TO authenticated;
GRANT ALL ON public.notifications_log TO service_role;
