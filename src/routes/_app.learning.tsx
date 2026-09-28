// ─── SmartDev Learning — standalone entry point ────────────────────────────
// Previously this was a "Learning" tab buried inside the student and parent
// portals (_app.portal_.student.tsx / _app.portal_.parent.tsx) and inside
// the staff workspace (_app.portal_.me.tsx). It's now its own destination —
// selecting "Learning" in the sidebar opens straight into it instead of
// opening the portal and landing on a tab. The three panels themselves
// (StudentLearningPanel / ParentLearningPanel / TeacherLearningAnalyticsPanel)
// are unchanged — they were already self-contained components, so this route
// just hosts whichever one fits the signed-in user's role.

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { withTimeout } from "@/lib/with-timeout";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, GraduationCap } from "lucide-react";
import { StudentLearningPanel } from "@/components/learning/StudentLearningPanel";
import { ParentLearningPanel } from "@/components/learning/ParentLearningPanel";
import { TeacherLearningAnalyticsPanel } from "@/components/learning/TeacherLearningAnalyticsPanel";

export const Route = createFileRoute("/_app/learning")({
  component: LearningPage,
});

function PageHeader() {
  return (
    <div className="flex items-center gap-2 mb-6">
      <GraduationCap className="w-6 h-6 text-primary" />
      <div>
        <h1 className="text-2xl font-semibold">Learning</h1>
        <p className="text-sm text-muted-foreground">Revision quizzes, mastery and progress — separate from official exam results.</p>
      </div>
    </div>
  );
}

function LearningPage() {
  const { user, roles, isAdmin } = useAuth();

  const isStudent = roles.includes("student" as any);
  const isParent = roles.includes("parent" as any);
  const isTeacher =
    isAdmin ||
    roles.some((r) => ["teacher", "class_teacher", "subject_teacher", "hod", "academic_master"].includes(r as string));

  // A user can hold more than one of these roles (e.g. a teacher who is also
  // a parent) — prefer the most specific view: student > parent > teacher.
  if (isStudent) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <PageHeader />
        <StudentLearningPanel />
      </div>
    );
  }

  if (isParent) return <ParentLearning userId={user?.id} />;

  if (isTeacher) return <TeacherLearning />;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader />
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        Learning isn't available for your role.
      </CardContent></Card>
    </div>
  );
}

function ParentLearning({ userId }: { userId: string | undefined }) {
  const [children, setChildren] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data: links } = await withTimeout(
        supabase.from("parent_student_links").select("student_id, students(id, first_name, last_name)").eq("parent_user_id", userId),
        8000, { data: [] as any[], error: null } as any, "parent_student_links",
      );
      const kids = (links ?? []).map((l: any) => l.students).filter(Boolean);
      setChildren(kids);
      if (kids[0]) setActiveId(kids[0].id);
      setLoading(false);
    })();
  }, [userId]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader />
      {loading ? (
        <div className="grid place-items-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : children.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No linked children found.</CardContent></Card>
      ) : (
        <>
          {children.length > 1 && (
            <Select value={activeId} onValueChange={setActiveId}>
              <SelectTrigger className="w-64 mb-4"><SelectValue /></SelectTrigger>
              <SelectContent>
                {children.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {activeId && <ParentLearningPanel studentId={activeId} />}
        </>
      )}
    </div>
  );
}

function TeacherLearning() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Mirrors the class-resolution logic in _app.portal_.me.tsx: a
      // teacher's classes are the union of classes they're the class
      // teacher of, and classes they teach a subject in (via timetable
      // slots) — there's no single join table for "my classes".
      const { data: staff } = await withTimeout(
        supabase.from("staff").select("id").eq("user_id", user.id).maybeSingle(),
        8000, { data: null, error: null } as any, "staff",
      );
      const staffId = (staff as any)?.id ?? null;
      if (!staffId) { setLoading(false); return; }

      const [classTeacherOf, subjectTaughtSlots] = await Promise.all([
        withTimeout(supabase.from("classes").select("id, name").eq("class_teacher_id", staffId), 8000, { data: [] as any[], error: null } as any, "classTeacherOf"),
        withTimeout(supabase.from("timetable_slots").select("classes(id, name)").eq("teacher_id", staffId), 8000, { data: [] as any[], error: null } as any, "subjectTaughtSlots"),
      ]);
      const merged = new Map<string, { id: string; name: string }>();
      (classTeacherOf.data ?? []).forEach((c: any) => merged.set(c.id, c));
      (subjectTaughtSlots.data ?? []).forEach((s: any) => { const c = s.classes; if (c && !merged.has(c.id)) merged.set(c.id, c); });
      setClasses(Array.from(merged.values()));
      setLoading(false);
    })();
  }, [user]);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <PageHeader />
      {loading ? (
        <div className="grid place-items-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <TeacherLearningAnalyticsPanel classes={classes} />
      )}
    </div>
  );
}
