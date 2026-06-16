import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, CheckCircle2, AlertCircle, GraduationCap, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/import")({ component: ImportPage });

// ─── Column definitions ───────────────────────────────────────────────────────
const STUDENT_HEADERS = [
  "admission_no",
  "first_name",
  "last_name",
  "gender",           // M / F
  "date_of_birth",    // YYYY-MM-DD
  "class_name",       // must match an existing class name e.g. "Form 1A"
  "year_of_admission",// e.g. 2023
  "parent_name",
  "parent_phone",
  "parent_email",
  "address",
  "nationality",
  "special_needs",    // optional free text
];

const STAFF_HEADERS = [
  "employee_no",
  "first_name",
  "last_name",
  "role",             // must be a valid system role e.g. "teacher"
  "staff_category",   // teaching / non-teaching / support
  "department",       // department name (matched by name)
  "gender",
  "date_of_birth",    // YYYY-MM-DD
  "hire_date",        // YYYY-MM-DD
  "email",
  "phone",
  "national_id",
  "qualifications",   // optional free text
];

const STUDENT_EXAMPLE =
  `${STUDENT_HEADERS.join(",")}\n` +
  `ADM001,Jane,Doe,F,2010-04-12,Form 1A,2023,Mary Doe,+254700000000,mary@example.com,Nairobi,Kenyan,\n`;

const STAFF_EXAMPLE =
  `${STAFF_HEADERS.join(",")}\n` +
  `EMP001,John,Smith,teacher,teaching,Mathematics,M,1985-06-20,2020-01-15,john.smith@school.ac.ke,+254711000001,12345678,,\n`;

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
  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CSV Import</h1>
        <p className="text-sm text-muted-foreground">
          Bulk-load students or staff from a spreadsheet. Download the correct template first.
        </p>
      </div>
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students"><GraduationCap className="w-3.5 h-3.5 mr-1" />Students</TabsTrigger>
          <TabsTrigger value="staff"><Briefcase className="w-3.5 h-3.5 mr-1" />Staff</TabsTrigger>
        </TabsList>
        <TabsContent value="students" className="mt-4">
          <ImportPanel
            kind="students"
            headers={STUDENT_HEADERS}
            example={STUDENT_EXAMPLE}
            requiredCols={["admission_no", "first_name"]}
            buildPayload={buildStudentPayload}
            tableName="students"
            keyCol="admission_no"
          />
        </TabsContent>
        <TabsContent value="staff" className="mt-4">
          <ImportPanel
            kind="staff"
            headers={STAFF_HEADERS}
            example={STAFF_EXAMPLE}
            requiredCols={["employee_no", "first_name"]}
            buildPayload={buildStaffPayload}
            tableName="staff"
            keyCol="employee_no"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Payload builders ─────────────────────────────────────────────────────────
async function buildStudentPayload(r: Record<string, string>): Promise<Record<string, any>> {
  // Resolve class_name → class_id
  let class_id: string | null = null;
  if (r.class_name?.trim()) {
    const { data } = await supabase.from("classes").select("id").ilike("name", r.class_name.trim()).maybeSingle();
    class_id = data?.id ?? null;
  }
  return {
    admission_no: r.admission_no,
    first_name: r.first_name,
    last_name: r.last_name || "",
    gender: r.gender || null,
    date_of_birth: r.date_of_birth || null,
    class_id,
    year_of_admission: r.year_of_admission ? parseInt(r.year_of_admission) : null,
    parent_name: r.parent_name || null,
    parent_phone: r.parent_phone || null,
    parent_email: r.parent_email || null,
    address: r.address || null,
    nationality: r.nationality || null,
    special_needs: r.special_needs || null,
  };
}

async function buildStaffPayload(r: Record<string, string>): Promise<Record<string, any>> {
  // Resolve department name → department_id
  let department_id: string | null = null;
  if (r.department?.trim()) {
    const { data } = await supabase.from("departments").select("id").ilike("name", r.department.trim()).maybeSingle();
    department_id = data?.id ?? null;
  }
  return {
    employee_no: r.employee_no,
    first_name: r.first_name,
    last_name: r.last_name || "",
    role: r.role || "staff",
    staff_category: r.staff_category || null,
    department_id,
    gender: r.gender || null,
    date_of_birth: r.date_of_birth || null,
    hire_date: r.hire_date || null,
    email: r.email || null,
    phone: r.phone || null,
    national_id: r.national_id || null,
    qualifications: r.qualifications || null,
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
}: {
  kind: string;
  headers: string[];
  example: string;
  requiredCols: string[];
  buildPayload: (r: Record<string, string>) => Promise<Record<string, any>>;
  tableName: string;
  keyCol: string;
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
        const { error } = await supabase.from(tableName as any).insert(payload as any);
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
