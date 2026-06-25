import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single source of truth for "is this student currently enrolled".
 *
 * The students table carries two overlapping status fields that drifted apart:
 *  - status:            'active' | 'inactive' | 'transferred' | 'graduated'  (legacy)
 *  - lifecycle_status:  'active' | 'suspended' | 'expelled' | 'transferred' | 'archived'
 *
 * setStudentLifecycle() only ever writes status as 'archived' or 'active', so a student
 * who is suspended/expelled/transferred via lifecycle still shows status = 'active'.
 * To be safe, a student only counts as active here if BOTH fields say so.
 */
export function isStudentActive(s: { status?: string | null; lifecycle_status?: string | null }) {
  return s.status === "active" && (s.lifecycle_status ?? "active") === "active";
}

export const ACTIVE_STUDENT_FIELDS =
  "id, admission_no, unique_id, first_name, last_name, gender, class_id, status, lifecycle_status, classes(id, name)";

export type ActiveStudentRow = {
  id: string;
  admission_no: string;
  unique_id: string | null;
  first_name: string;
  last_name: string;
  gender: string | null;
  class_id: string | null;
  status: string;
  lifecycle_status: string | null;
  classes: { id: string; name: string } | null;
};

/**
 * Fetch every currently-enrolled student, in the same shape, everywhere.
 * Use this instead of writing a one-off `supabase.from("students").select(...)`
 * in individual modules (library, attendance, clinic, discipline, marks, search, etc.)
 * so every screen agrees on who is an active student and what their class/name is.
 *
 * @param opts.classId   restrict to a single class (e.g. attendance, markbook roster)
 * @param opts.includeInactive  include transferred/graduated/suspended/expelled/archived
 *                        students too (e.g. leaving-certificates, lifecycle admin screens)
 */
export function useActiveStudents(opts: { classId?: string | null; classIds?: string[] | null; includeInactive?: boolean; enabled?: boolean } = {}) {
  const { classId, classIds, includeInactive = false, enabled = true } = opts;
  return useQuery({
    queryKey: ["active-students", classId ?? "all", (classIds ?? []).join(","), includeInactive],
    enabled,
    queryFn: async () => {
      let q = supabase.from("students").select(ACTIVE_STUDENT_FIELDS).order("first_name");
      if (classId) q = q.eq("class_id", classId);
      else if (classIds && classIds.length > 0) q = q.in("class_id", classIds);
      if (!includeInactive) q = q.eq("status", "active").eq("lifecycle_status", "active");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ActiveStudentRow[];
    },
  });
}
