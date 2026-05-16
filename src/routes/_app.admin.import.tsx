import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Upload, Download, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/admin/import")({ component: ImportPage });

const STUDENT_HEADERS = ["admission_no", "first_name", "last_name", "gender", "date_of_birth", "parent_name", "parent_phone", "parent_email", "address"];

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
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null);

  const onFile = async (f: File) => {
    const t = await f.text();
    setText(t);
    setRows(parseCSV(t));
  };

  const onPaste = () => setRows(parseCSV(text));

  const downloadTemplate = () => {
    const csv = STUDENT_HEADERS.join(",") + "\nADM001,Jane,Doe,F,2010-04-12,Mary Doe,+254700000000,mary@example.com,Nairobi\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "students-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const runImport = async () => {
    if (!rows.length) return;
    setBusy(true); setResult(null);
    let ok = 0, fail = 0;
    const errors: string[] = [];
    for (const r of rows) {
      if (!r.admission_no || !r.first_name) { fail++; errors.push(`Skip: missing admission_no/first_name (${JSON.stringify(r)})`); continue; }
      const payload: any = {
        admission_no: r.admission_no,
        first_name: r.first_name,
        last_name: r.last_name || "",
        gender: r.gender || null,
        date_of_birth: r.date_of_birth || null,
        parent_name: r.parent_name || null,
        parent_phone: r.parent_phone || null,
        parent_email: r.parent_email || null,
        address: r.address || null,
      };
      const { error } = await supabase.from("students").insert(payload);
      if (error) { fail++; errors.push(`${r.admission_no}: ${error.message}`); }
      else ok++;
    }
    setResult({ ok, fail, errors });
    setBusy(false);
    toast.success(`Imported ${ok} students${fail ? `, ${fail} failed` : ""}.`);
  };

  return (
    <div className="p-6 max-w-5xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CSV Import — Students</h1>
        <p className="text-sm text-muted-foreground">Bulk-load students from a spreadsheet.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">1. Template</CardTitle>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4 mr-2" /> Download template
          </Button>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Required columns: <code className="bg-muted px-1 rounded">{STUDENT_HEADERS.join(", ")}</code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">2. Upload or paste CSV</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Upload .csv</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          <div>
            <Label>Or paste CSV text</Label>
            <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="admission_no,first_name,last_name,..." />
            <Button size="sm" variant="outline" className="mt-2" onClick={onPaste}>Parse</Button>
          </div>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">3. Preview ({rows.length} rows)</CardTitle>
            <Button onClick={runImport} disabled={busy}>
              <Upload className="w-4 h-4 mr-2" /> {busy ? "Importing…" : "Import"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded">
              <table className="text-xs w-full">
                <thead className="bg-muted">
                  <tr>{Object.keys(rows[0]).map((h) => <th key={h} className="px-2 py-1 text-left">{h}</th>)}</tr>
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

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Result
              <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" />{result.ok} ok</Badge>
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
