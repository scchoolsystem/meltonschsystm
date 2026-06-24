-- Platform-level M-Pesa (Lipa Na M-Pesa) config — ONE row, belongs to the platform owner,
-- used for ALL schools paying their subscription invoices to you.
-- This is separate from school_mpesa_config (which is each school's OWN till for collecting
-- fees from parents/students).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.platform_mpesa_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shortcode       text NOT NULL,                 -- Your Paybill or Till number
  consumer_key    text NOT NULL,
  consumer_secret text NOT NULL,
  passkey         text NOT NULL,
  callback_token  text NOT NULL,                  -- shared secret you check on the callback URL
  env             text NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox','production')),
  enabled         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.platform_mpesa_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmc_select ON public.platform_mpesa_config;
CREATE POLICY pmc_select ON public.platform_mpesa_config
  FOR SELECT TO authenticated USING (public.is_platform_owner(auth.uid()));

DROP POLICY IF EXISTS pmc_write ON public.platform_mpesa_config;
CREATE POLICY pmc_write ON public.platform_mpesa_config
  FOR ALL TO authenticated
  USING (public.is_platform_owner(auth.uid()))
  WITH CHECK (public.is_platform_owner(auth.uid()));

DROP TRIGGER IF EXISTS trg_pmc_updated ON public.platform_mpesa_config;
CREATE TRIGGER trg_pmc_updated BEFORE UPDATE ON public.platform_mpesa_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Server-side only function (service role) to fetch the single active config
CREATE OR REPLACE FUNCTION public.get_platform_mpesa_config()
RETURNS TABLE (
  shortcode text, consumer_key text, consumer_secret text,
  passkey text, callback_token text, env text, enabled boolean
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT shortcode, consumer_key, consumer_secret, passkey, callback_token, env, enabled
  FROM public.platform_mpesa_config
  ORDER BY created_at DESC LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.get_platform_mpesa_config() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_mpesa_config() TO service_role;

-- Tracks every STK push attempt a school makes against an invoice.
CREATE TABLE IF NOT EXISTS public.platform_mpesa_transactions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  initiated_by        uuid REFERENCES auth.users(id),
  phone               text NOT NULL,
  amount              numeric(12,2) NOT NULL,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed','cancelled')),
  result_code         text,
  result_desc         text,
  mpesa_receipt       text,
  raw_callback        jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pmt_invoice ON public.platform_mpesa_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pmt_checkout ON public.platform_mpesa_transactions(checkout_request_id);
ALTER TABLE public.platform_mpesa_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pmt_select ON public.platform_mpesa_transactions;
CREATE POLICY pmt_select ON public.platform_mpesa_transactions
  FOR SELECT TO authenticated
  USING (public.is_platform() OR public.is_member_of(school_id));

DROP POLICY IF EXISTS pmt_insert ON public.platform_mpesa_transactions;
CREATE POLICY pmt_insert ON public.platform_mpesa_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member_of(school_id) AND public.is_admin(auth.uid()) AND initiated_by = auth.uid());

-- Only service role (server functions) update transactions on callback
DROP POLICY IF EXISTS pmt_update ON public.platform_mpesa_transactions;
CREATE POLICY pmt_update ON public.platform_mpesa_transactions
  FOR UPDATE TO authenticated
  USING (public.is_platform()) WITH CHECK (public.is_platform());

DROP TRIGGER IF EXISTS trg_pmt_updated ON public.platform_mpesa_transactions;
CREATE TRIGGER trg_pmt_updated BEFORE UPDATE ON public.platform_mpesa_transactions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- When a transaction succeeds, auto-create the platform_payments row
-- (this is what actually marks the invoice paid via the existing rollup trigger).
CREATE OR REPLACE FUNCTION public.handle_platform_mpesa_success()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'success' AND (OLD.status IS DISTINCT FROM 'success') THEN
    INSERT INTO public.platform_payments (invoice_id, amount, method, reference, notes, recorded_by)
    VALUES (NEW.invoice_id, NEW.amount, 'mpesa', NEW.mpesa_receipt, 'Auto-recorded via STK push', NEW.initiated_by);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pmt_success ON public.platform_mpesa_transactions;
CREATE TRIGGER trg_pmt_success AFTER UPDATE ON public.platform_mpesa_transactions
  FOR EACH ROW EXECUTE FUNCTION public.handle_platform_mpesa_success();
