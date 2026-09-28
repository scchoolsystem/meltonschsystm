// ---------------------------------------------------------------------------
// Silent failure reporting (server side).
//
// Contract: reportSystemError() NEVER throws and NEVER blocks the caller for
// long. Failures are:
//   1. written to public.system_error_logs (deduped by fingerprint),
//   2. attributed to the platform owner(s) + the platform-support staff who
//      are allocated to that school (notified_user_ids, shown in the platform
//      console with a live badge),
//   3. pushed OUT-OF-BAND (webhook / email) so the owner still hears about it
//      when the database, Supabase or the whole app is down,
//   4. always console.error'd as a single structured `[SYSTEM_ERROR]` line so
//      it's also in Cloudflare Workers logs as a last-resort trail.
//
// Optional Cloudflare Worker secrets for step 3 (set any/all):
//   PLATFORM_ALERT_WEBHOOK_URL  Slack / Discord / Mattermost / Teams-compatible
//                               incoming-webhook URL (gets {text, content})
//   RESEND_API_KEY              + PLATFORM_ALERT_EMAIL (comma-separated) and
//   PLATFORM_ALERT_FROM         optional sender, e.g. "SmartDev Alerts <alerts@smartdev.co.ke>"
// ---------------------------------------------------------------------------
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Severity = "warning" | "error" | "critical";

export type ErrorReport = {
  source: string; // 'live_class' | 'jaas_token' | 'client' | 'server' | ...
  message: string;
  code?: string;
  severity?: Severity;
  stack?: string | null;
  context?: Record<string, unknown>;
  url?: string | null;
  userAgent?: string | null;
  userId?: string | null;
  schoolId?: string | null;
};

const MAX_MESSAGE = 1_000;
const MAX_STACK = 6_000;
const MAX_CONTEXT_JSON = 8_000;
const DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

const db = () => supabaseAdmin as any;

function clip(s: unknown, n: number): string {
  const str = typeof s === "string" ? s : s == null ? "" : String(s);
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

// Strip things that would make the same bug look like a thousand different
// ones (uuids, numbers, long tokens) and things that must never be stored
// (JWTs / bearer tokens).
function normaliseForFingerprint(msg: string): string {
  return msg
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b\d+\b/g, "<n>")
    .slice(0, 300);
}

function scrubSecrets(s: string): string {
  return s
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "<jwt>")
    .replace(/(bearer\s+)[\w.-]+/gi, "$1<redacted>")
    .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, "<private-key>");
}

async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeContext(ctx: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!ctx) return {};
  try {
    const json = scrubSecrets(JSON.stringify(ctx));
    if (json.length > MAX_CONTEXT_JSON) return { truncated: true, preview: json.slice(0, MAX_CONTEXT_JSON) };
    return JSON.parse(json);
  } catch {
    return { unserialisable: true };
  }
}

async function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | undefined> {
  return await Promise.race([
    Promise.resolve(p),
    new Promise<undefined>((res) => setTimeout(() => res(undefined), ms)),
  ]);
}

// ---- Who gets told ---------------------------------------------------------

type Recipient = { user_id: string; email: string | null; role: "owner" | "support" };

async function resolveRecipients(schoolId: string | null): Promise<Recipient[]> {
  const out = new Map<string, Recipient>();

  const { data: roleRows } = await db()
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["platform_owner", "platform_support"]);
  const rows: { user_id: string; role: string }[] = roleRows ?? [];
  const owners = rows.filter((r) => r.role === "platform_owner").map((r) => r.user_id);
  const support = [...new Set(rows.filter((r) => r.role === "platform_support").map((r) => r.user_id))];

  for (const id of owners) out.set(id, { user_id: id, email: null, role: "owner" });

  if (support.length) {
    let scopeRows: { user_id: string; scope_type: string; school_id: string | null }[] = [];
    try {
      const { data } = await db()
        .from("platform_access_scopes")
        .select("user_id, scope_type, school_id")
        .in("user_id", support);
      scopeRows = data ?? [];
    } catch {
      /* table missing => everyone is unrestricted */
    }

    const byUser = new Map<string, typeof scopeRows>();
    for (const s of scopeRows) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

    const allocated: string[] = [];
    const unrestricted: string[] = [];
    for (const uid of support) {
      const scopes = byUser.get(uid) ?? [];
      const schoolScopes = scopes.filter((s) => s.scope_type === "school");
      if (scopes.length === 0) unrestricted.push(uid);
      else if (schoolScopes.length === 0) unrestricted.push(uid); // section-only scope: not school-bound
      else if (schoolId && schoolScopes.some((s) => s.school_id === schoolId)) allocated.push(uid);
    }

    // Support allocated to THIS school get it. If nobody is allocated (or the
    // error has no school), fall back to unrestricted support so it never
    // lands in a void.
    for (const uid of allocated.length ? allocated : unrestricted) {
      if (!out.has(uid)) out.set(uid, { user_id: uid, email: null, role: "support" });
    }
  }

  // Emails (only needed for the out-of-band email alert)
  if (process.env.RESEND_API_KEY && process.env.PLATFORM_ALERT_EMAIL === undefined) {
    for (const r of out.values()) {
      try {
        const { data } = await db().auth.admin.getUserById(r.user_id);
        r.email = data?.user?.email ?? null;
      } catch {
        /* ignore */
      }
    }
  }
  return [...out.values()];
}

// ---- Out-of-band alert (works even if Supabase is completely down) --------

async function sendOutOfBandAlert(args: {
  headline: string;
  lines: string[];
  emails: string[];
}) {
  const text = `${args.headline}\n${args.lines.join("\n")}`;
  const tasks: Promise<unknown>[] = [];

  const hook = process.env.PLATFORM_ALERT_WEBHOOK_URL;
  if (hook) {
    tasks.push(
      fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, content: text }),
        signal: AbortSignal.timeout(4_000),
      }).catch((e) => console.error("[alert] webhook failed:", e?.message ?? e)),
    );
  }

  const resendKey = process.env.RESEND_API_KEY;
  const configured = (process.env.PLATFORM_ALERT_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const to = configured.length ? configured : args.emails;
  if (resendKey && to.length) {
    tasks.push(
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: process.env.PLATFORM_ALERT_FROM ?? "SmartDev Alerts <alerts@smartdev.co.ke>",
          to,
          subject: args.headline.slice(0, 150),
          text,
        }),
        signal: AbortSignal.timeout(4_000),
      }).catch((e) => console.error("[alert] email failed:", e?.message ?? e)),
    );
  }

  await withTimeout(Promise.allSettled(tasks), 5_000);
}

// ---- Public entry point ----------------------------------------------------

export async function reportSystemError(input: ErrorReport): Promise<{ logged: boolean; id?: string }> {
  const severity: Severity = input.severity ?? "error";
  const message = scrubSecrets(clip(input.message || "Unknown error", MAX_MESSAGE));
  const stack = input.stack ? scrubSecrets(clip(input.stack, MAX_STACK)) : null;
  const context = safeContext(input.context);
  const source = clip(input.source || "unknown", 60);
  const code = input.code ? clip(input.code, 80) : null;

  // Last-resort trail: always emitted, even if everything below fails.
  console.error(
    `[SYSTEM_ERROR] ${JSON.stringify({ source, code, severity, message, schoolId: input.schoolId ?? null, userId: input.userId ?? null, url: input.url ?? null })}`,
  );

  let rowId: string | undefined;
  let isNew = false;
  let schoolName: string | null = null;
  let recipients: Recipient[] = [];
  let dbOk = false;

  try {
    const fingerprint = await sha1(`${source}|${code ?? ""}|${normaliseForFingerprint(message)}`);
    const schoolId = input.schoolId ?? null;

    if (schoolId) {
      const { data: sch } = await db().from("schools").select("name").eq("id", schoolId).maybeSingle();
      schoolName = sch?.name ?? null;
    }

    let userRole: string | null = null;
    if (input.userId) {
      const { data: rr } = await db().from("user_roles").select("role").eq("user_id", input.userId).limit(1);
      userRole = rr?.[0]?.role ?? null;
    }

    // Dedupe: same bug, same school, still open, seen in last 24h => bump counter.
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
    let q = db()
      .from("system_error_logs")
      .select("id, occurrences")
      .eq("fingerprint", fingerprint)
      .in("status", ["open", "acknowledged"])
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(1);
    q = schoolId ? q.eq("school_id", schoolId) : q.is("school_id", null);
    const { data: existing } = await q;

    if (existing?.[0]) {
      rowId = existing[0].id;
      const occ = (existing[0].occurrences ?? 1) + 1;
      await db()
        .from("system_error_logs")
        .update({ occurrences: occ, last_seen_at: new Date().toISOString() })
        .eq("id", rowId);
      dbOk = true;
      // Re-alert out-of-band on a few milestones so a storm isn't silent,
      // without flooding the owner on every repeat.
      isNew = [10, 100, 1000].includes(occ);
      if (isNew) recipients = await resolveRecipients(schoolId);
    } else {
      recipients = await resolveRecipients(schoolId);
      const { data: inserted, error } = await db()
        .from("system_error_logs")
        .insert({
          fingerprint,
          school_id: schoolId,
          school_name: schoolName,
          user_id: input.userId ?? null,
          user_role: userRole,
          source,
          severity,
          code,
          message,
          stack,
          context,
          url: input.url ? clip(input.url, 500) : null,
          user_agent: input.userAgent ? clip(input.userAgent, 300) : null,
          notified_user_ids: recipients.map((r) => r.user_id),
        })
        .select("id")
        .single();
      if (error) throw error;
      rowId = inserted?.id;
      dbOk = true;
      isNew = true;
    }
  } catch (e: any) {
    console.error("[SYSTEM_ERROR] could not write to system_error_logs:", e?.message ?? e);
  }

  // Out-of-band alert. Fires for new problems, for milestone recurrences, and
  // ALWAYS when the DB write itself failed (that's the "everything is on
  // fire" case the owner most needs to hear about).
  if (isNew || !dbOk) {
    try {
      await sendOutOfBandAlert({
        headline: `${severity === "critical" ? "🚨" : "⚠️"} ${dbOk ? "" : "[LOG DB UNREACHABLE] "}${source}${code ? ` · ${code}` : ""}${schoolName ? ` · ${schoolName}` : ""}`,
        lines: [
          message,
          ...(input.schoolId ? [`School: ${schoolName ?? input.schoolId}`] : []),
          ...(input.userId ? [`User: ${input.userId}`] : []),
          ...(input.url ? [`Page: ${input.url}`] : []),
          ...(rowId ? [`Log id: ${rowId}`] : []),
          "Open: /platform/errors",
        ],
        emails: recipients.filter((r) => r.role === "owner" && r.email).map((r) => r.email!),
      });
    } catch (e: any) {
      console.error("[SYSTEM_ERROR] out-of-band alert failed:", e?.message ?? e);
    }
  }

  return { logged: dbOk, id: rowId };
}

/** Resolve the school a signed-in user belongs to (server-side, not client-claimed). */
export async function schoolIdForUser(userId: string): Promise<string | null> {
  try {
    const { data } = await db()
      .from("school_members")
      .select("school_id")
      .eq("user_id", userId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1);
    return data?.[0]?.school_id ?? null;
  } catch {
    return null;
  }
}
