import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2, ShieldCheck, ShieldX, ScanLine,
  User, Phone, Mail, MapPin, GraduationCap, Calendar,
  Heart, AlertCircle,
} from "lucide-react";

export const Route = createFileRoute("/_app/ids/verify")({ component: Page });

interface ParentContact {
  name: string;
  phone: string;
  email?: string;
  relationship: string;
}

interface VerifyResult {
  kind: "student" | "staff";
  name: string;
  uniqueId: string;
  admissionNo?: string;
  photo?: string;
  gender?: string;
  dob?: string;
  className?: string;
  stream?: string;
  year?: string;
  active: boolean;
  // Student-specific
  parents?: ParentContact[];
  medicalNotes?: string;
  bloodGroup?: string;
  address?: string;
  phone?: string;
  // Staff-specific
  role?: string;
  department?: string;
  employeeNo?: string;
  email?: string;
}

function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-muted-foreground shrink-0 w-28">{label}:</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
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

      // ── Try student first ────────────────────────────────────────────
      const { data: stu } = await supabase
        .from("students")
        .select(`
          id, first_name, last_name, unique_id, admission_no, status,
          gender, date_of_birth, photo_url, phone, address, blood_group,
          medical_notes, year_of_admission,
          classes(name, stream),
          parent_links(
            relationship,
            parents(first_name, last_name, phone, email)
          )
        `)
        .eq("unique_id", u)
        .maybeSingle();

      if (stu) {
        const s: any = stu;
        const parents: ParentContact[] = (s.parent_links ?? [])
          .filter((pl: any) => pl.parents)
          .map((pl: any) => ({
            name: `${pl.parents.first_name ?? ""} ${pl.parents.last_name ?? ""}`.trim(),
            phone: pl.parents.phone ?? "",
            email: pl.parents.email ?? "",
            relationship: pl.relationship ?? "Guardian",
          }));

        setResult({
          kind: "student",
          name: `${s.first_name} ${s.last_name}`,
          uniqueId: u,
          admissionNo: s.admission_no,
          photo: s.photo_url,
          gender: s.gender,
          dob: s.date_of_birth,
          className: s.classes?.name,
          stream: s.classes?.stream,
          year: s.year_of_admission,
          active: s.status === "active",
          parents,
          medicalNotes: s.medical_notes,
          bloodGroup: s.blood_group,
          address: s.address,
          phone: s.phone,
        });
        return;
      }

      // ── Try staff ────────────────────────────────────────────────────
      const { data: stf } = await supabase
        .from("staff")
        .select("first_name,last_name,unique_id,employee_no,role,department,status,phone,email,photo_url,gender,date_of_birth")
        .eq("unique_id", u)
        .maybeSingle();

      if (stf) {
        const s: any = stf;
        setResult({
          kind: "staff",
          name: `${s.first_name} ${s.last_name}`,
          uniqueId: u,
          active: s.status === "active",
          photo: s.photo_url,
          gender: s.gender,
          dob: s.date_of_birth,
          role: s.role,
          department: s.department,
          employeeNo: s.employee_no,
          email: s.email,
          phone: s.phone,
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

  // Auto-submit when QR fills the field (QR scanners send Enter/newline)
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); lookup(code); }
  }

  const initials = result
    ? result.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      {/* ── Search ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" /> Verify Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Scan the QR on an ID card — the field fills automatically — or type the Unique ID manually.
          </p>
          <div className="flex gap-2">
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. STU-2026-000123"
            />
            <Button onClick={() => lookup(code)} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 flex items-center gap-3 text-destructive">
            <ShieldX className="w-6 h-6 shrink-0" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* ── Result ── */}
      {result && (
        <Card className={result.active ? "border-green-500" : "border-amber-500"}>
          <CardContent className="pt-6 space-y-4">
            {/* Header row */}
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2 border-border">
                <AvatarImage src={result.photo ?? undefined} alt={result.name} />
                <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className={`w-5 h-5 shrink-0 ${result.active ? "text-green-600" : "text-amber-600"}`} />
                  <h2 className="text-xl font-bold">{result.name}</h2>
                  <Badge
                    variant={result.active ? "default" : "secondary"}
                    className={result.active ? "bg-green-600" : ""}
                  >
                    {result.kind.toUpperCase()} · {result.active ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-1">{result.uniqueId}</p>
              </div>
            </div>

            <Separator />

            {/* Core details */}
            <div className="space-y-2">
              {result.kind === "student" ? (
                <>
                  <InfoRow label="Admission No" value={result.admissionNo} icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Class" value={result.className ? `${result.className}${result.stream ? " — " + result.stream : ""}` : null} icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Year Joined" value={result.year} icon={<Calendar className="w-4 h-4" />} />
                  <InfoRow label="Gender" value={result.gender} icon={<User className="w-4 h-4" />} />
                  <InfoRow label="Date of Birth" value={result.dob ? new Date(result.dob).toLocaleDateString() : null} icon={<Calendar className="w-4 h-4" />} />
                  <InfoRow label="Phone" value={result.phone} icon={<Phone className="w-4 h-4" />} />
                  <InfoRow label="Address" value={result.address} icon={<MapPin className="w-4 h-4" />} />
                  <InfoRow label="Blood Group" value={result.bloodGroup} icon={<Heart className="w-4 h-4" />} />
                </>
              ) : (
                <>
                  <InfoRow label="Employee No" value={result.employeeNo} icon={<User className="w-4 h-4" />} />
                  <InfoRow label="Role" value={result.role} icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Department" value={result.department} icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Gender" value={result.gender} icon={<User className="w-4 h-4" />} />
                  <InfoRow label="Phone" value={result.phone} icon={<Phone className="w-4 h-4" />} />
                  <InfoRow label="Email" value={result.email} icon={<Mail className="w-4 h-4" />} />
                </>
              )}
            </div>

            {/* Parent / Guardian contacts — student only */}
            {result.kind === "student" && result.parents && result.parents.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Parent / Guardian Contacts</h3>
                  <div className="space-y-3">
                    {result.parents.map((p, i) => (
                      <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-1">
                        <div className="font-medium text-sm">{p.name}
                          <span className="ml-2 text-xs text-muted-foreground capitalize">({p.relationship})</span>
                        </div>
                        {p.phone && (
                          <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                            <Phone className="w-3 h-3" /> {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                            <Mail className="w-3 h-3" /> {p.email}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Medical notes */}
            {result.kind === "student" && result.medicalNotes && (
              <>
                <Separator />
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-0.5">Medical Notes</p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">{result.medicalNotes}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
