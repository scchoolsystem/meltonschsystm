// Drops marks for electives a student does not take (stray marks) from a results list,
// so rankings and means only count the subjects each student actually studies.
// While a student's choice is still pending nothing is dropped.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchOptionData, fetchEnrolments } from "@/lib/subject-options.client";
import { hiddenElectiveSubjectIds } from "@/lib/subject-options";

export function useElectiveFilteredResults<R extends { student_id: string; subject_id: string }>(
  students: { id: string; class_id?: string | null }[],
  results: R[],
  year?: number | null,
  fallbackClassId?: string,
): R[] {
  const ids = useMemo(() => students.map((s) => s.id), [students]);
  const y = Number(year) || new Date().getFullYear();

  const { data: od } = useQuery({ queryKey: ["so-data"], queryFn: () => fetchOptionData(supabase), staleTime: 60_000 });
  const { data: enrol } = useQuery({
    queryKey: ["so-enrol-many", y, ids.join(",")],
    enabled: ids.length > 0 && !!od && od.groups.length > 0,
    queryFn: async () => {
      // chunk the id list so the request URL stays small
      const out: any[] = [];
      for (let i = 0; i < ids.length; i += 200) out.push(...(await fetchEnrolments(supabase, ids.slice(i, i + 200), y)));
      return out;
    },
  });

  return useMemo(() => {
    if (!od || od.groups.length === 0 || !enrol) return results;
    const hiddenBy = new Map<string, Set<string>>();
    for (const s of students) {
      const cid = s.class_id ?? fallbackClassId;
      if (cid) hiddenBy.set(s.id, hiddenElectiveSubjectIds(s.id, cid, od, enrol));
    }
    return results.filter((r) => !hiddenBy.get(r.student_id)?.has(r.subject_id));
  }, [od, enrol, results, students, fallbackClassId]);
}
