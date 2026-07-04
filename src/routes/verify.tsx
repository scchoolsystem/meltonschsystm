import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { publicVerifyId } from "@/lib/public-verify.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ShieldCheck,
  ShieldX,
  ScanLine,
  GraduationCap,
  Briefcase,
  Clock,
  BadgeCheck,
} from "lucide-react";

// Top-level route — sits OUTSIDE the `_app` layout, so it does NOT go
// through the `_app` beforeLoad auth check. This is the route the QR
// codes on ID cards point to, so it has to work for anyone's camera
// with no login. See src/lib/public-verify.functions.ts for the
// matching server function, which intentionally returns a reduced set
// of fields (no medical notes, no parent contacts, no address/phone)
// since this page is reachable by anyone on the internet with the link.
export const Route = createFileRoute("/verify")({
  component: Page,
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
});

interface SchoolInfo {
  name: string;
  logo: string | null;
  motto: string | null;
}

interface PublicResult {
  kind: "student" | "staff";
  name: string;
  uniqueId: string;
  photo?: string | null;
  active: boolean;
  admissionNo?: string;
  className?: string | null;
  stream?: string | null;
  employeeNo?: string;
  role?: string | null;
  department?: string | null;
  school?: SchoolInfo | null;
  verifiedAt?: string;
}

function Page() {
  const { code: codeFromUrl } = Route.useSearch();
  const verify = useServerFn(publicVerifyId);

  const [code, setCode] = useState(codeFromUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicResult | null>(null);

  async function lookup(raw: string) {
    const uid = raw.trim().toUpperCase();
    if (!uid) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await verify({ data: { code: uid } });
      setResult(data as PublicResult);
    } catch (e: any) {
      setError(e?.message ?? "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (codeFromUrl) lookup(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); lookup(code); }
  }

  const initials = result
    ? result.name.split(" ").filter(Boolean).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  const verifiedAtLabel = result?.verifiedAt
    ? new Date(result.verifiedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/50 to-background flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-4">
        {/* School branding header — only appears once we have a match */}
        {result?.school && (
          <div className="flex flex-col items-center text-center gap-2 pt-2 pb-1">
            {result.school.logo ? (
              <img
                src={result.school.logo}
                alt={result.school.name}
                className="w-14 h-14 rounded-full object-cover border shadow-sm bg-white"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center border">
                <GraduationCap className="w-7 h-7 text-primary" />
              </div>
            )}
            <div>
              <h1 className="font-bold text-lg leading-tight">{result.school.name}</h1>
              {result.school.motto && (
                <p className="text-xs text-muted-foreground italic">{result.school.motto}</p>
              )}
            </div>
          </div>
        )}

        <Card className="shadow-sm">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ScanLine className="w-4 h-4" /> Official ID Verification
            </div>
            <div className="flex gap-2">
              <Input
                autoFocus={!codeFromUrl}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={handleKey}
                placeholder="e.g. STU-2026-000001"
                className="font-mono"
              />
              <Button onClick={() => lookup(code)} disabled={loading || !code.trim()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify"}
              </Button>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Checking records…
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-5 flex items-center gap-3 text-destructive">
              <ShieldX className="w-6 h-6 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Not verified</p>
                <p className="text-sm">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card
            className={`overflow-hidden border-2 ${
              result.active ? "border-green-500" : "border-amber-500"
            }`}
          >
            {/* Status ribbon */}
            <div
              className={`px-4 py-2 flex items-center justify-between text-white text-sm font-semibold ${
                result.active ? "bg-green-600" : "bg-amber-600"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {result.active ? <ShieldCheck className="w-4 h-4" /> : <ShieldX className="w-4 h-4" />}
                {result.active ? "VERIFIED — ELIGIBLE" : "VERIFIED — INACTIVE"}
              </span>
              <span className="uppercase text-xs tracking-wide opacity-90">
                {result.kind === "student" ? "Student" : "Staff"}
              </span>
            </div>

            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="w-20 h-20 border-2 border-border shrink-0">
                  <AvatarImage src={result.photo ?? undefined} alt={result.name} />
                  <AvatarFallback className="text-lg font-bold bg-muted">{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold leading-tight">{result.name}</h2>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">{result.uniqueId}</p>
                  {result.kind === "student" && result.className && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {result.className}
                      {result.stream ? ` — ${result.stream}` : ""}
                    </p>
                  )}
                  {result.kind === "staff" && result.role && (
                    <p className="text-sm text-muted-foreground mt-1">{result.role}</p>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-2.5">
                {result.kind === "student" ? (
                  <InfoRow icon={<GraduationCap className="w-4 h-4" />} label="Admission No" value={result.admissionNo} />
                ) : (
                  <>
                    <InfoRow icon={<BadgeCheck className="w-4 h-4" />} label="Employee No" value={result.employeeNo} />
                    <InfoRow icon={<Briefcase className="w-4 h-4" />} label="Department" value={result.department} />
                  </>
                )}
              </div>

              {verifiedAtLabel && (
                <>
                  <Separator />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Verified {verifiedAtLabel}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground pt-2">
          Secured verification powered by SmartDev ERP
        </p>
      </div>
    </div>
  );
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
