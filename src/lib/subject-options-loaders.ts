// Browser-side loaders for elective data (RLS-scoped, so each user only sees their school).
import { hiddenElectiveSubjectIds, type OptionData, type Enrolment } from "@/lib/subject-options";

export async function fetchOptionData(client: any): Promise<OptionData> {
  const [s, g, gc, gs] = await Promise.all([
    client.from("subjects").select("id,name,code").eq("is_examinable", true).order("name"),
    client.from("subject_option_groups").select("id,name,pathway,pick_count").order("name"),
    client.from("subject_option_group_classes").select("group_id,class_id"),
    client.from("subject_option_group_subjects").select("group_id,subject_id"),
  ]);
  return { subjects: s.data ?? [], groups: g.data ?? [], groupClasses: gc.data ?? [], groupSubjects: gs.data ?? [] };
}

export async function fetchEnrolments(client: any, studentIds: string[], year: number): Promise<Enrolment[]> {
  if (studentIds.length === 0) return [];
  const { data } = await client.from("student_subjects").select("student_id,subject_id,group_id")
    .eq("academic_year", year).in("student_id", studentIds);
  return (data ?? []) as Enrolment[];
}

/**
 * Subjects to hide for one student (electives they don't take). Never throws:
 * if the option tables aren't there yet or a query fails, nothing is hidden.
 */
export async function fetchHiddenSubjectIds(
  client: any, studentId: string, classId: string | null | undefined, year = new Date().getFullYear(),
): Promise<Set<string>> {
  if (!studentId || !classId) return new Set();
  try {
    const [d, e] = await Promise.all([fetchOptionData(client), fetchEnrolments(client, [studentId], year)]);
    return hiddenElectiveSubjectIds(studentId, classId, d, e);
  } catch {
    return new Set();
  }
}
