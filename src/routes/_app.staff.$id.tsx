import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Mail, Phone, IdCard as IdCardIcon, Printer } from "lucide-react";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/staff/$id")({ component: StaffProfilePage });

function StaffProfilePage() {
  const { id } = Route.useParams();
  const { isAdmin } = useAuth();

  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*, departments(name), sub_departments(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: subjects } = useQuery({
    queryKey: ["staff-profile-subjects", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_subjects")
        .select("id, subjects(name)")
        .eq("staff_id", id);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!staff,
  });

  const { data: classAssignments } = useQuery({
    queryKey: ["staff-profile-classes", id],
    queryFn: async () => {
      if (!staff?.user_id) return [];
      const { data, error } = await supabase
        .from("teacher_class_assignments")
        .select("id, is_active, classes(name, stream, year)")
        .eq("teacher_user_id", staff.user_id)
        .eq("is_active", true);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!staff,
  });

  const { data: loans } = useQuery({
    queryKey: ["staff-profile-loans", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_loans")
        .select("id, borrowed_on, due_on, returned_on, status, books(title, author)")
        .eq("staff_id", id)
        .order("borrowed_on", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!staff,
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!staff) return <div className="p-8">Staff member not found.</div>;

  const fullName = `${staff.first_name} ${staff.last_name}`;
  const dept = staff.sub_departments?.name || staff.departments?.name;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Link to="/staff" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Back to staff
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/ids/staff/$id" params={{ id: staff.id }}>
            <Button size="sm" variant="outline"><Printer className="w-4 h-4 mr-2" />ID Card</Button>
          </Link>
          {isAdmin && (
            <LifecycleActions kind="staff" id={staff.id} currentStatus={staff.lifecycle_status} queryKey="staff-profile" />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 rounded-xl bg-muted overflow-hidden shrink-0 grid place-items-center">
              {staff.photo_url ? (
                <img src={staff.photo_url} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">
                  {staff.first_name?.[0]}{staff.last_name?.[0]}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <StatusBadge status={staff.lifecycle_status} />
              </div>
              <p className="text-muted-foreground">{staff.position_title || "—"}{dept ? ` · ${dept}` : ""}</p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1"><IdCardIcon className="w-3.5 h-3.5" />{staff.employee_no}</span>
                {staff.email && <span className="inline-flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{staff.email}</span>}
                {staff.phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{staff.phone}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {staff.staff_category && <Badge variant="secondary" className="capitalize">{staff.staff_category}</Badge>}
                {staff.shift && <Badge variant="outline" className="capitalize">{staff.shift} shift</Badge>}
                {staff.hire_date && <Badge variant="outline">Hired {staff.hire_date}</Badge>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="teaching">Teaching</TabsTrigger>
          <TabsTrigger value="library">Library</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Assignment details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Field label="Admin unit" value={staff.admin_unit} />
              <Field label="Support unit" value={staff.support_unit} />
              <Field label="Assigned area" value={staff.assigned_area} />
              <Field label="Class responsibility" value={staff.class_responsibility} />
              <Field label="Oversight" value={staff.oversight?.join(", ")} />
              <Field label="Unique ID" value={staff.unique_id} />
            </CardContent>
          </Card>
          {staff.lifecycle_status !== "active" && staff.lifecycle_reason && (
            <Card>
              <CardHeader><CardTitle className="text-base">Lifecycle note</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{staff.lifecycle_reason}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="teaching" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Subjects taught</CardTitle></CardHeader>
            <CardContent>
              {subjects && subjects.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {subjects.map((s: any) => <Badge key={s.id} variant="secondary">{s.subjects?.name}</Badge>)}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No subjects assigned.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Active class assignments</CardTitle></CardHeader>
            <CardContent>
              {classAssignments && classAssignments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {classAssignments.map((c: any) => (
                    <Badge key={c.id} variant="outline">
                      {c.classes?.name}{c.classes?.stream ? ` ${c.classes.stream}` : ""}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active class assignments.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="library" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Book loans</CardTitle></CardHeader>
            <CardContent>
              {loans && loans.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Borrowed</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loans.map((l: any) => (
                      <TableRow key={l.id}>
                        <TableCell>{l.books?.title}<div className="text-xs text-muted-foreground">{l.books?.author}</div></TableCell>
                        <TableCell>{l.borrowed_on}</TableCell>
                        <TableCell>{l.due_on}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{l.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No library activity.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs uppercase">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
