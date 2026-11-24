// Send exam results to parents/students by SMS, email and the in-app bell.
//
// Rankings match the Class Ranking page: students are ranked within their own
// class by mean score (ties share a position). The caller drives sending in
// small batches (see RESULTS_BATCH_SIZE) so each Worker invocation stays well
// under Cloudflare's per-request subrequest limit.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { fallbackGrade, gradePoints, meanGrade } from "@/lib/grade-utils";
import { resolveSmsSender, toE164Kenya } from "@/lib/sms.functions";
import { hiddenElectiveSubjectIds, resolveStudentSubjects, type OptionData, type Enrolment } from "@/lib/subject-options";

export const RESULTS_BATCH_SIZE = 20;

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

const db = () => supabaseAdmin as any;

// ── permission: admins and exam/academic staff only ───────────────────────────
async function assertCanSendResults(context: { supabase: any; userId: string }) {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin) return;
  for (const role of ["principal", "deputy_principal", "academic_master", "exams_admin", "school_admin"]) {
    const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: role });
    if (data) return;
  }
  throw new Error("Only admin or exams staff can send results.");
}

async function getSchoolId(context: { supabase: any }): Promise<string> {
  const { data, error } = await context.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No school context for this user");
  return data as string;
}

async function fetchAll<T = any>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

type StudentRow = {
  id: string; first_name: string; last_name: string | null; admission_no: string | null;
  class_id: string | null; parent_phone: string | null; parent_email: string | null; parent_name: string | null;
};
type Card = {
  student: StudentRow;
  className: string;
  subjects: { name: string; code: string | null; score: number; grade: string; position: number | null }[];
  total: number;
  mean: number;
  grade: string;
  position: number;
  classSize: number;
  allVerified: boolean;
  /** chosen electives with no mark yet */
  missing: string[];
  /** option groups where the student still has to choose */
  pendingChoices: number;
};

function skipRanks<T>(items: T[], valueOf: (t: T) => number): Map<T, number> {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map<T, number>();
  let lastValue: number | null = null;
  let lastRank = 0;
  sorted.forEach((item, i) => {
    const v = valueOf(item);
    if (lastValue === null || v < lastValue) { lastRank = i + 1; lastValue = v; }
    ranks.set(item, lastRank);
  });
  return ranks;
}

// Elective setup for this school (empty if the option tables aren't there yet).
async function loadOptions(schoolId: string, year: number): Promise<{ od: OptionData; enrol: Enrolment[] }> {
  const empty = { od: { subjects: [], groups: [], groupClasses: [], groupSubjects: [] } as OptionData, enrol: [] as Enrolment[] };
  try {
    const [subj, g, gc, gs] = await Promise.all([
      db().from("subjects").select("id,name,code").eq("school_id", schoolId).eq("is_examinable", true),
      db().from("subject_option_groups").select("id,name,pathway,pick_count").eq("school_id", schoolId),
      db().from("subject_option_group_classes").select("group_id,class_id").eq("school_id", schoolId),
      db().from("subject_option_group_subjects").select("group_id,subject_id").eq("school_id", schoolId),
    ]);
    if (g.error || gc.error || gs.error || !(g.data ?? []).length) return empty;
    const enrol = await fetchAll<Enrolment>((from, to) =>
      db().from("student_subjects").select("student_id,subject_id,group_id")
        .eq("school_id", schoolId).eq("academic_year", year).order("id").range(from, to));
    return { od: { subjects: subj.data ?? [], groups: g.data ?? [], groupClasses: gc.data ?? [], groupSubjects: gs.data ?? [] }, enrol };
  } catch {
    return empty;
  }
}

const studentName = (s: StudentRow) => `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim() || "your child";

// ── Build every student's card for one exam (same maths as Class Ranking) ─────
async function buildCards(schoolId: string, examId: string, classId?: string) {
  const { data: exam } = await db()
    .from("exams").select("id, name, term, year, status")
    .eq("id", examId).eq("school_id", schoolId).maybeSingle();
  if (!exam) throw new Error("Exam not found");

  const { data: school } = await db().from("schools").select("name").eq("id", schoolId).maybeSingle();
  const schoolName: string = school?.name ?? "School";

  const students = await fetchAll<StudentRow>((from, to) => {
    let q = db().from("students")
      .select("id, first_name, last_name, admission_no, class_id, parent_phone, parent_email, parent_name")
      .eq("school_id", schoolId).eq("status", "active").not("class_id", "is", null)
      .order("id").range(from, to);
    if (classId) q = q.eq("class_id", classId);
    return q;
  });
  const byId = new Map(students.map((s) => [s.id, s]));

  const { data: classRows } = await db().from("classes").select("id, name, stream").eq("school_id", schoolId);
  const classLabel = new Map<string, string>(
    (classRows ?? []).map((c: any) => [c.id, `${c.name ?? ""}${c.stream ? " " + c.stream : ""}`.trim() || "Class"]),
  );

  const results = (await fetchAll<any>((from, to) =>
    db().from("exam_results")
      .select("student_id, subject_id, score, grade, verified, subjects(name, code)")
      .eq("exam_id", examId).order("student_id").order("subject_id").range(from, to),
  )).filter((r) => byId.has(r.student_id));

  const { od, enrol } = await loadOptions(schoolId, Number(exam.year) || new Date().getFullYear());
  const hiddenBy = new Map<string, Set<string>>();
  for (const st of students) if (st.class_id) hiddenBy.set(st.id, hiddenElectiveSubjectIds(st.id, st.class_id, od, enrol));

  // group results by class → student → subject
  type Cell = { score: number; grade: string; name: string; code: string | null; verified: boolean };
  const classes = new Map<string, Map<string, Map<string, Cell>>>();
  for (const r of results) {
    const st = byId.get(r.student_id)!;
    if (hiddenBy.get(st.id)?.has(r.subject_id)) continue; // elective this student does not take
    const cid = st.class_id as string;
    if (!classes.has(cid)) classes.set(cid, new Map());
    const cm = classes.get(cid)!;
    if (!cm.has(st.id)) cm.set(st.id, new Map());
    const score = Number(r.score);
    cm.get(st.id)!.set(r.subject_id, {
      score, grade: r.grade ?? fallbackGrade(score),
      name: r.subjects?.name ?? "Subject", code: r.subjects?.code ?? null,
      verified: r.verified !== false,
    });
  }

  const cards: Card[] = [];
  classes.forEach((studentMap, cid) => {
    // subject positions within the class
    const subjectIds = new Set<string>();
    studentMap.forEach((m) => m.forEach((_c, sid) => subjectIds.add(sid)));
    const subjPos = new Map<string, Map<string, number>>();
    subjectIds.forEach((sid) => {
      const entries: { studentId: string; score: number }[] = [];
      studentMap.forEach((m, studentId) => { const c = m.get(sid); if (c) entries.push({ studentId, score: c.score }); });
      const ranks = skipRanks(entries, (e) => e.score);
      const pm = new Map<string, number>();
      ranks.forEach((rank, e) => pm.set(e.studentId, rank));
      subjPos.set(sid, pm);
    });

    const prelim = Array.from(studentMap.entries()).map(([studentId, m]) => {
      let total = 0, points = 0, allVerified = true;
      const subjects: Card["subjects"] = [];
      m.forEach((c, sid) => {
        total += c.score; points += gradePoints(c.grade);
        if (!c.verified) allVerified = false;
        subjects.push({ name: c.name, code: c.code, score: c.score, grade: c.grade, position: subjPos.get(sid)?.get(studentId) ?? null });
      });
      subjects.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
      const n = subjects.length;
      const st = byId.get(studentId)!;
      const rs = resolveStudentSubjects(studentId, cid, od, enrol);
      const missing = rs.chosen.flatMap((c) => c.subjects).filter((x) => !m.has(x.id)).map((x) => x.name);
      return { studentId, subjects, total, mean: n ? total / n : 0, grade: n ? meanGrade(points / n) : "—", allVerified, missing, pendingChoices: rs.pending.length };
    });
    const ranks = skipRanks(prelim, (r) => r.mean); // same default basis as the Class Ranking page
    for (const r of prelim) {
      cards.push({
        student: byId.get(r.studentId)!, className: classLabel.get(cid) ?? "Class",
        subjects: r.subjects, total: r.total, mean: r.mean, grade: r.grade,
        position: ranks.get(r) ?? 0, classSize: prelim.length, allVerified: r.allVerified,
        missing: r.missing, pendingChoices: r.pendingChoices,
      });
    }
  });

  // Deterministic order so batches (offset/limit) are stable between calls.
  cards.sort((a, b) =>
    a.className.localeCompare(b.className) || a.position - b.position || a.student.id.localeCompare(b.student.id));
  return { exam, schoolName, cards };
}

// ── message builders ──────────────────────────────────────────────────────────
function smsFor(c: Card, schoolName: string, examName: string, withSubjects: boolean): string {
  let t = `${schoolName}: ${studentName(c.student)}, ${examName} - Mean ${fmt(c.mean)}%, Grade ${c.grade}, Pos ${c.position}/${c.classSize}.`;
  if (withSubjects) {
    for (const s of c.subjects) {
      const piece = ` ${(s.code || s.name).slice(0, 8)} ${fmt(s.score)}`;
      if (t.length + piece.length > 300) break;
      t += piece;
    }
    t += ".";
  }
  return (t + " Full report on parent portal.").slice(0, 320);
}

function emailFor(c: Card, schoolName: string, exam: any) {
  const name = studentName(c.student);
  const rows = c.subjects.map((s) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(s.name)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${esc(fmt(s.score))}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${esc(s.grade)}</td>` +
    `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${s.position ?? "—"}</td></tr>`).join("");
  const html = `
<div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#111">
  <div style="text-align:center;border-bottom:1px solid #ddd;padding-bottom:12px;margin-bottom:16px">
    <h2 style="margin:0">${esc(schoolName)}</h2>
    <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;margin-top:6px">Exam Results</div>
  </div>
  <p style="font-size:14px">Dear ${esc(c.student.parent_name || "Parent/Guardian")},<br/>
  Here are the results for <strong>${esc(name)}</strong>${c.student.admission_no ? ` (${esc(c.student.admission_no)})` : ""}, ${esc(c.className)}, in <strong>${esc(exam.name)}</strong> (${esc(exam.term)} ${esc(exam.year)}).</p>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    <tr style="background:#f3f4f6;text-align:left"><th style="padding:8px">Subject</th><th style="padding:8px;text-align:right">Score</th><th style="padding:8px">Grade</th><th style="padding:8px">Pos.</th></tr>
    ${rows}
  </table>
  <table style="width:100%;border-collapse:collapse;margin-top:12px;background:#f7f7f7;font-size:14px">
    <tr><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right"><strong>${esc(fmt(c.total))}</strong></td></tr>
    <tr><td style="padding:6px 8px">Mean score</td><td style="padding:6px 8px;text-align:right"><strong>${esc(fmt(c.mean))}%</strong></td></tr>
    <tr><td style="padding:6px 8px">Mean grade</td><td style="padding:6px 8px;text-align:right"><strong>${esc(c.grade)}</strong></td></tr>
    <tr><td style="padding:6px 8px">Class position</td><td style="padding:6px 8px;text-align:right"><strong>${c.position} of ${c.classSize}</strong></td></tr>
  </table>
  <p style="font-size:11px;color:#888;margin-top:20px">Automated message from ${esc(schoolName)}. Log in to the parent portal for the full report card.</p>
</div>`;
  const text =
    `${schoolName} - Exam Results\n${name} (${c.className}) - ${exam.name}\n` +
    c.subjects.map((s) => `${s.name}: ${fmt(s.score)} (${s.grade})`).join("\n") +
    `\nTotal ${fmt(c.total)} | Mean ${fmt(c.mean)}% | Grade ${c.grade} | Position ${c.position}/${c.classSize}`;
  return { html, text };
}

// ── preview ───────────────────────────────────────────────────────────────────
export const previewResultsSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ examId: z.string().uuid(), classId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanSendResults(context);
    const schoolId = await getSchoolId(context);
    const { exam, schoolName, cards } = await buildCards(schoolId, data.examId, data.classId);

    const sent = await fetchAll<any>((from, to) =>
      db().from("exam_results_sends").select("student_id, sms_status, email_status, bell_status")
        .eq("school_id", schoolId).eq("exam_id", data.examId).order("student_id").range(from, to));
    const done = new Set(sent.filter((s) => s.sms_status === "sent" || s.email_status === "queued" || s.bell_status === "sent").map((s) => s.student_id));

    const sample = cards[0];
    return {
      exam: { id: exam.id, name: exam.name, term: exam.term, year: exam.year, status: exam.status },
      sendable: ["completed", "published"].includes(String(exam.status)),
      total: cards.length,
      withPhone: cards.filter((c) => c.student.parent_phone && toE164Kenya(c.student.parent_phone)).length,
      withEmail: cards.filter((c) => c.student.parent_email?.trim()).length,
      unverified: cards.filter((c) => !c.allVerified).length,
      missingElectives: cards.filter((c) => c.missing.length > 0).length,
      pendingChoices: cards.filter((c) => c.pendingChoices > 0).length,
      alreadySent: cards.filter((c) => done.has(c.student.id)).length,
      batchSize: RESULTS_BATCH_SIZE,
      sampleSms: sample ? smsFor(sample, schoolName, exam.name, false) : null,
      sampleSmsWithSubjects: sample ? smsFor(sample, schoolName, exam.name, true) : null,
      sampleStudent: sample ? `${studentName(sample.student)} (${sample.className})` : null,
    };
  });

// ── send one batch ────────────────────────────────────────────────────────────
export const sendResultsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      examId: z.string().uuid(),
      classId: z.string().uuid().optional(),
      offset: z.number().int().min(0),
      sms: z.boolean(),
      email: z.boolean(),
      bell: z.boolean(),
      smsWithSubjects: z.boolean().default(false),
      includeUnverified: z.boolean().default(false),
      resend: z.boolean().default(false),
    }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanSendResults(context);
    const schoolId = await getSchoolId(context);
    const { exam, schoolName, cards } = await buildCards(schoolId, data.examId, data.classId);
    if (!["completed", "published"].includes(String(exam.status))) {
      throw new Error(`Exam is "${exam.status}". Mark it completed before sending results.`);
    }

    const slice = cards.slice(data.offset, data.offset + RESULTS_BATCH_SIZE);
    const nextOffset = data.offset + slice.length;
    const out = { total: cards.length, nextOffset, done: nextOffset >= cards.length, sms: 0, email: 0, bell: 0, skipped: 0, failures: [] as string[] };
    if (slice.length === 0) return out;

    // Respect the Communications module switch for SMS/email (the bell is in-app only).
    const { data: commsOn, error: featErr } = await db().rpc("school_feature_enabled", { p_school_id: schoolId, p_feature_key: "communications" });
    const commsEnabled = featErr ? true : commsOn !== false;

    const ids = slice.map((c) => c.student.id);
    const { data: prior } = await db().from("exam_results_sends")
      .select("student_id, sms_status, email_status, bell_status").eq("exam_id", data.examId).in("student_id", ids);
    const priorBy = new Map<string, any>((prior ?? []).map((p: any) => [p.student_id, p]));

    type Plan = { card: Card; sms: boolean; email: boolean; bell: boolean };
    const plans: Plan[] = [];
    for (const card of slice) {
      if (!card.allVerified && !data.includeUnverified) { out.skipped++; continue; }
      const p = priorBy.get(card.student.id);
      const ok = (v: string | undefined, good: string) => !data.resend && v === good;
      plans.push({
        card,
        sms: data.sms && commsEnabled && !ok(p?.sms_status, "sent"),
        email: data.email && commsEnabled && !ok(p?.email_status, "queued"),
        bell: data.bell && !ok(p?.bell_status, "sent"),
      });
    }

    const status = new Map<string, { sms?: string; email?: string; bell?: string; error?: string[] }>();
    const st = (id: string) => { if (!status.has(id)) status.set(id, { error: [] }); return status.get(id)!; };
    const fail = (c: Card, msg: string) => out.failures.push(`${studentName(c.student)}: ${msg}`);

    // ── SMS: one personalised message per child, a single provider call ─────
    const smsPlans = plans.filter((p) => p.sms);
    const smsItems = smsPlans
      .map((p) => ({ p, to: p.card.student.parent_phone ? toE164Kenya(String(p.card.student.parent_phone)) : null }));
    for (const { p, to } of smsItems) if (!to) { st(p.card.student.id).sms = "skipped"; }
    const sendable = smsItems.filter((x): x is { p: Plan; to: string } => !!x.to);
    if (sendable.length) {
      let smsError: string | null = null;
      let rejected = new Set<string>();
      const texts = sendable.map((x) => smsFor(x.p.card, schoolName, exam.name, data.smsWithSubjects));
      try {
        const sender = await resolveSmsSender(schoolId);
        if (!sender) throw new Error("SMS provider not configured");
        const res = await fetch("https://sms.crowdcomm.co.ke/sms/v3/sendmultiple", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: sender.apiKey, serviceId: sender.serviceId, from: sender.senderId,
            messages: sendable.map((x, i) => ({ mobile: x.to.replace(/^\+/, ""), message: texts[i], client_ref: i })),
          }),
        });
        const raw = await res.text().catch(() => "");
        let parsed: any = {};
        try { parsed = JSON.parse(raw); } catch { /* not JSON */ }
        if (res.ok && String(parsed?.status_code) === "1000") {
          const bad = (parsed?.schedule_details ?? []).filter((r: any) => String(r.schedule_status) !== "1");
          rejected = new Set(bad.map((r: any) => String(r.mobile)));
          if (bad.length) smsError = bad.map((r: any) => `${r.mobile}: ${r.schedule_desc}`).slice(0, 3).join("; ");
        } else {
          throw new Error(`HTTP ${res.status} code ${parsed?.status_code ?? "?"}: ${parsed?.status_desc ?? raw}`.slice(0, 300));
        }
      } catch (e: any) {
        smsError = (e?.message ?? "SMS failed").slice(0, 300);
        rejected = new Set(sendable.map((x) => x.to.replace(/^\+/, "")));
      }
      sendable.forEach((x) => {
        const bad = rejected.has(x.to.replace(/^\+/, ""));
        st(x.p.card.student.id).sms = bad ? "failed" : "sent";
        if (bad) fail(x.p.card, `SMS ${smsError ?? "rejected"}`); else out.sms++;
      });
      await db().from("notifications_log").insert({
        school_id: schoolId, channel: "sms", subject: `Results: ${exam.name}`, body: texts[0],
        recipient_count: sendable.length,
        status: rejected.size === 0 ? "sent" : rejected.size >= sendable.length ? "failed" : "partial", error: smsError,
      });
    }

    // ── Email: full per-subject table, same queue as receipts ───────────────
    const emailIds: string[] = [];
    let emailAttempts = 0;
    for (const p of plans.filter((x) => x.email)) {
      const to = String(p.card.student.parent_email ?? "").trim();
      if (!to) { st(p.card.student.id).email = "skipped"; continue; }
      emailAttempts++;
      const { html, text } = emailFor(p.card, schoolName, exam);
      const messageId = crypto.randomUUID();
      try {
        const { error } = await db().rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId, to, from: `${schoolName} <noreply@smartdev.co.ke>`,
            subject: `Exam results: ${studentName(p.card.student)} - ${exam.name}`,
            html, text, purpose: "results", label: "exam-results",
            idempotency_key: `results-${data.examId}-${p.card.student.id}-${to}${data.resend ? `-${Date.now()}` : ""}`,
            queued_at: new Date().toISOString(),
          },
        });
        if (error) throw error;
        st(p.card.student.id).email = "queued"; out.email++; emailIds.push(messageId);
      } catch (e: any) {
        st(p.card.student.id).email = "failed"; fail(p.card, `email ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }
    if (emailAttempts) {
      await db().from("notifications_log").insert({
        school_id: schoolId, channel: "email", subject: `Results: ${exam.name}`,
        body: `Exam results emailed to parents (${emailIds.length} queued)`,
        recipient_count: emailAttempts, status: emailIds.length === 0 ? "failed" : "queued",
        message_ids: emailIds.length ? emailIds : null,
      });
    }

    // ── Bell: linked parent + student logins, idempotent via dedupe_key ─────
    const bellPlans = plans.filter((p) => p.bell);
    if (bellPlans.length) {
      try {
        const bIds = bellPlans.map((p) => p.card.student.id);
        const [{ data: pl }, { data: sl }] = await Promise.all([
          db().from("parent_student_links").select("student_id, parent_user_id").in("student_id", bIds),
          db().from("student_user_links").select("student_id, user_id").in("student_id", bIds),
        ]);
        const rows: any[] = [];
        for (const p of bellPlans) {
          const c = p.card, sid = c.student.id;
          const body = `${exam.name}: Mean ${fmt(c.mean)}%, Grade ${c.grade}, Position ${c.position}/${c.classSize}.`;
          const title = `Results: ${studentName(c.student)}`;
          const targets = new Map<string, string>();
          for (const r of sl ?? []) if (r.student_id === sid && r.user_id) targets.set(r.user_id, "/portal/student?tab=results");
          for (const r of pl ?? []) if (r.student_id === sid && r.parent_user_id) targets.set(r.parent_user_id, "/portal/parent?tab=results");
          if (targets.size === 0) { st(sid).bell = "skipped"; continue; }
          targets.forEach((link, uid) => rows.push({
            user_id: uid, school_id: schoolId, title, body, kind: "results", link, dedupe_key: `results-${data.examId}-${sid}`,
          }));
          st(sid).bell = "sent"; out.bell++;
        }
        if (rows.length) {
          const { error } = await db().from("user_notifications").upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true });
          if (error) throw error;
        }
      } catch (e: any) {
        for (const p of bellPlans) if (st(p.card.student.id).bell === "sent" || !st(p.card.student.id).bell) st(p.card.student.id).bell = "failed";
        out.bell = 0;
        out.failures.push(`bell: ${String(e?.message ?? e).slice(0, 120)}`);
      }
    }

    // ── Persist per-student outcome (merge with earlier channel results) ────
    const upserts = plans.map((p) => {
      const id = p.card.student.id, s = st(id), old = priorBy.get(id);
      return {
        school_id: schoolId, exam_id: data.examId, student_id: id,
        sms_status: s.sms ?? old?.sms_status ?? null,
        email_status: s.email ?? old?.email_status ?? null,
        bell_status: s.bell ?? old?.bell_status ?? null,
        error: s.error?.length ? s.error.join("; ") : null,
        sent_by: context.userId, sent_at: new Date().toISOString(),
      };
    });
    if (upserts.length) {
      const { error } = await db().from("exam_results_sends").upsert(upserts, { onConflict: "exam_id,student_id" });
      if (error) out.failures.push(`log: ${error.message}`);
    }
    return out;
  });
