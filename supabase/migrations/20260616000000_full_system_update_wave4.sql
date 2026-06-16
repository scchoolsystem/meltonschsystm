-- ============================================================
-- Wave 4: Full system update — new columns + new tables for
-- Clinic, Transport, Kitchen, Boarding, Security, Library,
-- Discipline, Co-curricular/Sports modules.
-- ============================================================

-- ============ 1. New columns on existing tables ============

-- Clinic: observation tracking + referral status
ALTER TABLE public.clinic_visits
  ADD COLUMN IF NOT EXISTS under_observation boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admitted_date date,
  ADD COLUMN IF NOT EXISTS discharge_date date,
  ADD COLUMN IF NOT EXISTS referral_status text NOT NULL DEFAULT 'pending';

DO $$ BEGIN
  ALTER TABLE public.clinic_visits
    ADD CONSTRAINT clinic_visits_referral_status_check
    CHECK (referral_status IN ('pending','sent','completed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Kitchen: per-meal cost tracking
ALTER TABLE public.meal_plans
  ADD COLUMN IF NOT EXISTS cost_per_meal numeric(10,2);

-- Students: dietary requirements
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS dietary_notes text;

-- Boarding: welfare notes per assignment
ALTER TABLE public.dorm_assignments
  ADD COLUMN IF NOT EXISTS welfare_notes text;

-- Discipline: parent notification tracking
ALTER TABLE public.discipline_records
  ADD COLUMN IF NOT EXISTS parent_notified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- Co-curricular: category + schedule
ALTER TABLE public.co_curricular_activities
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS schedule_day smallint,
  ADD COLUMN IF NOT EXISTS schedule_time text;

-- Library: fine rate per day (default KES 5)
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS fine_per_day numeric(10,2) NOT NULL DEFAULT 5;

-- ============ 2. New tables ============

-- Transport: daily boarding log
CREATE TABLE IF NOT EXISTS public.transport_daily_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  route_id     uuid NOT NULL REFERENCES public.transport_routes(id) ON DELETE CASCADE,
  log_date     date NOT NULL DEFAULT CURRENT_DATE,
  boarded_count int NOT NULL DEFAULT 0,
  notes        text,
  logged_by    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, log_date)
);

-- Boarding: nightly roll call
CREATE TABLE IF NOT EXISTS public.boarding_roll_call (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  dorm_id     uuid NOT NULL REFERENCES public.dormitories(id) ON DELETE CASCADE,
  roll_date   date NOT NULL DEFAULT CURRENT_DATE,
  status      text NOT NULL DEFAULT 'present',
  notes       text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, roll_date)
);

DO $$ BEGIN
  ALTER TABLE public.boarding_roll_call
    ADD CONSTRAINT boarding_roll_call_status_check
    CHECK (status IN ('present','absent'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Boarding: maintenance requests
CREATE TABLE IF NOT EXISTS public.dorm_maintenance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  dorm_id     uuid NOT NULL REFERENCES public.dormitories(id) ON DELETE CASCADE,
  reported_by uuid REFERENCES auth.users(id),
  description text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium',
  status      text NOT NULL DEFAULT 'open',
  created_at  timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.dorm_maintenance
    ADD CONSTRAINT dorm_maintenance_priority_check CHECK (priority IN ('low','medium','high'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.dorm_maintenance
    ADD CONSTRAINT dorm_maintenance_status_check CHECK (status IN ('open','in progress','resolved'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Security: visitor log
CREATE TABLE IF NOT EXISTS public.visitor_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  visitor_name text NOT NULL,
  id_number    text,
  visiting     text,
  purpose      text,
  time_in      timestamptz NOT NULL DEFAULT now(),
  time_out     timestamptz,
  logged_by    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Security: vehicle log
CREATE TABLE IF NOT EXISTS public.vehicle_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  vehicle_reg  text NOT NULL,
  driver_name  text,
  purpose      text,
  time_in      timestamptz NOT NULL DEFAULT now(),
  time_out     timestamptz,
  logged_by    uuid REFERENCES auth.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Discipline: counselling sessions
CREATE TABLE IF NOT EXISTS public.counselling_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  counsellor_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  session_date  date NOT NULL DEFAULT CURRENT_DATE,
  notes         text,
  follow_up_date date,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Sports: fixtures
CREATE TABLE IF NOT EXISTS public.sports_fixtures (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  activity_id  uuid NOT NULL REFERENCES public.co_curricular_activities(id) ON DELETE CASCADE,
  opponent     text NOT NULL,
  fixture_date date NOT NULL,
  venue        text,
  result       text NOT NULL DEFAULT 'TBD',
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.sports_fixtures
    ADD CONSTRAINT sports_fixtures_result_check CHECK (result IN ('win','draw','loss','TBD'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Sports: achievements
CREATE TABLE IF NOT EXISTS public.sports_achievements (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  activity_id       uuid REFERENCES public.co_curricular_activities(id) ON DELETE SET NULL,
  description       text NOT NULL,
  award_level       text NOT NULL DEFAULT 'school',
  achievement_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.sports_achievements
    ADD CONSTRAINT sports_achievements_award_level_check
    CHECK (award_level IN ('school','county','national','international'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============ 3. Indexes ============
CREATE INDEX IF NOT EXISTS idx_transport_daily_log_route ON public.transport_daily_log(route_id);
CREATE INDEX IF NOT EXISTS idx_transport_daily_log_date ON public.transport_daily_log(log_date);
CREATE INDEX IF NOT EXISTS idx_boarding_roll_call_dorm ON public.boarding_roll_call(dorm_id);
CREATE INDEX IF NOT EXISTS idx_boarding_roll_call_student ON public.boarding_roll_call(student_id);
CREATE INDEX IF NOT EXISTS idx_boarding_roll_call_date ON public.boarding_roll_call(roll_date);
CREATE INDEX IF NOT EXISTS idx_dorm_maintenance_dorm ON public.dorm_maintenance(dorm_id);
CREATE INDEX IF NOT EXISTS idx_visitor_log_time_in ON public.visitor_log(time_in);
CREATE INDEX IF NOT EXISTS idx_vehicle_log_time_in ON public.vehicle_log(time_in);
CREATE INDEX IF NOT EXISTS idx_counselling_sessions_student ON public.counselling_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_activity ON public.sports_fixtures(activity_id);
CREATE INDEX IF NOT EXISTS idx_sports_achievements_student ON public.sports_achievements(student_id);
CREATE INDEX IF NOT EXISTS idx_sports_achievements_activity ON public.sports_achievements(activity_id);

-- ============ 4. Grants ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transport_daily_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.boarding_roll_call TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dorm_maintenance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.visitor_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.counselling_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_fixtures TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sports_achievements TO authenticated;
GRANT ALL ON public.transport_daily_log, public.boarding_roll_call, public.dorm_maintenance,
              public.visitor_log, public.vehicle_log, public.counselling_sessions,
              public.sports_fixtures, public.sports_achievements TO service_role;

-- ============ 5. RLS ============
ALTER TABLE public.transport_daily_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_roll_call ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dorm_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counselling_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sports_achievements ENABLE ROW LEVEL SECURITY;

-- Transport daily log: all school members can view (driver directory is public-facing);
-- transport roles + admin can manage.
CREATE POLICY "view transport_daily_log" ON public.transport_daily_log FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "manage transport_daily_log" ON public.transport_daily_log FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role) OR has_role(auth.uid(),'transport_admin'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'transport_officer'::app_role) OR has_role(auth.uid(),'transport_admin'::app_role));

-- Boarding roll call: matron/boarding roles + admin manage; same group can view.
CREATE POLICY "view boarding_roll_call" ON public.boarding_roll_call FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role));
CREATE POLICY "manage boarding_roll_call" ON public.boarding_roll_call FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role));

-- Dorm maintenance: matron/boarding roles + admin manage; same group can view.
CREATE POLICY "view dorm_maintenance" ON public.dorm_maintenance FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role));
CREATE POLICY "manage dorm_maintenance" ON public.dorm_maintenance FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'matron'::app_role) OR has_role(auth.uid(),'boarding_admin'::app_role) OR has_role(auth.uid(),'boarding_user'::app_role));

-- Visitor log: security roles + admin.
CREATE POLICY "view visitor_log" ON public.visitor_log FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role));
CREATE POLICY "manage visitor_log" ON public.visitor_log FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role));

-- Vehicle log: security roles + admin.
CREATE POLICY "view vehicle_log" ON public.vehicle_log FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role));
CREATE POLICY "manage vehicle_log" ON public.vehicle_log FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'security_admin'::app_role) OR has_role(auth.uid(),'security_user'::app_role));

-- Counselling sessions: guidance/discipline/admin roles.
CREATE POLICY "view counselling_sessions" ON public.counselling_sessions FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'guidance_admin'::app_role) OR has_role(auth.uid(),'discipline_admin'::app_role) OR has_role(auth.uid(),'deputy_principal'::app_role) OR has_role(auth.uid(),'teacher'::app_role));
CREATE POLICY "manage counselling_sessions" ON public.counselling_sessions FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'guidance_admin'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'guidance_admin'::app_role));

-- Sports fixtures: visible to all authenticated; sports roles + admin manage.
CREATE POLICY "view sports_fixtures" ON public.sports_fixtures FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage sports_fixtures" ON public.sports_fixtures FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'sports_admin'::app_role) OR has_role(auth.uid(),'sports_user'::app_role) OR has_role(auth.uid(),'sports'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'sports_admin'::app_role) OR has_role(auth.uid(),'sports_user'::app_role) OR has_role(auth.uid(),'sports'::app_role));

-- Sports achievements: visible to all authenticated; sports roles + admin manage.
CREATE POLICY "view sports_achievements" ON public.sports_achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "manage sports_achievements" ON public.sports_achievements FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'sports_admin'::app_role) OR has_role(auth.uid(),'sports_user'::app_role) OR has_role(auth.uid(),'sports'::app_role))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'sports_admin'::app_role) OR has_role(auth.uid(),'sports_user'::app_role) OR has_role(auth.uid(),'sports'::app_role));

-- ============ 6. Autofill school_id trigger for new tables ============
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'transport_daily_log','boarding_roll_call','dorm_maintenance',
    'visitor_log','vehicle_log','counselling_sessions',
    'sports_fixtures','sports_achievements'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_autofill_school ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_autofill_school BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.autofill_school_id()', t);
  END LOOP;
END $$;
