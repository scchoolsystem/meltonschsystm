import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, CheckCircle2, AlertCircle, GraduationCap, Briefcase, Layers, BookOpen, Link2, ListOrdered, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { StudentImportPanel, StaffImportPanel } from "@/components/admin/ProvisioningImportPanel";

export const Route = createFileRoute("/_app/admin/import")({ component: ImportPage });

// ─── Column definitions ───────────────────────────────────────────────────────
// NOTE: Students and Staff are handled by StudentImportPanel / StaffImportPanel
// (see @/components/admin/ProvisioningImportPanel), which route every row
// through the existing admitStudent / createStaff provisioning pipeline so
// CSV-imported users get an Auth account, Profile, User Roles, User
// Credentials, and School Member record — exactly like manually created users.
// The generic ImportPanel below (raw table insert) remains for structural,
// non-user data: Classes, Class Structure, Subjects, and their links.

const CLASS_HEADERS = [
  "name",                      // e.g. "Grade 5" — used as the promotion-ladder level name
  "level",                     // primary / secondary
  "stream",                    // e.g. "Blue" — optional, leave blank if no streams
  "year",                      // e.g. 2026
  "capacity",                  // e.g. 40
  "class_teacher_employee_no", // optional — must match a staff employee_no with a linked login
];
const CLASS_EXAMPLE =
  `${CLASS_HEADERS.join(",")}\n` +
  `Grade 5,primary,Blue,2026,40,EMP001\n`;

const CLASS_STRUCTURE_HEADERS = [
  "class_name",  // must match a class "name" above EXACTLY — this is what auto-links it
  "sort_order",  // 1,2,3... defines the promotion order
  "is_terminal", // true for the graduating class, otherwise blank/false
];
const CLASS_STRUCTURE_EXAMPLE =
  `${CLASS_STRUCTURE_HEADERS.join(",")}\n` +
  `Grade 5,5,\n` +
  `Grade 6,6,\n` +
  `Grade 8,8,true\n`;

const SUBJECT_HEADERS = ["code", "name", "level"]; // level: primary / secondary
const SUBJECT_EXAMPLE =
  `${SUBJECT_HEADERS.join(",")}\n` +
  `MATH,Mathematics,primary\n`;

const CLASS_SUBJECT_HEADERS = [
  "class_name",             // must match an existing class name
  "stream",                 // optional — only needed if that class name has multiple streams
  "subject_code",           // must match an existing subject code
  "lessons_per_week",       // e.g. 5
  "requires_double_lesson", // true/false
  "requires_triple_lesson", // true/false
  "priority",                // 1 = highest, used by the timetable generator
];
const CLASS_SUBJECT_EXAMPLE =
  `${CLASS_SUBJECT_HEADERS.join(",")}\n` +
  `Grade 5,Blue,MATH,5,false,false,1\n`;

const TEACHER_ASSIGNMENT_HEADERS = ["employee_no", "class_name", "stream", "is_active"];
const TEACHER_ASSIGNMENT_EXAMPLE =
  `${TEACHER_ASSIGNMENT_HEADERS.join(",")}\n` +
  `EMP001,Grade 5,Blue,true\n`;

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const split = (l: string) => l.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] || ""));
    return row;
  });
}

function ImportPage() {
  const { isAdmin } = useAuth();
  const [schoolId, setSchoolId] = useState<string | null | undefined>(undefined); // undefined = still loading

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("current_user_school").then(({ data }) => {
      if (!cancelled) setSchoolId((data as string | null) ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShieldAlert className="w-10 h-10 mx-auto mb-2 opacity-40" />
            Super admin only.
          </CardContent>
        </Card>
      </div>
    );
  }
  if (schoolId === null) {
    return (
      <div className="p-6">
        <Card className="border-destructive/50">
          <CardContent className="py-12 text-center text-destructive">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-60" />
            No school could be resolved for your account (current_user_school returned nothing) —
            imports need a school to attach rows to. Confirm your account has an active school membership.
          </CardContent>
        </Card>
      </div>
    );
  }
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CSV Import</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-load students or staff from a spreadsheet. Download the correct template first.
        </p>
      </div>
      <Tabs defaultValue="students">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="students"><GraduationCap className="w-3.5 h-3.5 mr-1" />Students</TabsTrigger>
          <TabsTrigger value="staff"><Briefcase className="w-3.5 h-3.5 mr-1" />Staff</TabsTrigger>
          <TabsTrigger value="classes"><Layers className="w-3.5 h-3.5 mr-1" />Classes</TabsTrigger>
          <TabsTrigger value="structure"><ListOrdered className="w-3.5 h-3.5 mr-1" />Class Structure</TabsTrigger>
          <TabsTrigger value="subjects"><BookOpen className="w-3.5 h-3.5 mr-1" />Subjects</TabsTrigger>
          <TabsTrigger value="class-subjects"><Link2 className="w-3.5 h-3.5 mr-1" />Class ↔ Subjects</TabsTrigger>
          <TabsTrigger value="teacher-assignments"><UserCheck className="w-3.5 h-3.5 mr-1" />Teacher ↔ Classes</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <StudentImportPanel />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <StaffImportPanel />
        </TabsContent>
        <TabsContent value="classes" className="mt-4">
          <ImportPanel
            kind="classes"
            headers={CLASS_HEADERS}
            example={CLASS_EXAMPLE}
            requiredCols={["name", "level"]}
            buildPayload={(r) => buildClassPayload(r, schoolId)}
            tableName="classes"
            keyCol="name"
          />
        </TabsContent>
        <TabsContent value="structure" className="mt-4">
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            Defines the promotion ladder. A class_name here that matches a class you imported above links itself
            automatically — no extra step needed.
          </p>
          <ImportPanel
            kind="class structure"
            headers={CLASS_STRUCTURE_HEADERS}
            example={CLASS_STRUCTURE_EXAMPLE}
            requiredCols={["class_name"]}
            buildPayload={(r) => buildClassStructurePayload(r, schoolId)}
            tableName="school_class_structure"
            keyCol="class_name"
            upsertConflict="school_id,class_name"
          />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <ImportPanel
            kind="subjects"
            headers={SUBJECT_HEADERS}
            example={SUBJECT_EXAMPLE}
            requiredCols={["code", "name", "level"]}
            buildPayload={buildSubjectPayload}
            tableName="subjects"
            keyCol="code"
            upsertConflict="code"
          />
        </TabsContent>
        <TabsContent value="class-subjects" className="mt-4">
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            Import Classes and Subjects first — each row here needs to find a matching class and subject to link them.
          </p>
          <ImportPanel
            kind="class-subject links"
            headers={CLASS_SUBJECT_HEADERS}
            example={CLASS_SUBJECT_EXAMPLE}
            requiredCols={["class_name", "subject_code"]}
            buildPayload={(r) => buildClassSubjectPayload(r, schoolId)}
            tableName="class_subjects"
            keyCol="subject_code"
            upsertConflict="class_id,subject_id"
          />
        </TabsContent>
        <TabsContent value="teacher-assignments" className="mt-4">
          <p className="text-xs text-muted-foreground -mt-2 mb-3">
            The employee_no must belong to a staff member who has already accepted an account invite (has a login).
          </p>
          <ImportPanel
            kind="teacher-class assignments"
            headers={TEACHER_ASSIGNMENT_HEADERS}
            example={TEACHER_ASSIGNMENT_EXAMPLE}
            requiredCols={["employee_no", "class_name"]}
            buildPayload={buildTeacherAssignmentPayload}
            tableName="teacher_class_assignments"
            keyCol="employee_no"
            upsertConflict="class_id,teacher_user_id"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Payload builders (structural data only — see note above) ────────────────
const truthy = (v?: string) => /^(true|yes|1)$/i.test((v || "").trim());

async function buildClassPayload(r: Record<string, string>, schoolId?: string | null): Promise<Record<string, any>> {
  if (!schoolId) throw new Error("No school resolved for your account — reload and try again.");
  // class_teacher_id FK points at staff(id) (see 20260525120000_fix_class_teacher_fkey.sql),
  // NOT staff.user_id / auth.users — select the staff row's own id.
  let class_teacher_id: string | null = null;
  if (r.class_teacher_employee_no?.trim()) {
    const { data } = await supabase
      .from("staff").select("id").eq("employee_no", r.class_teacher_employee_no.trim()).maybeSingle();
    class_teacher_id = data?.id ?? null;
  }
  return {
    school_id: schoolId,
    name: r.name,
    level: (r.level || "primary").trim().toLowerCase(),
    stream: r.stream?.trim() || null,
    year: r.year ? parseInt(r.year) : new Date().getFullYear(),
    capacity: r.capacity ? parseInt(r.capacity) : 40,
    class_teacher_id,
  };
}

async function buildClassStructurePayload(r: Record<string, string>, schoolId?: string | null): Promise<Record<string, any>> {
  if (!schoolId) throw new Error("No school resolved for your account — reload and try again.");
  return {
    school_id: schoolId,
    class_name: r.class_name.trim(),
    sort_order: r.sort_order ? parseInt(r.sort_order) : 1,
    is_terminal: truthy(r.is_terminal),
  };
}

async function buildSubjectPayload(r: Record<string, string>): Promise<Record<string, any>> {
  return {
    code: r.code.trim(),
    name: r.name.trim(),
    level: (r.level || "primary").trim().toLowerCase(),
  };
}

async function buildClassSubjectPayload(r: Record<string, string>, schoolId?: string | null): Promise<Record<string, any>> {
  if (!schoolId) throw new Error("No school resolved for your account — reload and try again.");

  let classQuery = supabase.from("classes").select("id").eq("school_id", schoolId).ilike("name", r.class_name?.trim() ?? "");
  if (r.stream?.trim()) classQuery = classQuery.ilike("stream", r.stream.trim());
  const { data: classRows } = await classQuery.limit(1);
  const class_id = classRows?.[0]?.id ?? null;
  if (!class_id) throw new Error(`Class not found: "${r.class_name}"${r.stream ? ` - ${r.stream}` : ""}. Import Classes first.`);

  const { data: subj } = await supabase.from("subjects").select("id").eq("code", r.subject_code?.trim()).maybeSingle();
  if (!subj?.id) throw new Error(`Subject code not found: "${r.subject_code}". Import Subjects first.`);

  return {
    school_id: schoolId,
    class_id,
    subject_id: subj.id,
    lessons_per_week: r.lessons_per_week ? parseInt(r.lessons_per_week) : 4,
    requires_double_lesson: truthy(r.requires_double_lesson),
    requires_triple_lesson: truthy(r.requires_triple_lesson),
    priority: r.priority ? parseInt(r.priority) : 1,
  };
}

async function buildTeacherAssignmentPayload(r: Record<string, string>): Promise<Record<string, any>> {
  const { data: staffRow } = await supabase
    .from("staff").select("user_id").eq("employee_no", r.employee_no?.trim()).maybeSingle();
  if (!staffRow?.user_id) throw new Error(`Staff "${r.employee_no}" has no linked login account yet — invite them first.`);

  let classQuery = supabase.from("classes").select("id").ilike("name", r.class_name?.trim() ?? "");
  if (r.stream?.trim()) classQuery = classQuery.ilike("stream", r.stream.trim());
  const { data: classRows } = await classQuery.limit(1);
  const class_id = classRows?.[0]?.id ?? null;
  if (!class_id) throw new Error(`Class not found: "${r.class_name}"${r.stream ? ` - ${r.stream}` : ""}. Import Classes first.`);

  return {
    teacher_user_id: staffRow.user_id,
    class_id,
    is_active: r.is_active === undefined || r.is_active === "" ? true : truthy(r.is_active),
  };
}

// ─── Shared import panel ──────────────────────────────────────────────────────
function ImportPanel({
  kind,
  headers,
  example,
  requiredCols,
  buildPayload,
  tableName,
  keyCol,
  upsertConflict,
}: {
  kind: string;
  headers: string[];
  example: string;
  requiredCols: string[];
  buildPayload: (r: Record<string, string>) => Promise<Record<string, any>>;
  tableName: string;
  keyCol: string;
  upsertConflict?: string; // e.g. "class_id,subject_id" — pass the DB unique constraint's columns to upsert instead of insert
}) {
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const onFile = async (f: File) => {
    const t = await f.text();
    setText(t);
    setRows(parseCSV(t));
    setResult(null);
  };

  const onPaste = () => { setRows(parseCSV(text)); setResult(null); };

  const downloadTemplate = () => {
    const blob = new Blob([example], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${kind}-template.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true); setResult(null);
    let ok = 0, fail = 0;
    const errors: string[] = [];

    for (const r of rows) {
      const missingRequired = requiredCols.filter((c) => !r[c]?.trim());
      if (missingRequired.length) {
        fail++;
        errors.push(`Skip: missing ${missingRequired.join(", ")} → ${JSON.stringify(r)}`);
        continue;
      }
      try {
        const payload = await buildPayload(r);
        const { error } = upsertConflict
          ? await supabase.from(tableName as any).upsert(payload as any, { onConflict: upsertConflict })
          : await supabase.from(tableName as any).insert(payload as any);
        if (error) { fail++; errors.push(`${r[keyCol]}: ${error.message}`); }
        else ok++;
      } catch (e: any) {
        fail++; errors.push(`${r[keyCol]}: ${e.message}`);
      }
    }

    setResult({ ok, fail, errors });
    setBusy(false);
    toast.success(`Imported ${ok} ${kind}${fail ? `, ${fail} failed` : ""}.`);
  };

  // Validate detected columns vs expected headers
  const detectedHeaders = rows.length > 0 ? Object.keys(rows[0]) : [];
  const missingHeaders = headers.filter((h) => requiredCols.includes(h) && !detectedHeaders.includes(h));

  return (
    <div className="space-y-4">
      {/* Step 1 — template */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">1. Download template</CardTitle>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" /> Template CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground mb-2">
            Required columns (marked *): <span className="font-semibold">{requiredCols.join(", ")}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {headers.map((h) => (
              <Badge key={h} variant={requiredCols.includes(h) ? "default" : "outline"} className="text-[10px] font-mono">
                {h}{requiredCols.includes(h) ? " *" : ""}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step 2 — upload */}
      <Card>
        <CardHeader><CardTitle className="text-base">2. Upload or paste CSV</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Upload .csv file</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          <div>
            <Label>Or paste CSV text</Label>
            <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder={`${headers.join(",")}\n…`} />
            <Button size="sm" variant="outline" className="mt-2" onClick={onPaste}>Parse</Button>
          </div>
        </CardContent>
      </Card>

      {/* Column mismatch warning */}
      {rows.length > 0 && missingHeaders.length > 0 && (
        <Card className="border-destructive/50">
          <CardContent className="py-3 flex gap-2 items-start text-sm text-destructive">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Required columns missing in your file: <strong>{missingHeaders.join(", ")}</strong>. Fix before importing.</span>
          </CardContent>
        </Card>
      )}

      {/* Step 3 — preview & import */}
      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">3. Preview ({rows.length} rows)</CardTitle>
            <Button onClick={runImport} disabled={busy || missingHeaders.length > 0}>
              <Upload className="w-4 h-4 mr-2" /> {busy ? "Importing…" : `Import ${kind}`}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded">
              <table className="text-xs w-full">
                <thead className="bg-muted">
                  <tr>{Object.keys(rows[0]).map((h) => (
                    <th key={h} className={`px-2 py-1 text-left ${requiredCols.includes(h) ? "font-bold" : ""}`}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      {Object.keys(rows[0]).map((h) => <td key={h} className="px-2 py-1">{r[h]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && <div className="text-xs text-muted-foreground p-2">…and {rows.length - 10} more</div>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Result
              <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{result.ok} imported</Badge>
              {result.fail > 0 && <Badge variant="destructive" className="gap-1"><AlertCircle className="w-3 h-3" />{result.fail} failed</Badge>}
            </CardTitle>
          </CardHeader>
          {result.errors.length > 0 && (
            <CardContent>
              <div className="text-xs space-y-1 max-h-60 overflow-auto font-mono">
                {result.errors.map((e, i) => <div key={i} className="text-destructive">{e}</div>)}
              </div>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
