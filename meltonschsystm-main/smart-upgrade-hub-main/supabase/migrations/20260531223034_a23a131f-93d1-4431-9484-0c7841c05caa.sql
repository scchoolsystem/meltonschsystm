ALTER TABLE public.live_session_attendance
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent')),
  ADD COLUMN IF NOT EXISTS marked_by UUID,
  ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;

-- Allow rows for absent students with no real join time; relax joined_at default behavior by allowing NULL
ALTER TABLE public.live_session_attendance ALTER COLUMN joined_at DROP NOT NULL;