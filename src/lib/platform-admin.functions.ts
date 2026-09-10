import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function generatePassword(len = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*?";
  const all = upper + lower + digits + symbols;
  const buf = new Uint32Array(1);
  const randInt = (maxExclusive: number) => {
    const limit = Math.floor(0xffffffff / maxExclusive) * maxExclusive;
    let n: number;
    do { crypto.getRandomValues(buf); n = buf[0]; } while (n >= limit);
    return n % maxExclusive;
  };
  const pick = (s: string) => s[randInt(s.length)];
  const out = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (out.length < len) out.push(pick(all));
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

const PLATFORM_ROLES = ["platform_owner", "platform_support"] as const;
type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Every function here is service-role (bypasses RLS) on purpose: the
 * "admins manage roles" policy on user_roles intentionally does NOT include
 * platform_owner/platform_support (see 20260614120000_fix_is_admin_...),
 * so granting/revoking platform roles has no client-side RLS path at all.
 * This file is that path, with its own authorization checks instead.
 */

async function requireCaller(
  supabase: any,
  userId: string,
  opts: { ownerOnly?: boolean } = {},
) {
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (roleRows ?? []).map((r: any) => r.role);
  const isSupport = roles.includes("platform_support");
  const isOwner = roles.includes("platform_owner");
  if (opts.ownerOnly && !isOwner) {
    throw new Error("Only platform owners can do this");
  }
  if (!isOwner && !isSupport) {
    throw new Error("Platform access required");
  }
  return { isOwner, isSupport };
}

async function logAudit(entry: {
  actor_user_id: string;
  actor_email: string | null;
  action: string;
  target_type?: string;
  target_id?: string;
  school_id?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await (supabaseAdmin as any).from("audit_logs").insert({
    actor_user_id: entry.actor_user_id,
    actor_email: entry.actor_email,
    action: entry.action,
    target_type: entry.target_type ?? null,
    target_id: entry.target_id ?? null,
    school_id: entry.school_id ?? null,
    details: entry.details ?? {},
  });
  // Never let a logging failure block the actual action — just surface it
  // server-side so it doesn't vanish silently.
  if (error) console.error("[audit_logs] insert failed:", error);
}

// ---------------------------------------------------------------------------

export const platformListTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireCaller(context.supabase, context.userId);

    const { data: roleRows, error } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role, created_at")
      .in("role", PLATFORM_ROLES as unknown as string[])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = roleRows ?? [];
    const members = await Promise.all(
      rows.map(async (r: any) => {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", r.user_id)
          .maybeSingle();
        // Scopes only apply to platform_support rows, but harmless (and
        // simplest) to just look them up for every row here.
        const { data: scopeRows } = await supabaseAdmin
          .from("platform_access_scopes")
          .select("scope_type, section, school_id")
          .eq("user_id", r.user_id);
        return {
          user_id: r.user_id,
          role: r.role as PlatformRole,
          granted_at: r.created_at,
          email: authUser?.user?.email ?? "(unknown)",
          full_name: profile?.full_name ?? "",
          scopes: scopeRows ?? [],
        };
      }),
    );
    return { members };
  });

export const platformSearchUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    // supabase-js admin API has no direct getUserByEmail, so we page through
    // listUsers and match case-insensitively. Fine at this platform's scale;
    // if the user base grows into the tens of thousands this should move to
    // a SECURITY DEFINER SQL function querying auth.users directly instead.
    const target = data.email.trim().toLowerCase();
    let page = 1;
    const perPage = 1000;
    for (let i = 0; i < 20; i++) {
      const { data: page_, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const found = page_.users.find((u) => (u.email ?? "").toLowerCase() === target);
      if (found) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", found.id)
          .maybeSingle();
        return { user_id: found.id, email: found.email, full_name: profile?.full_name ?? "" };
      }
      if (page_.users.length < perPage) break;
      page++;
    }
    return null;
  });

export const platformGrantRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(PLATFORM_ROLES),
      // Optional. Leave out (or send both arrays empty) for full access —
      // today's behaviour. Only meaningful for role === "platform_support";
      // ignored for platform_owner (an owner is never restricted).
      scopes: z
        .object({
          sections: z.array(z.string()).default([]),
          school_ids: z.array(z.string().uuid()).default([]),
        })
        .optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Granting platform access is owner-only — support staff can view the
    // team but shouldn't be able to add more people, including themselves.
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    // NOTE: we avoid .upsert(..., { onConflict: "user_id,role" }) here.
    // user_roles' unique constraint is (user_id, role, school_id) — there is
    // no constraint on just (user_id, role) — so that onConflict target
    // doesn't match anything and Postgres rejects it with "there is no
    // unique or exclusion constraint matching the ON CONFLICT specification".
    // Platform-level grants always have school_id = NULL, so we check for an
    // existing row explicitly instead of relying on ON CONFLICT.
    const { data: existingGrant, error: existErr } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("id")
      .eq("user_id", data.user_id)
      .eq("role", data.role)
      .is("school_id", null)
      .maybeSingle();
    if (existErr) throw new Error(existErr.message);

    if (!existingGrant) {
      const { error: insErr } = await (supabaseAdmin as any)
        .from("user_roles")
        .insert({ user_id: data.user_id, role: data.role, school_id: null });
      if (insErr) throw new Error(insErr.message);
    }

    // Re-sync scopes (delete then insert) so re-granting with a different
    // scope set replaces the old one instead of stacking. Only applies to
    // platform_support — an owner grant never touches scopes.
    if (data.role === "platform_support") {
      const { error: delErr } = await supabaseAdmin
        .from("platform_access_scopes")
        .delete()
        .eq("user_id", data.user_id);
      if (delErr) throw new Error(delErr.message);

      const rows = [
        ...(data.scopes?.sections ?? []).map((section) => ({
          user_id: data.user_id, scope_type: "section", section, created_by: context.userId,
        })),
        ...(data.scopes?.school_ids ?? []).map((school_id) => ({
          user_id: data.user_id, scope_type: "school", school_id, created_by: context.userId,
        })),
      ];
      if (rows.length > 0) {
        const { error: scopeErr } = await (supabaseAdmin as any)
          .from("platform_access_scopes")
          .insert(rows);
        if (scopeErr) throw new Error(scopeErr.message);
      }
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_role_granted",
      target_type: "user",
      target_id: data.user_id,
      details: {
        role: data.role,
        target_email: targetUser?.user?.email ?? null,
        scopes: data.scopes ?? null,
      },
    });

    return { success: true };
  });

/**
 * Adds someone straight from an email address: reuses their account if one
 * already exists (matched case-insensitively, same as platformSearchUser),
 * otherwise creates a brand-new auth user on the spot, then grants the
 * platform role. Owner-only, same as platformGrantRole.
 *
 * Returns a one-time temp_password when a new account was created — there's
 * no invite-email flow wired up here, so the owner needs to relay it to the
 * new person directly. Existing accounts never return a password.
 */
export const platformInviteAndGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      email: z.string().email(),
      full_name: z.string().trim().min(1).optional(),
      role: z.enum(PLATFORM_ROLES),
      scopes: z
        .object({
          sections: z.array(z.string()).default([]),
          school_ids: z.array(z.string().uuid()).default([]),
        })
        .optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    const targetEmail = data.email.trim().toLowerCase();

    // 1. Find an existing account by email (paged, same approach as
    //    platformSearchUser — supabase-js has no direct getUserByEmail).
    let userId: string | null = null;
    let created = false;
    let page = 1;
    const perPage = 1000;
    for (let i = 0; i < 20; i++) {
      const { data: page_, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
      if (error) throw new Error(error.message);
      const found = page_.users.find((u) => (u.email ?? "").toLowerCase() === targetEmail);
      if (found) { userId = found.id; break; }
      if (page_.users.length < perPage) break;
      page++;
    }

    let tempPassword: string | null = null;

    // 2. Create the account if it doesn't exist yet.
    if (!userId) {
      tempPassword = generatePassword(14);
      const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email.trim(),
        password: tempPassword,
        email_confirm: true,
        user_metadata: data.full_name ? { full_name: data.full_name } : undefined,
      });
      if (createErr || !createdUser?.user) {
        throw new Error(createErr?.message ?? "Failed to create account");
      }
      userId = createdUser.user.id;
      created = true;
    }

    // 3. Ensure a profile row exists (harmless no-op for existing accounts
    //    that already have one; fills it in for brand-new accounts).
    if (data.full_name) {
      await supabaseAdmin
        .from("profiles")
        .upsert({ id: userId, full_name: data.full_name }, { onConflict: "id" });
    }

    // 4. Grant the platform role — same conflict-safe logic as
    //    platformGrantRole (see the comment there for why this can't use
    //    .upsert(..., { onConflict: "user_id,role" })).
    const { data: existingGrant, error: existErr } = await (supabaseAdmin as any)
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", data.role)
      .is("school_id", null)
      .maybeSingle();
    if (existErr) throw new Error(existErr.message);

    if (!existingGrant) {
      const { error: insErr } = await (supabaseAdmin as any)
        .from("user_roles")
        .insert({ user_id: userId, role: data.role, school_id: null });
      if (insErr) throw new Error(insErr.message);
    }

    if (data.role === "platform_support") {
      const { error: delErr } = await supabaseAdmin
        .from("platform_access_scopes")
        .delete()
        .eq("user_id", userId);
      if (delErr) throw new Error(delErr.message);

      const rows = [
        ...(data.scopes?.sections ?? []).map((section) => ({
          user_id: userId, scope_type: "section", section, created_by: context.userId,
        })),
        ...(data.scopes?.school_ids ?? []).map((school_id) => ({
          user_id: userId, scope_type: "school", school_id, created_by: context.userId,
        })),
      ];
      if (rows.length > 0) {
        const { error: scopeErr } = await (supabaseAdmin as any)
          .from("platform_access_scopes")
          .insert(rows);
        if (scopeErr) throw new Error(scopeErr.message);
      }
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: created ? "platform_account_created_and_role_granted" : "platform_role_granted",
      target_type: "user",
      target_id: userId,
      details: { role: data.role, target_email: data.email.trim(), scopes: data.scopes ?? null, created },
    });

    return { user_id: userId, email: data.email.trim(), created, temp_password: tempPassword };
  });

export const platformRevokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      user_id: z.string().uuid(),
      role: z.enum(PLATFORM_ROLES),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    // Safety rail: never allow the last platform_owner to be removed —
    // that would lock everyone out of /platform permanently with no RLS
    // path back in (see the note at the top of this file).
    if (data.role === "platform_owner") {
      const { count, error: cErr } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "platform_owner");
      if (cErr) throw new Error(cErr.message);
      if ((count ?? 0) <= 1) {
        throw new Error("Can't remove the last platform owner");
      }
    }

    const { error: delErr } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (delErr) throw new Error(delErr.message);

    // Clean up any scope grants along with the role — otherwise a stale
    // scope row would silently apply if this person is ever re-granted
    // platform_support later without an explicit new scope selection.
    if (data.role === "platform_support") {
      const { error: scopeDelErr } = await supabaseAdmin
        .from("platform_access_scopes")
        .delete()
        .eq("user_id", data.user_id);
      if (scopeDelErr) throw new Error(scopeDelErr.message);
    }

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { data: targetUser } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_role_revoked",
      target_type: "user",
      target_id: data.user_id,
      details: { role: data.role, target_email: targetUser?.user?.email ?? null },
    });

    return { success: true };
  });

export const platformSetSchoolStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      school_id: z.string().uuid(),
      status: z.enum(["active", "suspended"]),
      reason: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .select("name, status")
      .eq("id", data.school_id)
      .maybeSingle();
    if (schoolErr) throw new Error(schoolErr.message);
    if (!school) throw new Error("School not found");

    const { error: updErr } = await (supabaseAdmin as any)
      .from("schools")
      .update({ status: data.status })
      .eq("id", data.school_id);
    if (updErr) throw new Error(updErr.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: data.status === "suspended" ? "school_suspended" : "school_reactivated",
      target_type: "school",
      target_id: data.school_id,
      school_id: data.school_id,
      details: { school_name: school.name, previous_status: school.status, reason: data.reason ?? null },
    });

    return { success: true };
  });

// ── Assign / manage a school's Crowdcomm SMS config from platform admin ────
// Covers both modes: leave api_key blank to bill through SmartDev's shared
// CROWDCOMM_API_KEY under this school's own sender name (Path A), or fill
// in the school's own Crowdcomm partner key to bill directly to them
// (Path B) — see resolveSmsSender() in sms.functions.ts for the priority.
export const platformSetSmsSender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      school_id: z.string().uuid(),
      sender_id: z.string().min(2).max(11, "Crowdcomm sender IDs are max 11 chars"),
      service_id: z.string().optional().default("0"),
      api_key: z.string().optional().default(""),
      enabled: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    const { data: school, error: schoolErr } = await supabaseAdmin
      .from("schools")
      .select("name")
      .eq("id", data.school_id)
      .maybeSingle();
    if (schoolErr) throw new Error(schoolErr.message);
    if (!school) throw new Error("School not found");

    // API key arrives blank when the platform admin didn't change it (the
    // client never receives the real key back) — keep whatever is already
    // stored rather than overwriting with "".
    const { data: existing } = await (supabaseAdmin as any)
      .from("school_sms_config")
      .select("api_key")
      .eq("school_id", data.school_id)
      .maybeSingle();
    const api_key = data.api_key || existing?.api_key || null;

    const { error } = await (supabaseAdmin as any)
      .from("school_sms_config")
      .upsert(
        {
          school_id: data.school_id,
          provider: "crowdcomm",
          sender_id: data.sender_id,
          service_id: data.service_id || "0",
          api_key,
          enabled: data.enabled,
        },
        { onConflict: "school_id" }
      );
    if (error) throw new Error(error.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "sms_sender_assigned",
      target_type: "school",
      target_id: data.school_id,
      school_id: data.school_id,
      details: { school_name: school.name, sender_id: data.sender_id, enabled: data.enabled, own_account: !!api_key },
    });

    return { success: true };
  });

export const platformLoadSmsSender = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ school_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);
    const { data: cfg, error } = await (supabaseAdmin as any)
      .from("school_sms_config")
      .select("sender_id, service_id, enabled, api_key")
      .eq("school_id", data.school_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      sender_id: cfg?.sender_id ?? "",
      service_id: cfg?.service_id ?? "0",
      enabled: cfg?.enabled ?? false,
      // Never send the raw key to the browser — only whether one is set.
      api_key_set: !!cfg?.api_key,
    };
  });


export const platformSetAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      message: z.string().max(500),
      active: z.boolean(),
      severity: z.enum(["info", "warning", "critical"]).default("info"),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId, { ownerOnly: true });

    const { error } = await (supabaseAdmin as any)
      .from("platform_settings")
      .upsert({
        key: "announcement",
        value: { message: data.message, active: data.active, severity: data.severity },
        updated_by: context.userId,
      });
    if (error) throw new Error(error.message);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    await logAudit({
      actor_user_id: context.userId,
      actor_email: authUser?.user?.email ?? null,
      action: "platform_announcement_updated",
      details: data,
    });

    return { success: true };
  });

// ────────────────────────────────────────────────────────────────────────
// SmartDev Learning — AI question generation (platform admin only)
//
// Read-only w.r.t. official records, same as ai-learning-insight.ts: this
// never touches exam_results/exams, and it never writes to the DB at all —
// it only returns a batch of DRAFT question candidates for the admin to
// review, edit, and explicitly save via the existing "add question" flow
// in Platform.learning.tsx (which itself always inserts as content_scope
// "universal" / status "draft" unless the admin ticks "publish now"). The
// AI never publishes anything and never creates a quiz directly.
//
// Requires the same ANTHROPIC_API_KEY Cloudflare Worker secret as
// ai-learning-insight.ts / ai-remark.ts.
const AI_QUESTION_MODEL = "claude-sonnet-5";

const GeneratedQuestionSchema = z.object({
  question_type: z.enum(["mcq", "true_false", "short_answer"]),
  question_text: z.string(),
  options: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  correct_option: z.string().optional(),      // mcq: id from options
  correct_bool: z.boolean().optional(),       // true_false
  correct_text: z.string().optional(),        // short_answer
  explanation: z.string().optional(),
  marks: z.number().int().min(1).max(10).optional(),
});

export const platformGenerateLearningQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      topic: z.string().trim().min(1),
      subject: z.string().trim().optional(),
      grade_level: z.string().trim().optional(),
      difficulty: z.enum(["easy", "medium", "hard", "mixed"]).default("mixed"),
      count: z.number().int().min(1).max(20).default(5),
      question_types: z
        .array(z.enum(["mcq", "true_false", "short_answer"]))
        .min(1)
        .default(["mcq"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireCaller(context.supabase, context.userId);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("AI question generation isn't configured yet — add the ANTHROPIC_API_KEY Cloudflare Worker secret.");
    }

    const prompt = `You are drafting exam-revision practice questions for a Kenyan school's SmartDev Learning
question bank. These are practice/revision questions only — never official exam questions.

Topic: ${data.topic}
${data.subject ? `Subject: ${data.subject}\n` : ""}${data.grade_level ? `Grade / level: ${data.grade_level}\n` : ""}Difficulty: ${data.difficulty}
Allowed question types: ${data.question_types.join(", ")}
Generate exactly ${data.count} question(s), spread across the allowed types.

For "mcq": provide 4 options with short ids "a","b","c","d" and set correct_option to the id of the right one.
For "true_false": set correct_bool.
For "short_answer": set correct_text to the accepted answer (a short exact phrase, graded case-insensitively).
Every question needs a one-sentence explanation shown to the student after they answer, and a marks value (1-3,
higher only for harder questions).

Respond with ONLY raw JSON, no markdown fences, no preamble, in exactly this shape:
{"questions": [
  {"question_type": "mcq", "question_text": "...", "options": [{"id":"a","text":"..."},...], "correct_option": "a", "explanation": "...", "marks": 1},
  {"question_type": "true_false", "question_text": "...", "correct_bool": true, "explanation": "...", "marks": 1},
  {"question_type": "short_answer", "question_text": "...", "correct_text": "...", "explanation": "...", "marks": 1}
]}`;

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: AI_QUESTION_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => "");
      console.error("[platformGenerateLearningQuestions] Anthropic API error:", anthropicRes.status, errText);
      let reason = "";
      try { reason = JSON.parse(errText)?.error?.message ?? ""; } catch { reason = errText.slice(0, 300); }
      throw new Error(reason ? `AI generation failed: ${reason}` : `AI generation failed (${anthropicRes.status})`);
    }

    const resData: any = await anthropicRes.json();
    const text = (resData.content ?? []).find((b: any) => b.type === "text")?.text?.trim() ?? "";
    const clean = text.replace(/^```json\s*|```$/g, "").trim();

    let parsed: { questions?: unknown[] };
    try {
      parsed = JSON.parse(clean);
    } catch {
      throw new Error("AI returned an unexpected format — try again or reduce the question count.");
    }

    const candidates = (parsed.questions ?? [])
      .map((q) => {
        const result = GeneratedQuestionSchema.safeParse(q);
        return result.success ? result.data : null;
      })
      .filter((q): q is z.infer<typeof GeneratedQuestionSchema> => q !== null);

    if (candidates.length === 0) {
      throw new Error("AI didn't return any usable questions — try a more specific topic.");
    }

    return { questions: candidates };
  });
