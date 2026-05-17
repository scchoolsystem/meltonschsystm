-- Add platform-level roles. Must commit before the values can be referenced in policies.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_owner';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'platform_support';