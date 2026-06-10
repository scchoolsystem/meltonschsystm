import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const computeSchoolBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!ok) throw new Error("Admin only");

    const { data: schoolId } = await context.supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context for current user");

    const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const [students, invoices, attend, disc, overrides, policies, edits, alertsRow, pendingLinks, lifecycle, examScores] = await Promise.all([
      supabaseAdmin.from("students").select("id, lifecycle_status, class_id").eq("school_id", schoolId),
      supabaseAdmin.from("invoices").select("id, student_id, amount, paid, status, due_date").eq("school_id", schoolId),
      supabaseAdmin.from("attendance_records").select("student_id, status, date").eq("school_id", schoolId).gte("date", new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
      supabaseAdmin.from("discipline_records").select("student_id, severity, incident_date").eq("school_id", schoolId).gte("incident_date", new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10)),
      supabaseAdmin.from("override_log").select("actor_id, resource, field, reason, created_at").gte("created_at", since7).order("created_at", { ascending: false }),
      supabaseAdmin.from("field_policies").select("resource, field, classification, required_level"),
      supabaseAdmin.from("field_edit_audit").select("actor_id, resource, field, override_used, created_at").gte("created_at", since30),
      supabaseAdmin.from("smart_alerts").select("id, category, severity, title, body, resolved, created_at").eq("school_id", schoolId).eq("resolved", false).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("pending_parent_links").select("id, status").eq("status", "pending"),
      supabaseAdmin.from("lifecycle_events").select("target_type, to_status, created_at").gte("created_at", since30),
      supabaseAdmin.from("exam_results").select("score").eq("school_id", schoolId),
    ]);

    const activeStudents = (students.data ?? []).filter((s) => s.lifecycle_status === "active");
    const totalInv = (invoices.data ?? []).reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalPaid = (invoices.data ?? []).reduce((a, b) => a + Number(b.paid || 0), 0);
    const overdue = (invoices.data ?? []).filter((i) => i.status !== "paid" && i.due_date && new Date(i.due_date) < new Date());

    // Attendance per student
    const attMap = new Map<string, { p: number; t: number }>();
    for (const a of attend.data ?? []) {
      const e = attMap.get(a.student_id) ?? { p: 0, t: 0 };
      e.t += 1;
      if (a.status === "present") e.p += 1;
      attMap.set(a.student_id, e);
    }
    const absentees = Array.from(attMap.entries()).filter(([, v]) => v.t >= 5 && v.p / v.t < 0.6);

    // Discipline escalation
    const discMap = new Map<string, number>();
    for (const d of disc.data ?? []) discMap.set(d.student_id, (discMap.get(d.student_id) ?? 0) + (d.severity === "major" ? 3 : 1));
    const discRisks = Array.from(discMap.entries()).filter(([, v]) => v >= 4);

    // Anomaly: repeated overrides by same actor
    const ovMap = new Map<string, number>();
    for (const o of overrides.data ?? []) ovMap.set(o.actor_id, (ovMap.get(o.actor_id) ?? 0) + 1);
    const overrideAbuse = Array.from(ovMap.entries()).filter(([, v]) => v >= 5);

    const indices = {
      academicHealth: (() => {
        const scores = (examScores.data ?? []).map((r: any) => Number(r.score || 0));
        if (scores.length === 0) return 100;
        const avg = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
        // Scale: avg 0=0, avg 50=50, avg 100=100 — pass rate boosts score
        const passRate = scores.filter((s: number) => s >= 50).length / scores.length;
        return Math.round((avg * 0.6) + (passRate * 100 * 0.4));
      })()
      financeStability: totalInv > 0 ? Math.round((totalPaid / totalInv) * 100) : 100,
      attendanceStability: attMap.size > 0
        ? Math.round((Array.from(attMap.values()).reduce((a, v) => a + (v.p / v.t), 0) / attMap.size) * 100)
        : 100,
      disciplineRisk: discRisks.length === 0 ? 100 : Math.max(0, 100 - discRisks.length * 5),
    };
    const schoolHealth = Math.round((indices.academicHealth + indices.financeStability + indices.attendanceStability + indices.disciplineRisk) / 4);

    // Governance metrics
    const polRows = policies.data ?? [];
    const governance = {
      totalPolicies: polRows.length,
      locked: polRows.filter((p) => p.classification === "locked").length,
      restricted: polRows.filter((p) => p.classification === "restricted").length,
      editable: polRows.filter((p) => p.classification === "editable").length,
      overrides7d: (overrides.data ?? []).length,
      edits30d: (edits.data ?? []).length,
      pendingParentLinks: (pendingLinks.data ?? []).length,
      lifecycleChanges30d: (lifecycle.data ?? []).length,
    };
    const recentOverrides = (overrides.data ?? []).slice(0, 8).map((o) => ({
      actor: String(o.actor_id ?? "").slice(0, 8),
      resource: o.resource, field: o.field, reason: o.reason,
      at: o.created_at,
    }));
    const topOverrideActors = Array.from(ovMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ actor: id.slice(0, 8), count: n }));

    return {
      counts: {
        activeStudents: activeStudents.length,
        overdueInvoices: overdue.length,
        chronicAbsentees: absentees.length,
        disciplineRisks: discRisks.length,
        overrideAlerts: overrideAbuse.length,
      },
      indices: { ...indices, schoolHealth },
      governance,
      recentOverrides,
      topOverrideActors,
      persistedAlerts: alertsRow.data ?? [],
      alerts: [
        ...absentees.slice(0, 10).map(([id, v]) => ({
          category: "attendance", severity: "warn",
          title: "Chronic absenteeism", body: `Student ${id.slice(0, 8)} present ${Math.round((v.p / v.t) * 100)}% of last 30 days`,
        })),
        ...discRisks.slice(0, 10).map(([id, v]) => ({
          category: "discipline", severity: "high",
          title: "Discipline escalation", body: `Student ${id.slice(0, 8)} accumulated ${v} severity points in 60 days`,
        })),
        ...overrideAbuse.slice(0, 5).map(([id, v]) => ({
          category: "anomaly", severity: "high",
          title: "Frequent overrides", body: `Actor ${id.slice(0, 8)} performed ${v} overrides in last 7 days`,
        })),
        ...(overdue.length > 0 ? [{
          category: "finance", severity: "warn",
          title: `${overdue.length} overdue invoices`, body: "Send reminders or escalate to bursar",
        }] : []),
        ...(governance.pendingParentLinks > 0 ? [{
          category: "governance", severity: "info",
          title: `${governance.pendingParentLinks} pending parent links`, body: "Resolve in Admin → Parent Links",
        }] : []),
      ],
    };
  });
