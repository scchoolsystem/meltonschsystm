// Shared helper for every screen that displays a class's weekly timetable
// (admin editor, print view, student portal, parent portal, student profile).
//
// Elective subjects are scheduled so that 2+ subjects sit in the exact same
// class + day + start/end time (different students take different options
// in that period). Every view used to render those as separate, unrelated
// rows/cards — this groups them back into one "block" per day+time so they
// can be rendered together as a single table instead of split apart.

export interface TimetableSlotLike {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string | null;
  elective_group?: string | null;
  subjects?: { name?: string | null; code?: string | null } | null;
  staff?: { first_name?: string | null; last_name?: string | null } | null;
  [key: string]: any;
}

export interface TimetableBlock {
  day_of_week: number;
  start_time: string;
  end_time: string;
  /** true when this time slot has 2+ parallel subjects, or is tagged with an elective_group */
  isElective: boolean;
  options: TimetableSlotLike[];
}

export function groupTimetableSlots(slots: TimetableSlotLike[]): TimetableBlock[] {
  const map = new Map<string, TimetableBlock>();
  for (const s of slots) {
    const key = `${s.day_of_week}-${s.start_time}-${s.end_time}`;
    let block = map.get(key);
    if (!block) {
      block = { day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time, isElective: false, options: [] };
      map.set(key, block);
    }
    block.options.push(s);
  }
  const blocks = Array.from(map.values());
  blocks.forEach((b) => {
    b.isElective = b.options.length > 1 || b.options.some((o) => !!o.elective_group);
  });
  blocks.sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time));
  return blocks;
}

export function staffName(s?: { first_name?: string | null; last_name?: string | null } | null): string {
  if (!s) return "";
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}
