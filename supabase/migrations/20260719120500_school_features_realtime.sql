-- TenantProvider (src/hooks/use-tenant.tsx) subscribes to postgres_changes
-- on public.school_features so an open session picks up a platform/school
-- admin's module toggle live, without the user refreshing. That subscription
-- delivers nothing unless the table is part of the `supabase_realtime`
-- publication — and no prior migration in this repo ever added it (this
-- project's realtime tables appear to have been enabled by hand via the
-- Supabase dashboard rather than migrations). Guard against "table already
-- in publication" so this is safe to run whether or not that was done.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'school_features'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_features;
  END IF;
END $$;
