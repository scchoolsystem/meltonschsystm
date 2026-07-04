import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { publicVerifyId } from "@/lib/public-verify.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldX, ScanLine, User, GraduationCap } from "lucide-react";

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
    ? result.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <div className="min-h-screen bg-muted/30 flex items-start justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="w-5 h-5" /> ID Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                autoFocus
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
                <Loader2 className="w-4 h-4 animate-spin" /> Looking up…
              </div>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-5 flex items-center gap-3 text-destructive">
              <ShieldX className="w-6 h-6 shrink-0" />
              <span className="text-sm">{error}</span>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className={result.active ? "border-green-500" : "border-amber-500"}>
            <CardContent className="pt-5 space-y-4">
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
                      {result.kind.toUpperCase()} · {result.active ? "ELIGIBLE" : "INACTIVE"}
                    </Badge>
                  </div>
                  <p className="text-xs font-mono text-muted-foreground mt-1">{result.uniqueId}</p>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                {result.kind === "student" ? (
                  <>
                    <InfoRow label="Admission No" value={result.admissionNo} icon={<GraduationCap className="w-4 h-4" />} />
                    <InfoRow
                      label="Class / Stream"
                      value={result.className ? `${result.className}${result.stream ? " — " + result.stream : ""}` : null}
                      icon={<GraduationCap className="w-4 h-4" />}
                    />
                  </>
                ) : (
                  <>
                    <InfoRow label="Employee No" value={result.employeeNo} icon={<User className="w-4 h-4" />} />
                    <InfoRow label="Role" value={result.role} icon={<GraduationCap className="w-4 h-4" />} />
                    <InfoRow label="Department" value={result.department} icon={<GraduationCap className="w-4 h-4" />} />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}
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
