import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_app/admin/leaving-certificate/$id")({ component: Page });

/**
 * Fetch whether a specific school feature is enabled.
 * The leaving_certs module is independent of timetable — but if the
 * school admin has disabled leaving_certs in Features, we block access.
 * This also fixes the original bug where toggling the *timetable* module
 * was incorrectly blocking the certificate print because both were checked
 * against the same feature key.
 */
async function fetchFeatureEnabled(featureKey: string): Promise<boolean> {
  const { data: schoolId } = await supabase.rpc("my_school_id");
  if (!schoolId) return false;
  const { data } = await (supabase as any)
    .from("school_features")
    .select("enabled, platform_enabled")
    .eq("school_id", schoolId)
    .eq("feature_key", featureKey)
    .maybeSingle();
  // If no row exists treat as enabled (feature not yet configured)
  if (!data) return true;
  return (data.enabled ?? true) && (data.platform_enabled ?? true);
}

function Page() {
  const { id } = Route.useParams();
  const { school } = useTenant();

  const { data: featureEnabled, isLoading: featureLoading } = useQuery({
    queryKey: ["feature-enabled", "leaving_certs"],
    queryFn: () => fetchFeatureEnabled("leaving_certs"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["lc", id],
    queryFn: async () =>
      (
        await supabase
          .from("leaving_certificates")
          .select(
            "*, students(first_name, last_name, admission_no, unique_id, date_of_birth, gender, admitted_on, photo_url, classes(name, level))"
          )
          .eq("id", id)
          .maybeSingle()
      ).data,
    enabled: featureEnabled !== false,
  });

  // Loading states
  if (featureLoading || isLoading) {
    return (
      <div className="h-screen grid place-items-center">
        <Loader2 className="animate-spin w-6 h-6 text-muted-foreground" />
      </div>
    );
  }

  // Feature disabled
  if (featureEnabled === false) {
    return (
      <div className="p-8 max-w-lg mx-auto mt-12">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertTriangle className="w-10 h-10 mx-auto text-amber-500 opacity-70" />
            <p className="font-semibold text-lg">Leaving Certificates are disabled</p>
            <p className="text-sm text-muted-foreground">
              This module has been turned off for your school. A super admin or principal can
              re-enable it under <strong>Admin → Features</strong>.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Certificate not found.
      </div>
    );
  }

  const s: any = data.students;

  return (
    <div className="min-h-screen bg-muted/30 py-8 print:bg-white print:py-0">
      <div className="max-w-3xl mx-auto px-4 print:px-0">

        {/* Toolbar — hidden when printing */}
        <div className="flex justify-between items-center mb-4 print:hidden">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Serial: {data.serial_no}</Badge>
            <Badge
              variant="outline"
              className={
                data.status === "issued"
                  ? "bg-green-500/10 text-green-700 border-green-500/30"
                  : "bg-amber-500/10 text-amber-700 border-amber-500/30"
              }
            >
              {data.status ?? "draft"}
            </Badge>
          </div>
          <Button onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />Print / Save PDF
          </Button>
        </div>

        {/* Certificate body */}
        <div className="certificate-print bg-card text-card-foreground border rounded-lg p-10 print:border-0 print:rounded-none">

          {/* School header */}
          <div className="text-center border-b pb-4 mb-6">
            {school?.logo_url && (
              <img
                src={school.logo_url}
                alt="School logo"
                className="h-16 mx-auto mb-2 object-contain print:h-14"
              />
            )}
            <h1 className="text-2xl font-bold">{school?.name ?? "School"}</h1>
            {school?.address && (
              <div className="text-xs text-muted-foreground">{school.address}</div>
            )}
            {school?.phone && (
              <div className="text-xs text-muted-foreground">Tel: {school.phone}</div>
            )}
            <div className="text-lg font-semibold mt-3 tracking-widest uppercase">
              Leaving Certificate
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Serial No: <span className="font-mono">{data.serial_no}</span>
            </div>
          </div>

          {/* Student photo */}
          {s.photo_url && (
            <div className="flex justify-end mb-4">
              <img src={s.photo_url} alt="Student photo" className="w-24 h-28 object-cover rounded border" />
            </div>
          )}

          {/* Certificate body text */}
          <p className="text-sm leading-relaxed mb-6">
            This is to certify that{" "}
            <span className="font-bold">
              {s.first_name} {s.last_name}
            </span>
            , admission number{" "}
            <span className="font-mono">{s.admission_no}</span>
            {s.gender ? `, ${s.gender === "M" ? "Male" : s.gender === "F" ? "Female" : s.gender}` : ""}
            {s.date_of_birth ? (
              <>
                {" "}born on{" "}
                <span className="font-semibold">
                  {new Date(s.date_of_birth).toLocaleDateString("en-KE", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </>
            ) : null}
            , was a bona fide student of this school
            {s.admitted_on ? (
              <>
                {" "}from{" "}
                <span className="font-semibold">
                  {new Date(s.admitted_on).toLocaleDateString("en-KE", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </>
            ) : null}{" "}
            until{" "}
            <span className="font-semibold">
              {data.leaving_date
                ? new Date(data.leaving_date).toLocaleDateString("en-KE", {
                    day: "numeric", month: "long", year: "numeric",
                  })
                : "—"}
            </span>
            . The student was in{" "}
            <span className="font-semibold">{s.classes?.name ?? "—"}</span> at the time of leaving.
          </p>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-4 text-sm border rounded p-4 bg-muted/30 print:bg-transparent">
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Reason for leaving</span>
              <div className="font-semibold capitalize">{data.reason ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs uppercase tracking-wide">Conduct</span>
              <div className="font-semibold capitalize">{data.conduct ?? "—"}</div>
            </div>
          </div>

          {/* Achievements */}
          {data.achievements && (
            <div className="mt-5 text-sm">
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">
                Achievements & Remarks
              </div>
              <div className="whitespace-pre-wrap border rounded p-3 print:border-0 print:p-0">
                {data.achievements}
              </div>
            </div>
          )}

          {/* Signature block */}
          <div className="grid grid-cols-2 gap-8 mt-16 text-sm">
            <div>
              <div className="border-t pt-2">
                {data.signed_by_name || "________________________"}
              </div>
              <div className="text-xs text-muted-foreground">{data.signed_by_title || "Principal"}</div>
            </div>
            <div>
              <div className="border-t pt-2">
                Date:{" "}
                {data.leaving_date
                  ? new Date(data.leaving_date).toLocaleDateString("en-KE", {
                      day: "numeric", month: "long", year: "numeric",
                    })
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                Issued:{" "}
                {data.issued_at
                  ? new Date(data.issued_at).toLocaleDateString("en-KE", {
                      day: "numeric", month: "long", year: "numeric",
                    })
                  : "—"}
              </div>
            </div>
          </div>

          {/* Stamp / school seal placeholder */}
          <div className="mt-8 flex justify-end print:mt-12">
            <div className="w-24 h-24 rounded-full border-2 border-dashed border-muted-foreground/30 grid place-items-center text-[9px] text-muted-foreground text-center leading-tight print:opacity-30">
              Official<br />Stamp
            </div>
          </div>
        </div>

        {/* Print styles */}
        <style>{`
          @media print {
            .certificate-print {
              page-break-inside: avoid;
              font-size: 11pt;
              line-height: 1.6;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
