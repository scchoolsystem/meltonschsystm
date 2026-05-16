import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, ShieldX, ScanLine } from "lucide-react";

export const Route = createFileRoute("/_app/ids/verify")({ component: Page });

interface VerifyResult {
  kind: "student" | "staff";
  name: string;
  uniqueId: string;
  extra: Record<string, string>;
  active: boolean;
}

function Page() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup(uid: string) {
    setLoading(true); setError(null); setResult(null);
    try {
      const u = uid.trim().toUpperCase();
      if (!u) return;
      // try student
      const { data: stu } = await supabase.from("students")
        .select("first_name,last_name,unique_id,admission_no,status,classes(name)")
        .eq("unique_id", u).maybeSingle();
      if (stu) {
        const s: any = stu;
        setResult({
          kind: "student", name: `${s.first_name} ${s.last_name}`, uniqueId: u,
          active: s.status === "active",
          extra: { "Adm No": s.admission_no, Class: s.classes?.name || "—" },
        });
        return;
      }
      const { data: stf } = await supabase.from("staff")
        .select("first_name,last_name,unique_id,employee_no,role,department,status")
        .eq("unique_id", u).maybeSingle();
      if (stf) {
        const s: any = stf;
        setResult({
          kind: "staff", name: `${s.first_name} ${s.last_name}`, uniqueId: u,
          active: s.status === "active",
          extra: { "Emp No": s.employee_no, Role: s.role, Dept: s.department || "—" },
        });
        return;
      }
      setError("No record found for this ID.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ScanLine className="w-5 h-5" />Verify Identity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Scan the QR on an ID card (it fills the field) or type the Unique ID manually.</p>
          <form onSubmit={(e) => { e.preventDefault(); lookup(code); }} className="flex gap-2">
            <Input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. STU-2026-000123" />
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}</Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-center gap-3 text-destructive">
            <ShieldX className="w-6 h-6" /> <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={result.active ? "border-green-500" : "border-amber-500"}>
          <CardContent className="pt-6 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className={`w-6 h-6 ${result.active ? "text-green-600" : "text-amber-600"}`} />
              <div className="text-lg font-bold">{result.name}</div>
              <Badge variant={result.active ? "default" : "secondary"} className="ml-auto">
                {result.kind.toUpperCase()} • {result.active ? "ACTIVE" : "INACTIVE"}
              </Badge>
            </div>
            <div className="text-sm font-mono">{result.uniqueId}</div>
            <div className="grid grid-cols-2 gap-2 text-sm pt-2">
              {Object.entries(result.extra).map(([k, v]) => (
                <div key={k}><span className="text-muted-foreground">{k}:</span> {v}</div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
