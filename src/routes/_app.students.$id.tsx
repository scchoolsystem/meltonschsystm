import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, Phone, IdCard as IdCardIcon, Printer, User } from "lucide-react";
import { LifecycleActions } from "@/components/LifecycleActions";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app/students/$id")({ component: StudentProfilePage });

function StudentProfilePage() {
  const { id } = Route.useParams();
  const { isAdmin, hasRole } = useAuth();
  const router = useRouter();
  const canEdit = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");

  const { data: student, isLoading } = useQuery({
    queryKey: ["student-profile", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, classes(name, stream, year)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: attendance } = useQuery({
    queryKey: ["student-profile-attendance", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, date, status, remarks")
        .eq("student_id", id)
        .order("date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: invoices } = useQuery({
    queryKey: ["student-profile-invoices", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, amount, paid, status, due_date")
        .eq("student_id", id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  const { data: discipline } = useQuery({
    queryKey: ["student-profile-discipline", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discipline_records")
        .select("id, incident_date, category, severity, description, action_taken")
        .eq("student_id", id)
        .order("incident_date", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!student,
  });

  if (isLoading) return <div className="h-screen grid place-items-center"><Loader2 className="animate-spin" /></div>;
  if (!student) return <div className="p-8">Student not found.</div>;

  const fullName = `${student.first_name} ${student.last_name}`;
  const balance = (invoices ?? []).reduce((sum, i: any) => sum + (Number(i.amount) - Number(i.paid)), 0);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={() => router.history.length > 1 ? router.history.back() : router.navigate({ to: "/students" })}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to students
        </button>
        <div className="flex items-center gap-2">
          <Link to="/ids/student/$id" params={{ id: student.id }}>
            <Button size="sm" variant="outline"><Printer className="w-4 h-4 mr-2" />ID Card</Button>
          </Link>
          {canEdit && (
            <LifecycleActions kind="student" id={student.id} currentStatus={student.lifecycle_status} queryKey="student-profile" />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="w-24 h-24 rounded-xl bg-muted overflow-hidden shrink-0 grid place-items-center">
              {student.photo_url ? (
                <img src={student.photo_url} alt={fullName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl font-semibold text-muted-foreground">
                  {student.first_name?.[0]}{student.last_name?.[0]}
                </span>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold">{fullName}</h1>
                <StatusBadge status={student.lifecycle_status} />
              </div>
              <p className="text-muted-foreground">
                {student.classes ? `${student.classes.name}${student.classes.stream ? " " + student.classes.stream : ""}` : "Unassigned class"}
              </p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground pt-1">
                <span className="inline-flex items-center gap-1"><IdCardIcon className="w-3.5 h-3.5" />{student.admission_no}</span>
                {student.parent_name && <span className="inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{student.parent_name}</span>}
                {student.parent_phone && <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{student.parent_phone}</span>}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {student.gender && <Badge variant="secondary" className="capitalize">{student.gender}</Badge>}
                {student.level && <Badge variant="outline">{student.level}</Badge>}
                {student.admitted_on && <Badge variant="outline">Admitted {student.admitted_on}</Badge>}
                <Badge variant={balance > 0 ? "destructive" : "outline"}>
                  Balance KES {balance.toLocaleString()}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
          <TabsTrigger value="discipline">Discipline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Personal details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <Field label="Date of birth" value={student.date_of_birth} />
              <Field label="National ID" value={student.national_id} />
              <Field label="Address" value={student.address} />
              <Field label="Desk no" value={student.desk_no?.toString()} />
              <Field label="Parent email" value={student.parent_email} />
              <Field label="Unique ID" value={student.unique_id} />
            </CardContent>
          </Card>
          {student.medical_notes && (
            <Card>
              <CardHeader><CardTitle className="text-base">Medical notes</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{student.medical_notes}</CardContent>
            </Card>
          )}
          {student.lifecycle_status !== "active" && student.lifecycle_reason && (
            <Card>
              <CardHeader><CardTitle className="text-base">Lifecycle note</CardTitle></CardHeader>
              <CardContent className="text-sm text-muted-foreground">{student.lifecycle_reason}</CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="attendance" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Recent attendance</CardTitle></CardHeader>
            <CardContent>
              {attendance && attendance.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendance.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.date}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{a.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground">{a.remarks || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No attendance records yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Invoices</CardTitle></CardHeader>
            <CardContent>
              {invoices && invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono">{inv.invoice_no}</TableCell>
                        <TableCell>KES {Number(inv.amount).toLocaleString()}</TableCell>
                        <TableCell>KES {Number(inv.paid).toLocaleString()}</TableCell>
                        <TableCell>{inv.due_date || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{inv.status}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="discipline" className="pt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Discipline records</CardTitle></CardHeader>
            <CardContent>
              {discipline && discipline.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Action taken</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {discipline.map((d: any) => (
                      <TableRow key={d.id}>
                        <TableCell>{d.incident_date}</TableCell>
                        <TableCell className="capitalize">{d.category}</TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{d.severity}</Badge></TableCell>
                        <TableCell className="text-muted-foreground max-w-xs truncate">{d.description}</TableCell>
                        <TableCell className="text-muted-foreground">{d.action_taken || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No discipline records.</p>
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
