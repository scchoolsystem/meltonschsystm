// src/hooks/use-teacher-scope.ts
// Returns the teacher's allowed class_ids + subject_ids per class, derived from:
//   - classes.class_teacher_id = staff.id (class teacher)
//   - timetable_slots.teacher_id = staff.id (subject teacher on a class)
// `isTeacherScoped` is true when the user is a teaching role but NOT an
// admin / academic_master / exams_admin. Admins keep the full school view.
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const TEACHING_ROLES = ["teacher", "class_teacher", "subject_teacher", "hod"] as const;
const UNSCOPED_ROLES = ["academic_master", "exams_admin", "principal", "deputy_principal"] as const;

export function useTeacherScope() {
  const { user, roles, isAdmin } = useAuth();
  const isTeacher = (roles ?? []).some((r) => (TEACHING_ROLES as readonly string[]).includes(r as string));
  const isUnscoped = isAdmin || (roles ?? []).some((r) => (UNSCOPED_ROLES as readonly string[]).includes(r as string));
  const isTeacherScoped = isTeacher && !isUnscoped;

  const { data: staffRow } = useQuery({
    queryKey: ["teacher-scope-staff", user?.id],
    enabled: !!user?.id && isTeacher,
    queryFn: async () =>
      (await supabase.from("staff").select("id").eq("user_id", user!.id).maybeSingle()).data,
  });
  const staffId = staffRow?.id ?? null;

  const { data: assignedClasses = [] } = useQuery({
    queryKey: ["teacher-scope-classes", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const [a, b] = await Promise.all([
        supabase.from("classes").select("id").eq("class_teacher_id", staffId!),
        supabase.from("timetable_slots").select("class_id,subject_id").eq("teacher_id", staffId!),
      ]);
      const map = new Map<string, Set<string>>();
      (a.data ?? []).forEach((c: any) => { if (!map.has(c.id)) map.set(c.id, new Set()); });
      (b.data ?? []).forEach((s: any) => {
        if (!map.has(s.class_id)) map.set(s.class_id, new Set());
        if (s.subject_id) map.get(s.class_id)!.add(s.subject_id);
      });
      return Array.from(map.entries()).map(([class_id, subs]) => ({ class_id, subject_ids: Array.from(subs) }));
    },
  });

  const classIds = useMemo(() => assignedClasses.map((c) => c.class_id), [assignedClasses]);
  const subjectIdsByClass = useMemo(() => {
    const m: Record<string, string[]> = {};
    assignedClasses.forEach((c) => { m[c.class_id] = c.subject_ids; });
    return m;
  }, [assignedClasses]);
  const allSubjectIds = useMemo(() => {
    const s = new Set<string>();
    assignedClasses.forEach((c) => c.subject_ids.forEach((id) => s.add(id)));
    return Array.from(s);
  }, [assignedClasses]);

  return { isTeacherScoped, staffId, classIds, subjectIdsByClass, allSubjectIds };
}
