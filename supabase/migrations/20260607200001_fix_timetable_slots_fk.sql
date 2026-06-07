-- Fix: period_index column should be uuid to reference period_templates.id
ALTER TABLE public.timetable_slots
  ADD COLUMN IF NOT EXISTS period_template_id uuid REFERENCES public.period_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS room_id            uuid REFERENCES public.rooms(id)            ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_timetable_slots_period_template ON public.timetable_slots(period_template_id);
CREATE INDEX IF NOT EXISTS idx_timetable_slots_room            ON public.timetable_slots(room_id);

NOTIFY pgrst, 'reload schema';
