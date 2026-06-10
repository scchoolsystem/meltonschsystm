import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { Resend } from "resend";

async function resolveSchoolId(ctx: { supabase: any }) {
  const { data: schoolId, error } = await ctx.supabase.rpc("my_school_id");
  if (error) throw new Error(error.message);
  if (!schoolId) throw new Error("No school context for this user");
  return schoolId as string;
}

function getResend() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY ?? (globalThis as any).__env__?.RESEND_API_KEY;
  if (!RESEND_API_KEY) return null;
  return new Resend(RESEND_API_KEY);
}

const getFrom = () => process.env.RESEND_FROM_EMAIL || (globalThis as any).__env__?.RESEND_FROM_EMAIL || "SmartDev <onboarding@resend.dev>";

async function sendOne(to: string, subject: string, html: string) {
  const r = getResend();
  if (!r) return false;
  try {
    await r.emails.send({ from: getFrom(), to, subject, html });
    return true;
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
    const now = new Date();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const { data: invoices } = await supabaseAdmin
      .from("invoices")
      .select("id, amount, paid, due_date, students!inner(first_name, last_name, parent_email, school_id, status)")
      .eq("school_id", schoolId)
      .gte("due_date", now.toISOString().slice(0, 10))
      .lte("due_date", in7.toISOString().slice(0, 10))
      .neq("status", "cancelled");

    let count = 0;
    for (const inv of (invoices ?? []) as any[]) {
      const s = inv.students;
      if (!s?.parent_email) continue;
      const bal = Number(inv.amount) - Number(inv.paid ?? 0);
      if (bal <= 0) continue;
      const ok = await sendOne(
        s.parent_email,
        `Fee Reminder — ${s.first_name} ${s.last_name}`,
        `<p>Dear Parent/Guardian,</p>
         <p>This is a friendly reminder that an amount of <strong>${fmtKes(bal)}</strong> is due on <strong>${inv.due_date}</strong> for ${s.first_name} ${s.last_name}.</p>
         <p>Thank you.</p>`
      );
      if (ok) count++;
    }
    await logNotification(schoolId, "Fee Reminders", "Automated fee due notice", count, "sent");
    return { sent: count };
  });

export const notifyAttendanceAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const schoolId = await resolveSchoolId(context);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: records } = await supabaseAdmin
      .from("attendance_records")
      .select("student_id, status, date")
      .eq("school_id", schoolId)
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
      await logNotification(schoolId, "Attendance Alerts", "No students flagged", 0, "sent");
      return { sent: 0 };
    }

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_email")
      .in("id", flagged);

    let count = 0;
    for (const s of (students ?? []) as any[]) {
      if (!s.parent_email) continue;
      const ok = await sendOne(
        s.parent_email,
        `Attendance Alert — ${s.first_name} ${s.last_name}`,
        `<p>Dear Parent/Guardian,</p>
         <p>${s.first_name} ${s.last_name} has been marked absent for 3 or more consecutive days.</p>
         <p>Please contact the school office.</p>`
      );
      if (ok) count++;
    }
    await logNotification(schoolId, "Attendance Alerts", "Consecutive absence notice", count, "sent");
    return { sent: count };
  });

export const notifyResultsPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ examId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const schoolId = await resolveSchoolId(context);
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
    if (studentIds.length === 0) {
      return { notified: 0 };
    }

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, first_name, last_name, parent_email")
      .in("id", studentIds);

    // Student account emails (via link table)
    const { data: links } = await supabaseAdmin
      .from("student_user_links")
      .select("student_id, user_id")
      .in("student_id", studentIds);

    const studentEmailById = new Map<string, string>();
    for (const link of (links ?? []) as any[]) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
        if (u?.user?.email) studentEmailById.set(link.student_id, u.user.email);
      } catch {
        /* ignore */
      }
    }

    let count = 0;
    const subject = `Results Published — ${exam.name}`;
    const html = `<p>The results for <strong>${exam.name}</strong> are now available.</p>
                  <p>Log in to your portal to view them: <a href="/portal/student">View Results</a></p>`;

    for (const s of (students ?? []) as any[]) {
      if (s.parent_email && (await sendOne(s.parent_email, subject, html))) count++;
      const semail = studentEmailById.get(s.id);
      if (semail && (await sendOne(semail, subject, html))) count++;
    }

    await supabaseAdmin.from("exams").update({ status: "published" }).eq("id", data.examId);
    await logNotification(schoolId, subject, "Results publication notice", count, "sent");
    return { notified: count };
  });
