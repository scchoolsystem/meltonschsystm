import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── helpers ───────────────────────────────────────────────────────────────
const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
const agoDate = (days: number) => ago(days).slice(0, 10);
const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const clamp100 = (n: number) => Math.min(100, Math.max(0, Math.round(n)));

// ─── main server fn ────────────────────────────────────────────────────────
export const computeSchoolBrain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!ok) throw new Error("Admin only");

    const { data: schoolId } = await context.supabase.rpc("my_school_id");
    if (!schoolId) throw new Error("No school context");

    // ── parallel data fetch ────────────────────────────────────────────────
    const [
      students, invoices, payments,
      attend, disc, examScores, examList,
      classes,
      overrides, policies, edits, alertsRow, pendingLinks, lifecycle,
      boardingRoll, dormAssignments, dormitories,
      clinicVisits, studentHealth,
      mealPlans, kitchenStock,
      bookLoans, books,
      transportRoutes, transportLog, transportAssign,
      gatePasses,
      staffRows,
    ] = await Promise.all([
      // core
      supabaseAdmin.from("students").select("id,lifecycle_status,class_id,gender,admission_date").eq("school_id", schoolId),
      supabaseAdmin.from("invoices").select("id,student_id,amount,paid,status,due_date,created_at").eq("school_id", schoolId),
      supabaseAdmin.from("payments").select("id,amount,created_at").eq("school_id", schoolId).gte("created_at", ago(90)),
      // attendance – last 30 days
      supabaseAdmin.from("attendance_records").select("student_id,status,date").eq("school_id", schoolId).gte("date", agoDate(30)),
      // discipline – last 60 days
      supabaseAdmin.from("discipline_records").select("student_id,severity,incident_date,category").eq("school_id", schoolId).gte("incident_date", agoDate(60)),
      // academics
      supabaseAdmin.from("exam_results").select("score,student_id,class_id,exam_id").eq("school_id", schoolId),
      supabaseAdmin.from("exams").select("id,name,date").eq("school_id", schoolId).order("date", { ascending: false }).limit(6),
      supabaseAdmin.from("classes").select("id,name").eq("school_id", schoolId),
      // governance
      supabaseAdmin.from("override_log").select("actor_id,resource,field,reason,created_at").eq("school_id", schoolId).gte("created_at", ago(7)).order("created_at", { ascending: false }),
      supabaseAdmin.from("field_policies").select("resource,field,classification,required_level").eq("school_id", schoolId),
      supabaseAdmin.from("field_edit_audit").select("actor_id,resource,field,override_used,created_at").eq("school_id", schoolId).gte("created_at", ago(30)),
      supabaseAdmin.from("smart_alerts").select("id,category,severity,title,body,resolved,created_at").eq("school_id", schoolId).eq("resolved", false).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("pending_parent_links").select("id,status").eq("school_id", schoolId).eq("status", "pending"),
      supabaseAdmin.from("lifecycle_events").select("target_type,to_status,created_at").eq("school_id", schoolId).gte("created_at", ago(30)),
      // boarding
      supabaseAdmin.from("boarding_roll_call").select("student_id,status,date").eq("school_id", schoolId).gte("date", agoDate(7)),
      supabaseAdmin.from("dorm_assignments").select("student_id,dormitory_id").eq("school_id", schoolId),
      supabaseAdmin.from("dormitories").select("id,name,capacity").eq("school_id", schoolId),
      // clinic
      supabaseAdmin.from("clinic_visits").select("id,student_id,visit_date,diagnosis,outcome").eq("school_id", schoolId).gte("visit_date", agoDate(30)),
      supabaseAdmin.from("student_health_records").select("student_id,condition,severity").eq("school_id", schoolId),
      // kitchen
      supabaseAdmin.from("meal_plans").select("student_id,plan_type").eq("school_id", schoolId),
      supabaseAdmin.from("kitchen_stock").select("id,item_name,quantity,reorder_level").eq("school_id", schoolId),
      // library
      supabaseAdmin.from("book_loans").select("id,student_id,due_date,returned_at,loan_date").eq("school_id", schoolId).gte("loan_date", agoDate(30)),
      supabaseAdmin.from("books").select("id,available_copies,total_copies").eq("school_id", schoolId),
      // transport
      supabaseAdmin.from("transport_routes").select("id,name,capacity").eq("school_id", schoolId),
      supabaseAdmin.from("transport_daily_log").select("route_id,date,students_count").eq("school_id", schoolId).gte("date", agoDate(7)),
      supabaseAdmin.from("transport_assignments").select("student_id,route_id").eq("school_id", schoolId),
      // security
      supabaseAdmin.from("gate_passes").select("id,student_id,status,created_at").eq("school_id", schoolId).gte("created_at", ago(7)),
      // staff
      supabaseAdmin.from("staff").select("id,employment_status").eq("school_id", schoolId),
    ]);

    // ═══════════════════════════════════════════════════════════════════════
    // STUDENTS
    // ═══════════════════════════════════════════════════════════════════════
    const allStudents = students.data ?? [];
    const activeStudents = allStudents.filter(s => s.lifecycle_status === "active");
    const genderMap = { male: 0, female: 0, other: 0 } as Record<string, number>;
    for (const s of activeStudents) {
      const g = (s.gender ?? "other").toLowerCase();
      genderMap[g in genderMap ? g : "other"] += 1;
    }
    // New this month
    const thisMonth = new Date(); thisMonth.setDate(1);
    const newThisMonth = allStudents.filter(s => s.admission_date && new Date(s.admission_date) >= thisMonth).length;

    // ═══════════════════════════════════════════════════════════════════════
    // ATTENDANCE
    // ═══════════════════════════════════════════════════════════════════════
    const attMap = new Map<string, { p: number; t: number }>();
    for (const a of attend.data ?? []) {
      const e = attMap.get(a.student_id) ?? { p: 0, t: 0 };
      e.t += 1;
      if (a.status === "present") e.p += 1;
      attMap.set(a.student_id, e);
    }
    const chronicAbsentees = Array.from(attMap.entries()).filter(([, v]) => v.t >= 5 && v.p / v.t < 0.6);
    const attRate = attMap.size > 0
      ? avg(Array.from(attMap.values()).map(v => v.p / v.t)) * 100
      : 100;

    // Daily trend (last 7 days) from raw records
    const dailyAtt = new Map<string, { p: number; t: number }>();
    for (const a of attend.data ?? []) {
      if (!a.date) continue;
      const e = dailyAtt.get(a.date) ?? { p: 0, t: 0 };
      e.t += 1;
      if (a.status === "present") e.p += 1;
      dailyAtt.set(a.date, e);
    }
    const attTrend = Array.from(dailyAtt.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-7)
      .map(([date, v]) => ({ date, pct: Math.round(v.t > 0 ? (v.p / v.t) * 100 : 0) }));

    // ═══════════════════════════════════════════════════════════════════════
    // DISCIPLINE
    // ═══════════════════════════════════════════════════════════════════════
    const discMap = new Map<string, number>();
    const discCatMap = new Map<string, number>();
    for (const d of disc.data ?? []) {
      discMap.set(d.student_id, (discMap.get(d.student_id) ?? 0) + (d.severity === "major" ? 3 : 1));
      const cat = d.category ?? "general";
      discCatMap.set(cat, (discCatMap.get(cat) ?? 0) + 1);
    }
    const discRisks = Array.from(discMap.entries()).filter(([, v]) => v >= 4);
    const topDiscCategories = Array.from(discCatMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, count]) => ({ cat, count }));

    // ═══════════════════════════════════════════════════════════════════════
    // FINANCE
    // ═══════════════════════════════════════════════════════════════════════
    const allInv = invoices.data ?? [];
    const totalInv = allInv.reduce((a, b) => a + Number(b.amount || 0), 0);
    const totalPaid = allInv.reduce((a, b) => a + Number(b.paid || 0), 0);
    const overdue = allInv.filter(i => i.status !== "paid" && i.due_date && new Date(i.due_date) < new Date());
    const fullyPaid = allInv.filter(i => i.status === "paid").length;
    const collectionRate = totalInv > 0 ? (totalPaid / totalInv) * 100 : 100;

    // Monthly payment trend (last 3 months)
    const paymentTrend = new Map<string, number>();
    for (const p of payments.data ?? []) {
      const m = p.created_at?.slice(0, 7); if (!m) continue;
      paymentTrend.set(m, (paymentTrend.get(m) ?? 0) + Number(p.amount ?? 0));
    }
    const financeTrend = Array.from(paymentTrend.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-3)
      .map(([month, collected]) => ({ month, collected: Math.round(collected) }));

    // Per-class fee collection
    const classMap = new Map<string, string>();
    for (const c of classes.data ?? []) classMap.set(c.id, c.name);

    const studentClassMap = new Map<string, string>();
    for (const s of activeStudents) if (s.class_id) studentClassMap.set(s.id, s.class_id);

    const classFeeMap = new Map<string, { invoiced: number; paid: number }>();
    for (const inv of allInv) {
      const classId = studentClassMap.get(inv.student_id);
      if (!classId) continue;
      const e = classFeeMap.get(classId) ?? { invoiced: 0, paid: 0 };
      e.invoiced += Number(inv.amount || 0);
      e.paid += Number(inv.paid || 0);
      classFeeMap.set(classId, e);
    }
    const feeByClass = Array.from(classFeeMap.entries())
      .map(([cid, v]) => ({
        class: classMap.get(cid) ?? cid.slice(0, 8),
        collection: v.invoiced > 0 ? Math.round((v.paid / v.invoiced) * 100) : 100,
      }))
      .sort((a, b) => a.collection - b.collection)
      .slice(0, 8);

    // ═══════════════════════════════════════════════════════════════════════
    // ACADEMICS
    // ═══════════════════════════════════════════════════════════════════════
    const examScoreData = examScores.data ?? [];
    const scores = examScoreData.map(r => Number(r.score || 0));
    const meanScore = avg(scores);
    const passRate = scores.length > 0 ? (scores.filter(s => s >= 50).length / scores.length) * 100 : 100;
    const academicHealth = scores.length === 0 ? 100
      : clamp100(meanScore * 0.6 + passRate * 0.4);

    // Per-class mean (latest exam)
    const latestExam = (examList.data ?? [])[0];
    const latestExamScores = latestExam
      ? examScoreData.filter(r => r.exam_id === latestExam.id)
      : [];
    const classMeanMap = new Map<string, number[]>();
    for (const r of latestExamScores) {
      const cid = r.class_id ?? studentClassMap.get(r.student_id) ?? "unknown";
      if (!classMeanMap.has(cid)) classMeanMap.set(cid, []);
      classMeanMap.get(cid)!.push(Number(r.score || 0));
    }
    const classMeans = Array.from(classMeanMap.entries())
      .map(([cid, sc]) => ({ class: classMap.get(cid) ?? cid.slice(0, 8), mean: Math.round(avg(sc)) }))
      .sort((a, b) => b.mean - a.mean)
      .slice(0, 8);

    // Exam trend (last 4 exams)
    const examTrend = (examList.data ?? []).slice(0, 4).reverse().map(ex => {
      const exScores = examScoreData.filter(r => r.exam_id === ex.id).map(r => Number(r.score || 0));
      return { exam: ex.name ?? "Exam", mean: exScores.length ? Math.round(avg(exScores)) : 0 };
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BOARDING
    // ═══════════════════════════════════════════════════════════════════════
    const boarders = (dormAssignments.data ?? []).length;
    const dormsData = dormitories.data ?? [];
    const totalCapacity = dormsData.reduce((a, d) => a + Number(d.capacity || 0), 0);
    const occupancyPct = totalCapacity > 0 ? Math.round((boarders / totalCapacity) * 100) : 0;

    // Boarding roll call compliance (last 7 days)
    const rollData = boardingRoll.data ?? [];
    const rollPresentCount = rollData.filter(r => r.status === "present").length;
    const rollCompliancePct = rollData.length > 0 ? Math.round((rollPresentCount / rollData.length) * 100) : 100;

    // ═══════════════════════════════════════════════════════════════════════
    // CLINIC
    // ═══════════════════════════════════════════════════════════════════════
    const clinicData = clinicVisits.data ?? [];
    const clinicVisitCount = clinicData.length;
    const clinicAdmitted = clinicData.filter(v => v.outcome === "admitted").length;
    const chronicConditions = (studentHealth.data ?? []).filter(r => r.severity === "chronic").length;

    // ═══════════════════════════════════════════════════════════════════════
    // KITCHEN
    // ═══════════════════════════════════════════════════════════════════════
    const mealCount = (mealPlans.data ?? []).length;
    const stockItems = kitchenStock.data ?? [];
    const lowStockItems = stockItems.filter(i => Number(i.quantity) <= Number(i.reorder_level ?? 0));

    // ═══════════════════════════════════════════════════════════════════════
    // LIBRARY
    // ═══════════════════════════════════════════════════════════════════════
    const loansData = bookLoans.data ?? [];
    const activeLoans = loansData.filter(l => !l.returned_at);
    const overdueBooks = activeLoans.filter(l => l.due_date && new Date(l.due_date) < new Date());
    const booksData = books.data ?? [];
    const totalBooks = booksData.reduce((a, b) => a + Number(b.total_copies || 0), 0);
    const availableBooks = booksData.reduce((a, b) => a + Number(b.available_copies || 0), 0);
    const libraryUtilisation = totalBooks > 0 ? Math.round(((totalBooks - availableBooks) / totalBooks) * 100) : 0;

    // ═══════════════════════════════════════════════════════════════════════
    // TRANSPORT
    // ═══════════════════════════════════════════════════════════════════════
    const routes = transportRoutes.data ?? [];
    const routeCapacity = routes.reduce((a, r) => a + Number(r.capacity || 0), 0);
    const assignedTransport = (transportAssign.data ?? []).length;
    const transportUtilisation = routeCapacity > 0 ? Math.round((assignedTransport / routeCapacity) * 100) : 0;

    // ═══════════════════════════════════════════════════════════════════════
    // SECURITY / GATE
    // ═══════════════════════════════════════════════════════════════════════
    const passes = gatePasses.data ?? [];
    const openPasses = passes.filter(p => p.status === "open" || p.status === "approved").length;

    // ═══════════════════════════════════════════════════════════════════════
    // STAFF
    // ═══════════════════════════════════════════════════════════════════════
    const staffData = staffRows.data ?? [];
    const activeStaff = staffData.filter(s => s.employment_status === "active").length;

    // ═══════════════════════════════════════════════════════════════════════
    // GOVERNANCE
    // ═══════════════════════════════════════════════════════════════════════
    const polRows = policies.data ?? [];
    const ovMap = new Map<string, number>();
    for (const o of overrides.data ?? []) ovMap.set(o.actor_id, (ovMap.get(o.actor_id) ?? 0) + 1);
    const overrideAbuse = Array.from(ovMap.entries()).filter(([, v]) => v >= 5);

    const governance = {
      totalPolicies: polRows.length,
      locked: polRows.filter(p => p.classification === "locked").length,
      restricted: polRows.filter(p => p.classification === "restricted").length,
      editable: polRows.filter(p => p.classification === "editable").length,
      overrides7d: (overrides.data ?? []).length,
      edits30d: (edits.data ?? []).length,
      pendingParentLinks: (pendingLinks.data ?? []).length,
      lifecycleChanges30d: (lifecycle.data ?? []).length,
    };

    const recentOverrides = (overrides.data ?? []).slice(0, 8).map(o => ({
      actor: String(o.actor_id ?? "").slice(0, 8),
      resource: o.resource, field: o.field, reason: o.reason, at: o.created_at,
    }));
    const topOverrideActors = Array.from(ovMap.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, n]) => ({ actor: id.slice(0, 8), count: n }));

    // ═══════════════════════════════════════════════════════════════════════
    // COMPOSITE HEALTH INDICES
    // ═══════════════════════════════════════════════════════════════════════
    const indices = {
      academicHealth: clamp100(academicHealth),
      financeStability: clamp100(collectionRate),
      attendanceStability: clamp100(attRate),
      disciplineRisk: clamp100(discRisks.length === 0 ? 100 : 100 - discRisks.length * 5),
      boardingWellness: clamp100(rollCompliancePct),
      clinicLoad: clamp100(100 - (clinicAdmitted / Math.max(activeStudents.length, 1)) * 1000),
      libraryEngagement: clamp100(libraryUtilisation > 80 ? 90 : 50 + libraryUtilisation * 0.5),
      transportHealth: clamp100(transportUtilisation <= 100 ? 100 - Math.abs(transportUtilisation - 80) : 50),
    };
    const schoolHealth = clamp100(
      (indices.academicHealth + indices.financeStability + indices.attendanceStability + indices.disciplineRisk) / 4
    );

    // ═══════════════════════════════════════════════════════════════════════
    // SMART ALERTS — expanded
    // ═══════════════════════════════════════════════════════════════════════
    const alerts: Array<{ category: string; severity: string; title: string; body: string }> = [
      ...chronicAbsentees.slice(0, 10).map(([id, v]) => ({
        category: "attendance", severity: "warn",
        title: "Chronic absenteeism",
        body: `Student ${id.slice(0, 8)} present ${Math.round((v.p / v.t) * 100)}% of last 30 days`,
      })),
      ...discRisks.slice(0, 8).map(([id, v]) => ({
        category: "discipline", severity: "high",
        title: "Discipline escalation",
        body: `Student ${id.slice(0, 8)} accumulated ${v} severity points in 60 days`,
      })),
      ...overrideAbuse.slice(0, 5).map(([id, v]) => ({
        category: "anomaly", severity: "high",
        title: "Frequent overrides",
        body: `Actor ${id.slice(0, 8)} performed ${v} overrides in last 7 days`,
      })),
      ...(overdue.length > 0 ? [{
        category: "finance", severity: "warn",
        title: `${overdue.length} overdue invoices`,
        body: `KES ${overdue.reduce((a, i) => a + Number(i.amount || 0) - Number(i.paid || 0), 0).toLocaleString()} outstanding. Send reminders or escalate.`,
      }] : []),
      ...(governance.pendingParentLinks > 0 ? [{
        category: "governance", severity: "info",
        title: `${governance.pendingParentLinks} pending parent links`,
        body: "Resolve in Admin → Parent Links",
      }] : []),
      ...(lowStockItems.length > 0 ? [{
        category: "kitchen", severity: "warn",
        title: `${lowStockItems.length} kitchen items below reorder level`,
        body: lowStockItems.slice(0, 3).map(i => i.item_name).join(", ") + (lowStockItems.length > 3 ? "…" : ""),
      }] : []),
      ...(overdueBooks.length > 0 ? [{
        category: "library", severity: "info",
        title: `${overdueBooks.length} overdue book loans`,
        body: "Send return reminders to students",
      }] : []),
      ...(chronicConditions > 0 ? [{
        category: "health", severity: "info",
        title: `${chronicConditions} students with chronic conditions on record`,
        body: "Ensure infirmary stock covers their needs",
      }] : []),
      ...(openPasses > 5 ? [{
        category: "security", severity: "warn",
        title: `${openPasses} open gate passes`,
        body: "Review unresolved exit authorisations",
      }] : []),
    ];

    // ═══════════════════════════════════════════════════════════════════════
    // RETURN PAYLOAD
    // ═══════════════════════════════════════════════════════════════════════
    return {
      // overview
      counts: {
        activeStudents: activeStudents.length,
        activeStaff,
        overdueInvoices: overdue.length,
        chronicAbsentees: chronicAbsentees.length,
        disciplineRisks: discRisks.length,
        overrideAlerts: overrideAbuse.length,
        newStudentsThisMonth: newThisMonth,
        mealPlanStudents: mealCount,
        boarders,
        openGatePasses: openPasses,
      },
      indices: { ...indices, schoolHealth },
      gender: genderMap,
      // finance
      finance: {
        totalInvoiced: Math.round(totalInv),
        totalPaid: Math.round(totalPaid),
        collectionRate: Math.round(collectionRate),
        overdueCount: overdue.length,
        fullyPaidInvoices: fullyPaid,
        trend: financeTrend,
        feeByClass,
      },
      // academics
      academics: {
        meanScore: Math.round(meanScore),
        passRate: Math.round(passRate),
        totalExamResults: scores.length,
        latestExam: latestExam?.name ?? null,
        classMeans,
        examTrend,
      },
      // attendance
      attendance: {
        rate: Math.round(attRate),
        chronicAbsenteeCount: chronicAbsentees.length,
        dailyTrend: attTrend,
        topAbsentees: chronicAbsentees.slice(0, 5).map(([id, v]) => ({
          id: id.slice(0, 8),
          pct: Math.round((v.p / v.t) * 100),
          days: v.t,
        })),
      },
      // discipline
      discipline: {
        riskCount: discRisks.length,
        totalIncidents: (disc.data ?? []).length,
        topCategories: topDiscCategories,
      },
      // boarding
      boarding: {
        boarders,
        capacity: totalCapacity,
        occupancyPct,
        rollCompliancePct,
        dormCount: dormsData.length,
      },
      // welfare
      welfare: {
        clinicVisits30d: clinicVisitCount,
        admitted: clinicAdmitted,
        chronicConditions,
        mealPlanStudents: mealCount,
        lowStockItems: lowStockItems.length,
        lowStockNames: lowStockItems.slice(0, 5).map(i => i.item_name ?? "?"),
        activeLoans: activeLoans.length,
        overdueBooks: overdueBooks.length,
        libraryUtilisation,
      },
      // transport
      transport: {
        routeCount: routes.length,
        assignedStudents: assignedTransport,
        capacity: routeCapacity,
        utilisationPct: transportUtilisation,
      },
      // security
      security: {
        openGatePasses: openPasses,
        totalPassesWeek: passes.length,
      },
      // governance
      governance,
      recentOverrides,
      topOverrideActors,
      persistedAlerts: alertsRow.data ?? [],
      alerts,
    };
  });
