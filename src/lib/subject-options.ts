// Shared rules for compulsory vs elective subjects.
//
//  * An option group applies to specific classes and offers a set of subjects,
//    of which a student picks `pick_count`.
//  * Any examinable subject that is NOT offered by a group applying to the class
//    is compulsory for that class.
//
// Marks entry, the timetable, report cards, ranking and the results messages
// should all call resolveStudentSubjects() so they always agree.

export type OptSubject = { id: string; name: string; code?: string | null };
export type OptGroup = { id: string; name: string; pathway?: string | null; pick_count: number };

export type OptionData = {
  subjects: OptSubject[];                               // examinable subjects
  groups: OptGroup[];
  groupClasses: { group_id: string; class_id: string }[];
  groupSubjects: { group_id: string; subject_id: string }[];
};

export type Enrolment = { student_id: string; subject_id: string; group_id: string | null };

export function groupsForClass(classId: string, d: OptionData): OptGroup[] {
  const ids = new Set(d.groupClasses.filter((g) => g.class_id === classId).map((g) => g.group_id));
  return d.groups.filter((g) => ids.has(g.id));
}

export function subjectsOfGroup(groupId: string, d: OptionData): OptSubject[] {
  const ids = new Set(d.groupSubjects.filter((g) => g.group_id === groupId).map((g) => g.subject_id));
  return d.subjects.filter((s) => ids.has(s.id));
}

/** Subjects every student in the class takes. */
export function compulsorySubjects(classId: string, d: OptionData): OptSubject[] {
  const offered = new Set<string>();
  for (const g of groupsForClass(classId, d)) for (const s of subjectsOfGroup(g.id, d)) offered.add(s.id);
  return d.subjects.filter((s) => !offered.has(s.id));
}

export type ResolvedSubjects = {
  compulsory: OptSubject[];
  chosen: { group: OptGroup; subjects: OptSubject[] }[];
  /** groups where the student has picked fewer than pick_count */
  pending: { group: OptGroup; missing: number }[];
  /** every subject the student takes (compulsory + chosen) */
  all: OptSubject[];
};

export function resolveStudentSubjects(
  studentId: string, classId: string, d: OptionData, enrolments: Enrolment[],
): ResolvedSubjects {
  const compulsory = compulsorySubjects(classId, d);
  const mine = enrolments.filter((e) => e.student_id === studentId);
  const chosen: ResolvedSubjects["chosen"] = [];
  const pending: ResolvedSubjects["pending"] = [];
  for (const group of groupsForClass(classId, d)) {
    const offered = subjectsOfGroup(group.id, d);
    const picked = offered.filter((s) => mine.some((e) => e.subject_id === s.id));
    chosen.push({ group, subjects: picked });
    if (picked.length < group.pick_count) pending.push({ group, missing: group.pick_count - picked.length });
  }
  return { compulsory, chosen, pending, all: [...compulsory, ...chosen.flatMap((c) => c.subjects)] };
}
