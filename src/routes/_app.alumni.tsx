import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { LifecycleActions } from "@/components/LifecycleActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Eye, GraduationCap, ArrowLeft, FileText } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Pager } from "@/components/Pager";

export const Route = createFileRoute("/_app/alumni")({ component: AlumniPage });

const ALUMNI_STATUSES = ["graduated", "expelled", "transferred", "transferred_out", "archived"] as const;

interface AlumniRow {
  id: string; admission_no: string; first_name: string; last_name: string;
  gender: string | null; last_class_name: string | null;
  lifecycle_status: string; lifecycle_reason: string | null;
  lifecycle_changed_at: string | null; transferred_to: string | null;
}

function AlumniPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin, hasRole } = useAuth();
  const canEdit = isAdmin || hasRole("admission_officer") || hasRole("deputy_principal");

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["alumni", q, statusFilter, page],
    queryFn: async () => {
      let req = supabase
        .from("students")
        .select(
          "id, admission_no, first_name, last_name, gender, last_class_name, lifecycle_status, lifecycle_reason, lifecycle_changed_at, transferred_to",
          { count: "exact" }
        )
        .in("lifecycle_status", statusFilter === "all" ? [...ALUMNI_STATUSES] : [statusFilter])
        .order("lifecycle_changed_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const t = q.trim();
      if (t) req = req.or(`admission_no.ilike.%${t}%,first_name.ilike.%${t}%,last_name.ilike.%${t}%`);
      const { data, error, count } = await req;
      if (error) throw error;
      return { rows: (data as unknown as AlumniRow[]) ?? [], count: count ?? 0 };
    },
  });
  const rows = pageData?.rows ?? [];
  const totalCount = pageData?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // Certificates, so a graduate/transfer row can jump straight to Print
  const { data: certByStudent = {} } = useQuery({
    queryKey: ["alumni-certs", rows.map((r) => r.id).join(",")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("leaving_certificates")
        .select("id, student_id")
        .in("student_id", rows.map((r) => r.id));
      const map: Record<string, string> = {};
      for (const c of data ?? []) map[(c as any).student_id] = (c as any).id;
      return map;
    },
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" asChild>
              <Link to="/students"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <GraduationCap className="w-7 h-7 text-violet-600" /> Alumni
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount.toLocaleString()} former students — graduated, expelled, transferred, or archived.
            They're no longer counted as active members of the school.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-3">
            <span>Records</span>
            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                <Input
                  placeholder="Search name or admission no…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  className="pl-8 w-56 h-8 text-sm"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All alumni</SelectItem>
                  <SelectItem value="graduated">Graduated</SelectItem>
                  <SelectItem value="expelled">Expelled</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                  <SelectItem value="transferred_out">Transferred (cert)</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center text-sm text-muted-foreground py-12">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Admission No</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Left from class</TableHead>
                    <TableHead>Gender</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">No alumni records found.</TableCell></TableRow>
                  )}
                  {rows.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.admission_no}</TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>{s.last_class_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="capitalize">{s.gender ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <StatusBadge status={s.lifecycle_status} />
                          {s.lifecycle_reason && (
                            <span className="text-[10px] text-muted-foreground italic max-w-[220px] truncate" title={s.lifecycle_reason}>
                              {s.lifecycle_reason}
                            </span>
                          )}
                          {s.transferred_to && (
                            <span className="text-[10px] text-muted-foreground">→ {s.transferred_to}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {s.lifecycle_changed_at ? new Date(s.lifecycle_changed_at).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}>
                          <Eye className="w-3.5 h-3.5" /> View
                        </Button>
                        {certByStudent[s.id] && (
                          <Button size="sm" variant="ghost" className="gap-1" asChild>
                            <Link to="/admin/leaving-certificate/$id" params={{ id: certByStudent[s.id] }}>
                              <FileText className="w-3.5 h-3.5" /> Certificate
                            </Link>
                          </Button>
                        )}
                        {canEdit && (
                          <LifecycleActions kind="student" id={s.id} currentStatus={s.lifecycle_status} queryKey="alumni" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <Pager page={page} pageCount={pageCount} total={totalCount} onChange={setPage} />
        </CardContent>
      </Card>
    </div>
  );
}
