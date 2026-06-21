-- Formalizes list_active_schools(), which already exists live in production
-- but was never committed to migrations (schema drift). This migration is
-- idempotent: CREATE OR REPLACE will simply re-affirm the existing function
-- if run against a database that already has it.

create or replace function public.list_active_schools()
returns table (
  id uuid,
  slug text,
  name text,
  logo_url text
)
language sql
security definer
set search_path = public
as $$
  select id, slug, name, logo_url
  from public.schools
  where status = 'active'
  order by name;
$$;

-- Anonymous/unauthenticated visitors need this to populate the school
-- picker on the public landing page, before they've logged in.
grant execute on function public.list_active_schools() to anon;
grant execute on function public.list_active_schools() to authenticated;
