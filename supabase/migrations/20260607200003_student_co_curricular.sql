-- Migration: student_co_curricular
-- Creates the join table linking students to co-curricular activities.
-- The co_curricular_activities and staff_co_curricular tables already exist.

create table if not exists public.student_co_curricular (
  id            uuid primary key default gen_random_uuid(),
  activity_id   uuid not null references public.co_curricular_activities(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  school_id     uuid references public.schools(id) on delete cascade,
  enrolled_on   date not null default current_date,
  created_at    timestamptz not null default now(),
  unique(activity_id, student_id)
);

-- Row-level security
alter table public.student_co_curricular enable row level security;

-- School members can read
create policy "school members can view student_co_curricular"
  on public.student_co_curricular for select
  using (
    school_id in (
      select school_id from public.school_members where user_id = auth.uid()
    )
  );

-- School admins and sports roles can insert/update/delete
create policy "sports admin can manage student_co_curricular"
  on public.student_co_curricular for all
  using (
    school_id in (
      select school_id from public.school_members where user_id = auth.uid()
    )
  )
  with check (
    school_id in (
      select school_id from public.school_members where user_id = auth.uid()
    )
  );

-- Index for fast activity lookups
create index if not exists idx_student_co_curricular_activity
  on public.student_co_curricular(activity_id);

-- Index for student lookups
create index if not exists idx_student_co_curricular_student
  on public.student_co_curricular(student_id);
