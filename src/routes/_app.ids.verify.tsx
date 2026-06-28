import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Loader2, ShieldCheck, ShieldX, ScanLine, Camera, CameraOff,
  User, Phone, Mail, MapPin, GraduationCap, Calendar,
  Heart, AlertCircle, Search,
} from "lucide-react";

export const Route = createFileRoute("/_app/ids/verify")({ component: Page });

// ── Types ─────────────────────────────────────────────────────────────────────

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
  active: boolean;
  parents?: ParentContact[];
  medicalNotes?: string;
  address?: string;
  phone?: string;
  role?: string;
  department?: string;
  employeeNo?: string;
  email?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function InfoRow({
  label, value, icon,
}: {
  label: string; value?: string | null; icon?: React.ReactNode;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5 text-muted-foreground shrink-0">{icon}</span>}
      <span className="text-muted-foreground shrink-0 w-28">{label}:</span>
      <span className="font-medium break-words">{value}</span>
    </div>
  );
}

// ── Camera QR scanner ─────────────────────────────────────────────────────────

function CameraScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef    = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const supported =
    typeof window !== "undefined" && "BarcodeDetector" in window;

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError(
        "Your browser doesn't support the Camera QR scanner. " +
        "Use Chrome/Edge on Android, or type the ID manually."
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);

      // @ts-ignore — BarcodeDetector not in TS lib yet
      const detector = new BarcodeDetector({ formats: ["qr_code"] });

      const tick = async () => {
        if (!videoRef.current || !streamRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            const val = codes[0].rawValue?.trim().toUpperCase();
            if (val) {
              stop();
              onDetect(val);
              return;
            }
          }
        } catch { /* ignore per-frame errors */ }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (e: any) {
      const msg =
        e?.name === "NotAllowedError"
          ? "Camera permission denied. Allow camera access and try again."
          : e?.name === "NotFoundError"
          ? "No camera found on this device."
          : `Camera error: ${e?.message ?? "unknown"}`;
      setError(msg);
      stop();
    }
  }, [supported, onDetect, stop]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="space-y-3">
      {scanning ? (
        <div className="relative rounded-xl overflow-hidden border bg-black aspect-video max-h-64">
          <video
            ref={videoRef}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-40 h-40 border-2 border-white/70 rounded-xl relative">
              <span className="absolute -top-0.5 -left-0.5 w-4 h-4 border-t-2 border-l-2 border-primary rounded-tl" />
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 border-t-2 border-r-2 border-primary rounded-tr" />
              <span className="absolute -bottom-0.5 -left-0.5 w-4 h-4 border-b-2 border-l-2 border-primary rounded-bl" />
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 border-b-2 border-r-2 border-primary rounded-br" />
            </div>
          </div>
          <div className="absolute bottom-2 left-0 right-0 text-center text-white text-xs opacity-70">
            Point at the QR code on the ID card
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed aspect-video max-h-64 flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
          <div className="text-center space-y-2">
            <Camera className="w-8 h-8 mx-auto opacity-40" />
            <p>Camera not active</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        {scanning ? (
          <Button variant="outline" className="flex-1" onClick={stop}>
            <CameraOff className="w-4 h-4 mr-2" /> Stop Camera
          </Button>
        ) : (
          <Button className="flex-1" onClick={start}>
            <Camera className="w-4 h-4 mr-2" /> Scan QR with Camera
          </Button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function Page() {
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<VerifyResult | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<"manual" | "camera">("manual");

  async function lookup(uid: string) {
    const u = uid.trim().toUpperCase();
    if (!u) return;
    setLoading(true); setError(null); setResult(null);

    try {
      // ── Student lookup ────────────────────────────────────────────────
      // FIXED: removed non-existent joins (parent_links, blood_group,
      // year_of_admission, phone). Using actual schema columns.
      const { data: stu, error: stuErr } = await supabase
        .from("students")
        .select(`
          id,
          first_name,
          last_name,
          full_name,
          unique_id,
          admission_no,
          status,
          gender,
          date_of_birth,
          photo_url,
          medical_notes,
          address,
          parent_name,
          parent_phone,
          parent_email,
          classes:class_id(name, stream)
        `)
        .eq("unique_id", u)
        .maybeSingle();

      // Surface real errors to console so you can debug
      if (stuErr) console.error("[verify] student lookup error:", stuErr);

      if (stu) {
        const s = stu as any;

        // Build parent contact from denormalised columns on students table
        const parents: ParentContact[] = s.parent_name
          ? [{
              name: s.parent_name,
              phone: s.parent_phone ?? "",
              email: s.parent_email ?? "",
              relationship: "Guardian",
            }]
          : [];

        setResult({
          kind: "student",
          name: s.full_name ?? `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
          uniqueId: u,
          admissionNo: s.admission_no,
          photo: s.photo_url,
          gender: s.gender,
          dob: s.date_of_birth,
          className: s.classes?.name,
          stream: s.classes?.stream,
          active: s.status === "active",
          parents,
          medicalNotes: s.medical_notes,
          address: s.address,
        });
        return;
      }

      // ── Staff lookup ──────────────────────────────────────────────────
      const { data: stf, error: stfErr } = await supabase
        .from("staff")
        .select(`
          first_name,
          last_name,
          unique_id,
          employee_no,
          role,
          department,
          status,
          phone,
          email,
          photo_url,
          gender
        `)
        .eq("unique_id", u)
        .maybeSingle();

      if (stfErr) console.error("[verify] staff lookup error:", stfErr);

      if (stf) {
        const s = stf as any;
        setResult({
          kind: "staff",
          name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
          uniqueId: u,
          active: s.status === "active",
          photo: s.photo_url,
          gender: s.gender,
          role: s.role,
          department: s.department,
          employeeNo: s.employee_no,
          email: s.email,
          phone: s.phone,
        });
        return;
      }

      setError(`No record found for ID "${u}". Check the ID and try again.`);
    } catch (e: any) {
      console.error("[verify] unexpected error:", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); lookup(code); }
  }

  function handleCameraDetect(val: string) {
    setCode(val);
    lookup(val);
  }

  const initials = result
    ? result.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">

      {/* ── Input card ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ScanLine className="w-5 h-5" /> Verify Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Tab switcher */}
          <div className="flex rounded-lg border overflow-hidden text-sm">
            <button
              onClick={() => setTab("manual")}
              className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors
                ${tab === "manual" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
            >
              <Search className="w-3.5 h-3.5" /> Type / Scan
            </button>
            <button
              onClick={() => setTab("camera")}
              className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors
                ${tab === "camera" ? "bg-primary text-primary-foreground" : "hover:bg-muted/60"}`}
            >
              <Camera className="w-3.5 h-3.5" /> Use Camera
            </button>
          </div>

          {tab === "manual" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Type the Unique ID, or let a physical QR scanner fill this field automatically — it submits on Enter.
              </p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="e.g. STU-2026-000005"
                  className="font-mono"
                />
                <Button onClick={() => lookup(code)} disabled={loading || !code.trim()}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </div>
          ) : (
            <CameraScanner onDetect={handleCameraDetect} />
          )}

          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Error ── */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-5 flex items-center gap-3 text-destructive">
            <ShieldX className="w-6 h-6 shrink-0" />
            <span className="text-sm">{error}</span>
          </CardContent>
        </Card>
      )}

      {/* ── Result ── */}
      {result && (
        <Card className={result.active ? "border-green-500" : "border-amber-500"}>
          <CardContent className="pt-5 space-y-4">

            {/* Header */}
            <div className="flex items-center gap-4">
              <Avatar className="w-16 h-16 border-2 border-border">
                <AvatarImage src={result.photo ?? undefined} alt={result.name} />
                <AvatarFallback className="text-lg font-bold bg-muted">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck className={`w-5 h-5 shrink-0 ${result.active ? "text-green-600" : "text-amber-600"}`} />
                  <h2 className="text-xl font-bold">{result.name}</h2>
                  <Badge
                    className={`ml-auto ${result.active ? "bg-green-600 hover:bg-green-700" : ""}`}
                    variant={result.active ? "default" : "secondary"}
                  >
                    {result.kind.toUpperCase()} · {result.active ? "ACTIVE" : "INACTIVE"}
                  </Badge>
                </div>
                <p className="text-xs font-mono text-muted-foreground mt-1">{result.uniqueId}</p>
              </div>
            </div>

            <Separator />

            {/* Details */}
            <div className="space-y-2">
              {result.kind === "student" ? (
                <>
                  <InfoRow label="Admission No"   value={result.admissionNo}   icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow
                    label="Class / Stream"
                    value={result.className
                      ? `${result.className}${result.stream ? " — " + result.stream : ""}`
                      : null}
                    icon={<GraduationCap className="w-4 h-4" />}
                  />
                  <InfoRow label="Gender"         value={result.gender}         icon={<User className="w-4 h-4" />} />
                  <InfoRow
                    label="Date of Birth"
                    value={result.dob ? new Date(result.dob).toLocaleDateString() : null}
                    icon={<Calendar className="w-4 h-4" />}
                  />
                  <InfoRow label="Address"        value={result.address}        icon={<MapPin className="w-4 h-4" />} />
                </>
              ) : (
                <>
                  <InfoRow label="Employee No"    value={result.employeeNo}     icon={<User className="w-4 h-4" />} />
                  <InfoRow label="Role"           value={result.role}           icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Department"     value={result.department}     icon={<GraduationCap className="w-4 h-4" />} />
                  <InfoRow label="Gender"         value={result.gender}         icon={<User className="w-4 h-4" />} />
                  <InfoRow label="Phone"          value={result.phone}          icon={<Phone className="w-4 h-4" />} />
                  <InfoRow label="Email"          value={result.email}          icon={<Mail className="w-4 h-4" />} />
                </>
              )}
            </div>

            {/* Parents — students only */}
            {result.kind === "student" && (result.parents?.length ?? 0) > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Parent / Guardian Contacts</h3>
                  <div className="space-y-2">
                    {result.parents!.map((p, i) => (
                      <div key={i} className="rounded-lg bg-muted/40 p-3 space-y-1">
                        <div className="font-medium text-sm">
                          {p.name}
                          <span className="ml-2 text-xs text-muted-foreground capitalize">
                            ({p.relationship})
                          </span>
                        </div>
                        {p.phone && (
                          <a
                            href={`tel:${p.phone}`}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
                            <Phone className="w-3 h-3" /> {p.phone}
                          </a>
                        )}
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          >
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
