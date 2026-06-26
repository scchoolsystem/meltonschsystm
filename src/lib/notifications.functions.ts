import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Base URL for all email links. Used to build absolute URLs so links work in
// email clients (relative paths render as http:///path with no host).
const APP_BASE_URL = "https://app.smartdev.co.ke";

// Placeholder domain used for student auth accounts that have no real email.
// Addresses ending with this domain must never be emailed — Resend bounces them
// and repeated bounces damage the sender reputation of smartdev.co.ke.
const FAKE_EMAIL_DOMAIN = "@school.erp";

async function resolveSchoolId(ctx: { supabase: any }) {
  const { data: schoolId, error } = await ctx.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context for this user");
  return schoolId as string;
}

async function resolveSchoolName(schoolId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();
  return data?.name ?? "SmartDev ERP";
}

// Enqueue a single email through the transactional queue (same as school creation emails)
async function enqueueOne(
  to: string,
  subject: string,
  html: string,
  text: string,
  schoolId: string,
  schoolName: string,
  label: string
): Promise<boolean> {
  try {
    const messageId = crypto.randomUUID();
    const from = `${schoolName} <noreply@smartdev.co.ke>`;
    const { error } = await (supabaseAdmin as any).rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to,
        from,
        subject,
        html,
        text,
        purpose: "transactional",
        label,
        idempotency_key: `${label}-${schoolId}-${messageId}`,
        queued_at: new Date().toISOString(),
      },
    });
    return !error;
  } catch {
    return false;
  }
}

async function logNotification(
  schoolId: string,
  subject: string,
  body: string,
  count: number,
  status: string,
  error: string | null = null
) {
  await (supabaseAdmin as any).from("notifications_log").insert({
    school_id: schoolId,
    channel: "email",
    subject,
    body,
    recipient_count: count,
    status,
    error,
  });
}

function fmtKes(n: number) {
  return "KES " + Math.round(n).toLocaleString();
}

export const notifyFeeDue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const schoolId = await resolveSchoolId(context);
    const schoolName = await resolveSchoolName(schoolId);
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, amount, paid, due_date, students!inner(first_name, last_name, parent_email, school_id, status)")
      .eq("students.school_id", schoolId)
      .eq("students.status", "active")
      .gte("due_date", now.toISOString().slice(0, 10))
      .lte("due_date", in7.toISOString().slice(0, 10))
      .neq("status", "cancelled");

    let count = 0;
    for (const inv of (invoices ?? []) as any[]) {
      const s = inv.students;
      if (!s?.parent_email) continue;
      const bal = Number(inv.amount) - Number(inv.paid ?? 0);
      if (bal <= 0) continue;
      const subject = `Fee Reminder — ${s.first_name} ${s.last_name}`;
      const portalUrl = `${APP_BASE_URL}/portal/parent`;
      const html = `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${schoolName} — important notice for your child</div><p>Dear Parent/Guardian,</p>
        <p>This is a friendly reminder that an amount of <strong>${fmtKes(bal)}</strong> is due on <strong>${inv.due_date}</strong> for ${s.first_name} ${s.last_name}.</p>
        <p>Log in to your parent portal to view the invoice: <a href="${portalUrl}">View Invoice</a></p>
        <p>Thank you.</p>`;
      const text = `Dear Parent/Guardian,\n\nAn amount of ${fmtKes(bal)} is due on ${inv.due_date} for ${s.first_name} ${s.last_name}.\n\nView the invoice: ${portalUrl}\n\nThank you.`;
      const ok = await enqueueOne(s.parent_email, subject, html, text, schoolId, schoolName, "fee-reminder");
      if (ok) count++;
    }
    await logNotification(schoolId, "Fee Reminders", "Automated fee due notice", count, "queued");
    return { sent: count };
  });

export const notifyAttendanceAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const schoolId = await resolveSchoolId(context);
    const schoolName = await resolveSchoolName(schoolId);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    // Get student IDs for this school first
    const { data: schoolStudents } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("school_id", schoolId)
      .eq("status", "active");

    const schoolStudentIds = (schoolStudents ?? []).map((s: any) => s.id);
    if (schoolStudentIds.length === 0) {
      await logNotification(schoolId, "Attendance Alerts", "No students found", 0, "queued");
      return { sent: 0 };
    }

    const { data: records } = await supabaseAdmin
      .from("attendance_records")
      .select("student_id, status, date")
      .in("student_id", schoolStudentIds)
      .gte("date", fiveDaysAgo)
      .order("date", { ascending: false });

    const byStudent = new Map<string, string[]>();
    for (const r of (records ?? []) as any[]) {
      const arr = byStudent.get(r.student_id) ?? [];
      arr.push(r.status);
      byStudent.set(r.student_id, arr);
    }
    const flagged = Array.from(byStudent.entries())
      .filter(([, s]) => s.slice(0, 3).length === 3 && s.slice(0, 3).every((x) => x === "absent"))
      .map(([id]) => id);

    if (flagged.length === 0) {
      await logNotification(schoolId, "Attendance Alerts", "No students flagged", 0, "queued");
      return { sent: 0 };
    }

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_email")
      .in("id", flagged);

    let count = 0;
    for (const s of (students ?? []) as any[]) {
      if (!s.parent_email) continue;
      const subject = `Attendance Alert — ${s.first_name} ${s.last_name}`;
      const portalUrl = `${APP_BASE_URL}/portal/parent`;
      const html = `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${schoolName} — important notice for your child</div><p>Dear Parent/Guardian,</p>
        <p>${s.first_name} ${s.last_name} has been marked absent for 3 or more consecutive days.</p>
        <p>Please contact the school office or log in to your portal: <a href="${portalUrl}">Parent Portal</a></p>`;
      const text = `Dear Parent/Guardian,\n\n${s.first_name} ${s.last_name} has been marked absent for 3 or more consecutive days.\nPlease contact the school office or log in: ${portalUrl}`;
      const ok = await enqueueOne(s.parent_email, subject, html, text, schoolId, schoolName, "attendance-alert");
      if (ok) count++;
    }
    await logNotification(schoolId, "Attendance Alerts", "Consecutive absence notice", count, "queued");
    return { sent: count };
  });

export const notifyResultsPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ examId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchoolId(context);
    const schoolName = await resolveSchoolName(schoolId);

    const { data: exam } = await supabaseAdmin
      .from("exams")
      .select("id, name, school_id")
      .eq("id", data.examId)
      .eq("school_id", schoolId)
      .single();
    if (!exam) throw new Error("Exam not found");

    const { data: results } = await supabaseAdmin
      .from("exam_results")
      .select("student_id")
      .eq("exam_id", data.examId);

    const studentIds = Array.from(new Set((results ?? []).map((r: any) => r.student_id)));
    if (studentIds.length === 0) return { notified: 0 };

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_email")
      .in("id", studentIds);

    // Resolve real student account emails via the link table.
    // Skip any address ending with FAKE_EMAIL_DOMAIN — these are placeholder
    // auth accounts (e.g. stu-2026-000004@school.erp) with no real inbox.
    // Sending to them causes hard bounces which damage sender reputation.
    const { data: links } = await supabaseAdmin
      .from("student_user_links")
      .select("student_id, user_id")
      .in("student_id", studentIds);

    const studentEmailById = new Map<string, string>();
    for (const link of (links ?? []) as any[]) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
        const email = u?.user?.email;
        if (email && !email.endsWith(FAKE_EMAIL_DOMAIN)) {
          studentEmailById.set(link.student_id, email);
        }
      } catch { /* ignore */ }
    }

    let count = 0;
    const subject = `Results Published — ${exam.name}`;
    const studentPortalUrl = `${APP_BASE_URL}/portal/student`;
    const parentPortalUrl = `${APP_BASE_URL}/portal/parent`;
    const studentHtml = `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${schoolName} — exam results are now available</div>
      <p>The results for <strong>${exam.name}</strong> are now available.</p>
      <p>Log in to your student portal to view them: <a href="${studentPortalUrl}">View Results</a></p>`;
    const studentText = `The results for ${exam.name} are now available.\nLog in to view them: ${studentPortalUrl}`;
    const parentHtml = `<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0">${schoolName} — exam results are now available</div>
      <p>The results for <strong>${exam.name}</strong> are now available for your child.</p>
      <p>Log in to your parent portal to view them: <a href="${parentPortalUrl}">View Results</a></p>`;
    const parentText = `The results for ${exam.name} are now available.\nLog in to view them: ${parentPortalUrl}`;

    for (const s of (students ?? []) as any[]) {
      // Email the parent
      if (s.parent_email) {
        const ok = await enqueueOne(s.parent_email, subject, parentHtml, parentText, schoolId, schoolName, "results-published");
        if (ok) count++;
      }
      // Email the student's real account (skip fake @school.erp addresses)
      const semail = studentEmailById.get(s.id);
      if (semail) {
        const ok = await enqueueOne(semail, subject, studentHtml, studentText, schoolId, schoolName, "results-published");
        if (ok) count++;
      }
    }

    await supabaseAdmin.from("exams").update({ status: "published" }).eq("id", data.examId);
    await logNotification(schoolId, subject, "Results publication notice", count, "queued");
    return { notified: count };
  });
