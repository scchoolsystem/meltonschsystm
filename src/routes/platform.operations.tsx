import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canAccess, NAV_REGISTRY } from "@/core/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Users, Building2, Zap, Loader2 } from "lucide-react";
import { PlatformScopeGuard } from "@/components/security/PlatformScopeGuard";

export const Route = createFileRoute("/platform/operations")({
  component: () => (
    <PlatformScopeGuard requirement={{ section: "operations" }}>
      <PlatformOperations />
    </PlatformScopeGuard>
  ),
});

// The "places" this page reports on. NAV_REGISTRY is the same curated,
// human-labeled module list that drives the in-app sidebar (src/core/rbac),
// so "Students" / "Finance" / "Library" here matches exactly what a user
// sees in their own nav — no separate list to keep in sync.
const PLACES = NAV_REGISTRY.filter((n) => n.module !== "portal");

type RoleRow = { school_id: string; school_name: string; user_id: string; roles: string[] };
type UsageRow = { school_id: string; school_name: string; module: string; distinct_users: number; total_hits: number; last_seen: string | null };

function PlatformOperations() {
  const [schoolFilter, setSchoolFilter] = useState<string>("all");
  const [windowDays, setWindowDays] = useState<string>("30");

  const { data: roleMatrix = [], isLoading: rolesLoading } = useQuery({
    queryKey: ["platform-role-matrix"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("platform_role_matrix");
      if (error) throw error;
      return (data ?? []) as RoleRow[];
    },
  });

  const { data: usage = [], isLoading: usageLoading } = useQuery({
    queryKey: ["platform-module-usage", windowDays],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("platform_module_usage_summary", { _days: Number(windowDays) });
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const loading = rolesLoading || usageLoading;

  // Schools list, derived from whichever source has rows (role matrix is
  // usually the more complete one — every member shows up there even if
  // they've never triggered a tracked visit).
  const schools = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of roleMatrix) map.set(r.school_id, r.school_name);
    for (const u of usage) if (!map.has(u.school_id)) map.set(u.school_id, u.school_name);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [roleMatrix, usage]);

  const scopedRoles = useMemo(
    () => (schoolFilter === "all" ? roleMatrix : roleMatrix.filter((r) => r.school_id === schoolFilter)),
    [roleMatrix, schoolFilter],
  );
  const scopedUsage = useMemo(
    () => (schoolFilter === "all" ? usage : usage.filter((u) => u.school_id === schoolFilter)),
    [usage, schoolFilter],
  );

  // Per-module rollup for the current scope (one school, or all schools
  // combined). Eligible = distinct users whose role set satisfies
  // MODULE_PERMISSIONS for this module (via canAccess — the same check the
  // app's own route guards use). Active/hits/last-active come straight from
  // tracked real visits.
  const moduleRows = useMemo(() => {
    return PLACES.map((place) => {
      const eligible = scopedRoles.filter((r) => canAccess(r.roles as any, place.module)).length;
      const usageForModule = scopedUsage.filter((u) => u.module === place.module);
      const activeUsers = usageForModule.reduce((s, u) => s + Number(u.distinct_users), 0);
      const hits = usageForModule.reduce((s, u) => s + Number(u.total_hits), 0);
      const lastSeen = usageForModule.reduce<string | null>((latest, u) => {
        if (!u.last_seen) return latest;
        return !latest || u.last_seen > latest ? u.last_seen : latest;
      }, null);
      const adoption = eligible > 0 ? Math.round((activeUsers / eligible) * 100) : null;
      return { ...place, eligible, activeUsers, hits, lastSeen, adoption };
    }).sort((a, b) => b.hits - a.hits || b.eligible - a.eligible);
  }, [scopedRoles, scopedUsage]);

  // Per-school rollup (only meaningful in "all schools" view).
  const schoolRows = useMemo(() => {
    return schools.map((s) => {
      const members = roleMatrix.filter((r) => r.school_id === s.id).length;
      const schoolUsage = usage.filter((u) => u.school_id === s.id);
      const activeUsers = new Set<string>(); // approximate distinct-across-modules via max per module (can't dedupe users across modules without raw rows)
      const activeUsersApprox = Math.max(0, ...schoolUsage.map((u) => Number(u.distinct_users)), 0);
      const totalHits = schoolUsage.reduce((sum, u) => sum + Number(u.total_hits), 0);
      const modulesTouched = new Set(schoolUsage.map((u) => u.module)).size;
      return { ...s, members, activeUsersApprox, totalHits, modulesTouched };
    }).sort((a, b) => b.members - a.members);
  }, [schools, roleMatrix, usage]);

  const totalMembers = roleMatrix.length;
  const totalActive30d = useMemo(
    () => schoolRows.reduce((s, r) => s + r.activeUsersApprox, 0),
    [schoolRows],
  );
  const busiestPlace = moduleRows[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Operations &amp; Usage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Who's eligible for each part of the system, and who's actually using it — per school.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-56"><SelectValue placeholder="All schools" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All schools</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={windowDays} onValueChange={setWindowDays}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-16 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Schools tracked</CardTitle>
                <Building2 className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{schools.length}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total members</CardTitle>
                <Users className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-2xl font-bold">{totalMembers.toLocaleString()}</div></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active users ({windowDays}d)</CardTitle>
                <Activity className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalActive30d.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground mt-1">sum of distinct users per school, may double-count multi-school users</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">Busiest place</CardTitle>
                <Zap className="w-4 h-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold truncate">{busiestPlace?.hits ? busiestPlace.label : "—"}</div>
                <p className="text-xs text-muted-foreground mt-1">{busiestPlace?.hits ? `${busiestPlace.hits.toLocaleString()} visits` : "no tracked activity yet"}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {schoolFilter === "all" ? "Every place, across all schools" : `Every place — ${schools.find((s) => s.id === schoolFilter)?.name ?? ""}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[32rem] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Place</TableHead>
                      <TableHead className="text-right">Eligible users</TableHead>
                      <TableHead className="text-right">Active users ({windowDays}d)</TableHead>
                      <TableHead className="text-right">Visits ({windowDays}d)</TableHead>
                      <TableHead className="text-right">Adoption</TableHead>
                      <TableHead>Last active</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {moduleRows.map((m) => (
                      <TableRow key={m.module}>
                        <TableCell className="font-medium">{m.label}</TableCell>
                        <TableCell className="text-right text-sm">{m.eligible.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm">{m.activeUsers.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm">{m.hits.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          {m.adoption === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <Badge variant={m.adoption === 0 ? "outline" : m.adoption < 30 ? "secondary" : "default"} className="text-[10px]">
                              {m.adoption}%
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.lastSeen ? new Date(m.lastSeen).toLocaleDateString() : "never"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {schoolFilter === "all" && (
            <Card>
              <CardHeader><CardTitle className="text-base">By school</CardTitle></CardHeader>
              <CardContent className="p-0">
                <div className="max-h-96 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>School</TableHead>
                        <TableHead className="text-right">Members</TableHead>
                        <TableHead className="text-right">Active users ({windowDays}d)</TableHead>
                        <TableHead className="text-right">Places used</TableHead>
                        <TableHead className="text-right">Total visits ({windowDays}d)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {schoolRows.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">No schools yet.</TableCell></TableRow>
                      )}
                      {schoolRows.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <button className="font-medium hover:underline text-left" onClick={() => setSchoolFilter(s.id)}>
                              {s.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-right text-sm">{s.members.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{s.activeUsersApprox.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-sm">{s.modulesTouched} / {PLACES.length}</TableCell>
                          <TableCell className="text-right text-sm">{s.totalHits.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            "Eligible" is role-based — who's allowed into a place today, computed live from role assignments.
            "Active" and "Visits" are real tracked navigation, collected from the day this feature shipped
            onward — history before that isn't available. See <Link to="/platform/schools" className="underline">Schools</Link> for
            individual school detail.
          </p>
        </>
      )}
    </div>
  );
}
