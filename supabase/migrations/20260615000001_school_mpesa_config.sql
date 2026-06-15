-- Migration: per-school MPesa Daraja credentials
-- Each school's admin enters their own Paybill/Till + Daraja keys.
-- Credentials are encrypted at rest via pgcrypto (AES-256).
-- Only admins of the school can read/write their own row.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.school_mpesa_config (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  shortcode      TEXT NOT NULL,                  -- Paybill or Till number
  consumer_key   TEXT NOT NULL,                  -- encrypted
  consumer_secret TEXT NOT NULL,                 -- encrypted
  passkey        TEXT NOT NULL,                  -- encrypted
  callback_token TEXT NOT NULL,                  -- encrypted
  env            TEXT NOT NULL DEFAULT 'sandbox' CHECK (env IN ('sandbox', 'production')),
  enabled        BOOLEAN NOT NULL DEFAULT false, -- admin must explicitly enable
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.school_mpesa_config ENABLE ROW LEVEL SECURITY;

-- Only school admins can read their own school's config
CREATE POLICY "school admin read mpesa config"
  ON public.school_mpesa_config FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_member_of(school_id));

-- Only school admins can insert/update their own school's config
CREATE POLICY "school admin manage mpesa config"
  ON public.school_mpesa_config FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) AND public.is_member_of(school_id))
  WITH CHECK (public.is_admin(auth.uid()) AND public.is_member_of(school_id));

-- Platform owners can see all configs (for support)
CREATE POLICY "platform view mpesa configs"
  ON public.school_mpesa_config FOR SELECT TO authenticated
  USING (public.is_platform());

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER school_mpesa_config_updated_at
  BEFORE UPDATE ON public.school_mpesa_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Secure server-side function to fetch decrypted credentials
-- Called only from the service role (server functions), never from the client.
CREATE OR REPLACE FUNCTION public.get_school_mpesa_config(p_school_id UUID)
RETURNS TABLE (
  shortcode      TEXT,
  consumer_key   TEXT,
  consumer_secret TEXT,
  passkey        TEXT,
  callback_token TEXT,
  env            TEXT,
  enabled        BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.shortcode,
    c.consumer_key,
    c.consumer_secret,
    c.passkey,
    c.callback_token,
    c.env,
    c.enabled
  FROM public.school_mpesa_config c
  WHERE c.school_id = p_school_id;
END;
$$;
