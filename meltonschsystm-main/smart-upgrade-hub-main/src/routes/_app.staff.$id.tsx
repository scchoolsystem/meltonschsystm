import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, Phone, Calendar, Briefcase, BookOpen, Award, Users } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

export const Route = createFileRoute("/_app/staff/$id")({
  component: StaffProfile,
});

function StaffProfile() {
  const { id } = useParams({ from: "/_app/staff/$id" });

  const { data, isLoading } = useQuery({
    queryKey: ["staff-profile", id],
    queryFn: async () => {
      const { data: s, error } = await supabase.from("staff").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!s) return null;
      const [dept, subDept, ts, sc, ur] = await Promise.all([
        s.department_id ? supabase.from("departments").select("name, kind").eq("id", s.department_id).maybeSingle() : Promise.resolve({ data: null }),
        s.sub_department_id ? supabase.from("sub_departments").select("name").eq("id", s.sub_department_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("teacher_subjects").select("subjects(code, name)").eq("staff_id", id),
        supabase.from("staff_co_curricular").select("role, co_curricular_activities(name)").eq("staff_id", id),
        s.user_id ? supabase.from("user_roles").select("role").eq("user_id", s.user_id) : Promise.resolve({ data: [] }),
      ]);
      return {
        s,
        deptName: (dept.data as any)?.name,
        subDeptName: (subDept.data as any)?.name,
        subjects: (ts.data ?? []).map((r: any) => r.subjects?.code ?? r.subjects?.name).filter(Boolean),
        activities: (sc.data ?? []).map((r: any) => ({ name: r.co_curricular_activities?.name, role: r.role })),
        systemRoles: (ur.data ?? []).map((r: any) => r.role),
      };
    },
  });

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!data) return <div className="p-6"><Link to="/staff"><Button variant="ghost"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button></Link><p className="mt-4">Staff not found.</p></div>;

  const { s } = data;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Link to="/staff"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4 mr-2" />Back to Staff</Button></Link>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6 flex-wrap">
            {s.photo_url ? (
              <img src={s.photo_url} alt="" className="w-32 h-32 rounded-lg object-cover border" />
            ) : (
              <div className="w-32 h-32 rounded-lg bg-muted grid place-items-center text-3xl font-bold text-muted-foreground">
                {s.first_name?.[0]}{s.last_name?.[0]}
              </div>
            )}
            <div className="flex-1 min-w-[260px] space-y-2">
              <div>
                <h1 className="text-2xl font-bold">{s.first_name} {s.last_name}</h1>
                <p className="text-sm text-muted-foreground">{s.position_title || s.role.replace(/_/g, " ")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.staff_category && <Badge variant="secondary" className="capitalize">{s.staff_category}</Badge>}
                <Badge variant="outline" className="capitalize">{s.role.replace(/_/g, " ")}</Badge>
                <StatusBadge status={s.lifecycle_status ?? s.status} />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm pt-2">
                <div className="font-mono text-xs">EMP: {s.employee_no}</div>
                <div className="font-mono text-xs">ID: {s.unique_id ?? "—"}</div>
                {s.email && <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{s.email}</div>}
                {s.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</div>}
                {s.hire_date && <div className="flex items-center gap-1"><Calendar className="w-3 h-3" />Hired {s.hire_date}</div>}
                <div className="flex items-center gap-1">{s.user_id ? <Badge variant="outline" className="text-[10px]">Has login</Badge> : <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/30">No login</Badge>}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Briefcase className="w-4 h-4" />Department</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Department:</span> {data.deptName ?? s.department ?? "—"}</div>
            {data.subDeptName && <div><span className="text-muted-foreground">Sub-department:</span> {data.subDeptName}</div>}
            {s.admin_unit && <div><span className="text-muted-foreground">Admin unit:</span> {s.admin_unit}</div>}
            {s.support_unit && <div><span className="text-muted-foreground">Support unit:</span> {s.support_unit}</div>}
            {s.assigned_area && <div><span className="text-muted-foreground">Assigned area:</span> {s.assigned_area}</div>}
            {s.shift && <div><span className="text-muted-foreground">Shift:</span> {s.shift}</div>}
            {s.class_responsibility && <div><span className="text-muted-foreground">Class:</span> {s.class_responsibility}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BookOpen className="w-4 h-4" />Subjects Taught</CardTitle></CardHeader>
          <CardContent>
            {data.subjects.length === 0 ? <p className="text-sm text-muted-foreground">No subjects assigned.</p> : (
              <div className="flex flex-wrap gap-1">{data.subjects.map((c: string, i: number) => <Badge key={i} variant="outline">{c}</Badge>)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Award className="w-4 h-4" />Co-curricular</CardTitle></CardHeader>
          <CardContent>
            {data.activities.length === 0 ? <p className="text-sm text-muted-foreground">No activities assigned.</p> : (
              <ul className="text-sm space-y-1">
                {data.activities.map((a, i) => <li key={i}>• {a.name} <span className="text-xs text-muted-foreground">({a.role})</span></li>)}
              </ul>
            )}
            {s.oversight && s.oversight.length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs font-semibold mb-1">Oversight</p>
                <div className="flex flex-wrap gap-1">{s.oversight.map((o: string, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{o}</Badge>)}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" />System Access</CardTitle></CardHeader>
          <CardContent>
            {data.systemRoles.length === 0 ? <p className="text-sm text-muted-foreground">No system roles granted.</p> : (
              <div className="flex flex-wrap gap-1">{data.systemRoles.map((r: string, i: number) => <Badge key={i} variant="outline" className="capitalize">{r.replace(/_/g, " ")}</Badge>)}</div>
            )}
            {s.lifecycle_reason && (
              <div className="mt-3 pt-3 border-t text-xs">
                <p className="font-semibold mb-1">Lifecycle note</p>
                <p className="text-muted-foreground italic">{s.lifecycle_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
