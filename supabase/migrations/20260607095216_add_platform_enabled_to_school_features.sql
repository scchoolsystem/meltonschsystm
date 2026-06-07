ALTER TABLE public.school_features
  ADD COLUMN IF NOT EXISTS platform_enabled boolean NOT NULL DEFAULT true;
UPDATE public.school_features SET platform_enabled = true WHERE platform_enabled IS NULL;
