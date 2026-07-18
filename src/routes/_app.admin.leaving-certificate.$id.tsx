import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/use-tenant";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Printer, AlertTriangle, ShieldCheck, Sparkles } from "lucide-react";
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

/** Fetch the co-curricular activities a student took part in, for the certificate. */
async function fetchStudentActivities(studentId: string | undefined): Promise<string[]> {
  if (!studentId) return [];
  const { data } = await supabase
    .from("student_co_curricular")
    .select("co_curricular_activities(name)")
    .eq("student_id", studentId);
  return (data ?? [])
    .map((r: any) => r.co_curricular_activities?.name)
    .filter(Boolean);
}

/** Lighten/darken helper so the certificate always has a coherent palette,
 *  even for schools that haven't set a primary_color yet. */
function withFallbackColor(hex: string | null | undefined): string {
  if (hex && /^#([0-9a-f]{3}){1,2}$/i.test(hex)) return hex;
  return "#1e3a8a"; // deep school-blue fallback
}

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const REASON_LABELS: Record<string, string> = {
  completion: "Successful Completion of Studies",
  transfer: "Transfer to Another Institution",
  withdrawal: "Voluntary Withdrawal",
  expulsion: "Administrative Discontinuation",
  other: "Other",
};

const CONDUCT_LABELS: Record<string, string> = {
  excellent: "Excellent",
  good: "Good",
  satisfactory: "Satisfactory",
  poor: "Poor",
};

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

  const { data: activities = [] } = useQuery({
    queryKey: ["lc-activities", data?.student_id],
    queryFn: () => fetchStudentActivities(data?.student_id),
    enabled: !!data?.student_id,
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
  const accent = withFallbackColor(school?.primary_color);
  const accentSoft = hexToRgba(accent, 0.08);
  const accentSofter = hexToRgba(accent, 0.04);
  const accentLine = hexToRgba(accent, 0.35);

  const fullName = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
  const genderLabel =
    s.gender === "M" ? "Male" : s.gender === "F" ? "Female" : s.gender ?? "—";

  const fmt = (d: string | null | undefined) =>
    d
      ? new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "long", year: "numeric" })
      : "—";

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
          <Button onClick={() => window.print()} style={{ backgroundColor: accent }}>
            <Printer className="w-4 h-4 mr-2" />Print / Save PDF
          </Button>
        </div>

        {/* Certificate body */}
        <div
          className="certificate-print relative overflow-hidden bg-card text-card-foreground rounded-2xl print:rounded-none shadow-xl print:shadow-none"
          style={{ border: `2px solid ${accentLine}` }}
        >
          {/* Decorative corner flourishes */}
          <div
            className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 rounded-full print:opacity-60"
            style={{ background: `radial-gradient(circle, ${accentSoft} 0%, transparent 70%)` }}
          />
          <div
            className="pointer-events-none absolute -bottom-20 -right-20 w-64 h-64 rounded-full print:opacity-60"
            style={{ background: `radial-gradient(circle, ${accentSoft} 0%, transparent 70%)` }}
          />

          {/* Watermark logo, centered behind the whole certificate */}
          {school?.logo_url && (
            <img
              src={school.logo_url}
              alt=""
              aria-hidden
              className="pointer-events-none select-none absolute top-1/2 left-1/2 w-72 h-72 object-contain opacity-[0.05] print:opacity-[0.07] -translate-x-1/2 -translate-y-1/2"
            />
          )}

          {/* Top color bar */}
          <div className="h-2.5 w-full print:h-2" style={{ backgroundColor: accent }} />

          <div className="relative px-8 pt-8 pb-10 print:px-10">

            {/* School header */}
            <div className="text-center pb-5 mb-6" style={{ borderBottom: `1px solid ${accentLine}` }}>
              {/* Crest: logo medallion with laurel flanks and a foil ring */}
              <div className="relative inline-block mx-auto mb-4 print:mb-3">
                {/* soft glow behind the crest */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-full print:hidden"
                  style={{ boxShadow: `0 0 0 10px ${accentSofter}, 0 0 30px 6px ${accentSoft}` }}
                />

                {/* laurel flanking the crest */}
                <svg
                  viewBox="0 0 220 140"
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[140px] print:w-[190px] print:h-[120px] pointer-events-none"
                  aria-hidden="true"
                >
                  {[-1, 1].map((side) => (
                    <g key={side} transform={side === 1 ? "translate(220,0) scale(-1,1)" : undefined}>
                      {Array.from({ length: 6 }).map((_, i) => {
                        const t = i / 5;
                        const x = 6 + t * 40;
                        const y = 70 - Math.sin(t * Math.PI) * 46;
                        return (
                          <ellipse
                            key={i}
                            cx={x}
                            cy={y}
                            rx="7"
                            ry="3.2"
                            fill={accent}
                            opacity={0.35 + t * 0.35}
                            transform={`rotate(${-40 + t * 70} ${x} ${y})`}
                          />
                        );
                      })}
                      <path
                        d="M6 70 Q28 30 60 14"
                        fill="none"
                        stroke={accent}
                        strokeWidth="1.5"
                        opacity="0.4"
                      />
                    </g>
                  ))}
                </svg>

                {/* the medallion itself */}
                <div
                  className="relative h-28 w-28 print:h-20 print:w-20 rounded-full grid place-items-center"
                  style={{
                    background: `linear-gradient(145deg, ${accent}, ${hexToRgba(accent, 0.65)})`,
                    padding: 3,
                    boxShadow: `0 6px 16px ${hexToRgba(accent, 0.35)}`,
                  }}
                >
                  <div
                    className="h-full w-full rounded-full grid place-items-center bg-white"
                    style={{ boxShadow: `inset 0 0 0 1.5px #D4AF37` }}
                  >
                    <div className="h-[82%] w-[82%] rounded-full grid place-items-center overflow-hidden bg-white">
                      {school?.logo_url ? (
                        <img
                          src={school.logo_url}
                          alt="School logo"
                          className="h-full w-full object-contain p-1"
                        />
                      ) : (
                        <ShieldCheck className="w-9 h-9" style={{ color: accent }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* certified badge, overlapping bottom-right of the medallion */}
                <div
                  className="absolute bottom-0 right-0 w-7 h-7 rounded-full grid place-items-center print:w-6 print:h-6"
                  style={{
                    backgroundColor: "#D4AF37",
                    border: "2px solid white",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                  }}
                >
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
              </div>

              <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: accent }}>
                {school?.name ?? "School"}
              </h1>
              {school?.motto && (
                <div className="text-xs italic text-muted-foreground mt-0.5">"{school.motto}"</div>
              )}
              <div className="text-xs text-muted-foreground mt-1 flex justify-center gap-3 flex-wrap">
                {school?.address && <span>{school.address}</span>}
                {school?.phone && <span>Tel: {school.phone}</span>}
                {school?.email && <span>{school.email}</span>}
              </div>

              <div className="flex items-center justify-center gap-2 mt-4">
                <span className="h-px w-10" style={{ backgroundColor: accentLine }} />
                <Sparkles className="w-4 h-4" style={{ color: accent }} />
                <div className="text-xl font-bold tracking-[0.2em] uppercase" style={{ color: accent }}>
                  Leaving Certificate
                </div>
                <Sparkles className="w-4 h-4" style={{ color: accent }} />
                <span className="h-px w-10" style={{ backgroundColor: accentLine }} />
              </div>
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Serial No: <span className="font-mono font-semibold">{data.serial_no}</span>
                {school?.academic_year && <> &nbsp;•&nbsp; Academic Year {school.academic_year}</>}
              </div>
            </div>

            {/* Student identity strip: photo + key facts */}
            <div
              className="flex gap-5 items-start rounded-xl p-4 mb-6 print:p-3"
              style={{ backgroundColor: accentSofter, border: `1px solid ${accentLine}` }}
            >
              <div className="shrink-0">
                {s.photo_url ? (
                  <img
                    src={s.photo_url}
                    alt="Student photo"
                    className="w-28 h-32 object-cover rounded-lg print:w-24 print:h-28"
                    style={{ border: `3px solid white`, boxShadow: `0 0 0 2px ${accent}` }}
                  />
                ) : (
                  <div
                    className="w-28 h-32 rounded-lg grid place-items-center text-3xl font-bold print:w-24 print:h-28"
                    style={{ backgroundColor: accentSoft, color: accent, border: `2px dashed ${accentLine}` }}
                  >
                    {s.first_name?.[0]}
                    {s.last_name?.[0]}
                  </div>
                )}
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div className="col-span-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Full Name</span>
                  <div className="font-bold text-base">{fullName}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Admission No.</span>
                  <div className="font-semibold font-mono">{s.admission_no ?? "—"}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Gender</span>
                  <div className="font-semibold">{genderLabel}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Date of Birth</span>
                  <div className="font-semibold">{fmt(s.date_of_birth)}</div>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Last Class</span>
                  <div className="font-semibold">{s.classes?.name ?? "—"}</div>
                </div>
              </div>
            </div>

            {/* Certificate body text */}
            <p className="text-[13.5px] leading-relaxed mb-6 text-justify">
              This is to certify that <span className="font-bold">{fullName}</span>, admission
              number <span className="font-mono">{s.admission_no}</span>
              {s.gender ? `, a ${genderLabel.toLowerCase()} student` : ""}
              {s.date_of_birth ? (
                <> born on <span className="font-semibold">{fmt(s.date_of_birth)}</span></>
              ) : null}
              , was a bona fide student of this school
              {s.admitted_on ? (
                <> from <span className="font-semibold">{fmt(s.admitted_on)}</span></>
              ) : null}{" "}
              until <span className="font-semibold">{fmt(data.leaving_date)}</span>. The student
              was in <span className="font-semibold">{s.classes?.name ?? "—"}</span> at the time of
              leaving, and is released from this institution on account of{" "}
              <span className="font-semibold">
                {(REASON_LABELS[data.reason] ?? data.reason ?? "—").toLowerCase()}
              </span>.
            </p>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm mb-6">
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: accentSofter, border: `1px solid ${accentLine}` }}
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Reason for Leaving
                </span>
                <div className="font-semibold">{REASON_LABELS[data.reason] ?? data.reason ?? "—"}</div>
              </div>
              <div
                className="rounded-lg p-3"
                style={{ backgroundColor: accentSofter, border: `1px solid ${accentLine}` }}
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Conduct</span>
                <div className="font-semibold">{CONDUCT_LABELS[data.conduct] ?? data.conduct ?? "—"}</div>
              </div>
            </div>

            {/* Co-curricular activities */}
            {activities.length > 0 && (
              <div className="mb-6">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">
                  Co-Curricular Activities & Clubs
                </div>
                <div className="flex flex-wrap gap-2">
                  {activities.map((name, i) => (
                    <span
                      key={i}
                      className="text-xs font-medium px-3 py-1.5 rounded-full"
                      style={{ backgroundColor: accentSoft, color: accent, border: `1px solid ${accentLine}` }}
                    >
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Achievements */}
            {data.achievements && (
              <div className="mb-6 text-sm">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                  Achievements & Remarks
                </div>
                <div
                  className="whitespace-pre-wrap rounded-lg p-3.5 leading-relaxed"
                  style={{ backgroundColor: accentSofter, border: `1px solid ${accentLine}` }}
                >
                  {data.achievements}
                </div>
              </div>
            )}

            {/* Signature block */}
            <div className="grid grid-cols-2 gap-8 mt-14 text-sm">
              <div>
                <div className="pt-2 font-semibold" style={{ borderTop: `1.5px solid ${accent}` }}>
                  {data.signed_by_name || "________________________"}
                </div>
                <div className="text-xs text-muted-foreground">{data.signed_by_title || "Principal"}</div>
              </div>
              <div>
                <div className="pt-2 font-semibold" style={{ borderTop: `1.5px solid ${accent}` }}>
                  Date: {fmt(data.leaving_date)}
                </div>
                <div className="text-xs text-muted-foreground">Issued: {fmt(data.issued_at)}</div>
              </div>
            </div>

            {/* Stamp / school seal + verification footer */}
            <div className="mt-10 flex items-end justify-between print:mt-12">
              <div className="text-[9px] text-muted-foreground leading-relaxed max-w-[55%]">
                This certificate is system-generated and bears a unique serial number for
                verification purposes. Alterations render it invalid.
              </div>
              <div
                className="w-24 h-24 rounded-full grid place-items-center text-[9px] text-center leading-tight shrink-0 print:opacity-70"
                style={{
                  border: `2px dashed ${accentLine}`,
                  color: accent,
                }}
              >
                <div>
                  <ShieldCheck className="w-6 h-6 mx-auto mb-1" />
                  Official<br />Seal
                </div>
              </div>
            </div>
          </div>

          {/* Bottom color bar */}
          <div className="h-2.5 w-full print:h-2" style={{ backgroundColor: accent }} />
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
