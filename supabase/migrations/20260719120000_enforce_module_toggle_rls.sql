-- ─────────────────────────────────────────────────────────────────────────
-- Enforce school_features module toggles at the RLS layer.
--
-- Context: platform.schools.$id.tsx and _app.admin.features.tsx let an admin
-- flip a module off for a school (writes school_features.enabled AND
-- .platform_enabled = false). Until now that flag was only ever read by the
-- frontend (useTenant -> useFeatureGate), and several module routes
-- (timetable, announcements, classroom, live classes, communications,
-- leaving certs, digital IDs) never even checked it. Anyone with a direct
-- Supabase client call (or a route we forgot to gate) could still read/write
-- the underlying tables regardless of the toggle, because no RLS policy on
-- those tables ever referenced school_features.
--
-- This migration adds a SECURITY DEFINER helper plus RESTRICTIVE policies on
-- the highest-value tables (cost-bearing SMS/email, video sessions,
-- school-wide announcements, timetable). RESTRICTIVE policies are ANDed with
-- whatever PERMISSIVE policies already exist on a table, so this does NOT
-- replace or need to know about any existing policy — it can only narrow
-- access further, never widen it.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.school_feature_enabled(p_school_id uuid, p_feature_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Default-on when no row exists yet, mirroring the frontend's
  -- `features[key] !== false` behaviour in use-feature-gate.tsx — a module
  -- that has never been touched in Admin -> Features should not silently
  -- disappear. A module is only off once BOTH the school admin's `enabled`
  -- and the platform admin's `platform_enabled` are true; either one being
  -- false disables it.
  SELECT COALESCE(
    (
      SELECT sf.enabled AND sf.platform_enabled
      FROM public.school_features sf
      WHERE sf.school_id = p_school_id
        AND sf.feature_key = p_feature_key
    ),
    true
  );
$$;

GRANT EXECUTE ON FUNCTION public.school_feature_enabled(uuid, text) TO authenticated;

-- ── ANNOUNCEMENTS ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "module_toggle_announcements" ON public.announcements;
CREATE POLICY "module_toggle_announcements" ON public.announcements
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'announcements'))
  WITH CHECK (public.school_feature_enabled(school_id, 'announcements'));

-- ── TIMETABLE ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "module_toggle_timetable_slots" ON public.timetable_slots;
CREATE POLICY "module_toggle_timetable_slots" ON public.timetable_slots
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'timetable'))
  WITH CHECK (public.school_feature_enabled(school_id, 'timetable'));

-- ── LIVE CLASSES ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "module_toggle_live_sessions" ON public.live_sessions;
CREATE POLICY "module_toggle_live_sessions" ON public.live_sessions
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'live_classes'))
  WITH CHECK (public.school_feature_enabled(school_id, 'live_classes'));

DROP POLICY IF EXISTS "module_toggle_live_session_attendance" ON public.live_session_attendance;
CREATE POLICY "module_toggle_live_session_attendance" ON public.live_session_attendance
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'live_classes'))
  WITH CHECK (public.school_feature_enabled(school_id, 'live_classes'));

-- ── COMMUNICATIONS (SMS / email blasts) ─────────────────────────────────
DROP POLICY IF EXISTS "module_toggle_sms_queue" ON public.sms_queue;
CREATE POLICY "module_toggle_sms_queue" ON public.sms_queue
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'communications'))
  WITH CHECK (public.school_feature_enabled(school_id, 'communications'));

DROP POLICY IF EXISTS "module_toggle_notifications_log" ON public.notifications_log;
CREATE POLICY "module_toggle_notifications_log" ON public.notifications_log
  AS RESTRICTIVE FOR ALL TO authenticated
  USING (public.school_feature_enabled(school_id, 'communications'))
  WITH CHECK (public.school_feature_enabled(school_id, 'communications'));

-- Note: this intentionally does NOT touch school_features itself (the
-- platform admin must always be able to read/write it to re-enable a
-- module), nor tables belonging to attendance/academics/portals/analytics —
-- those modules are woven through nearly every screen in the app and are
-- not gated on the frontend either; disabling them at the RLS layer today
-- would risk breaking core flows (report cards, dashboards, portal logins)
-- rather than cleanly hiding a standalone module. Extend this pattern to
-- classroom_posts / leaving_certificates / id-card tables the same way if
-- stricter enforcement is wanted there too.
