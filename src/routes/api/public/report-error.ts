import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { reportSystemError, schoolIdForUser, type Severity } from "@/lib/error-reporter.server";

// Silent failure intake. Called by src/lib/report-error.ts from the browser.
//
// - Public on purpose: the failures we most need to hear about (crash on the
//   login screen, session expired mid-class, app shell failed to boot) happen
//   when there is no valid session.
// - Identity is NEVER taken from the body. If a Bearer token is present it is
//   verified and user/school are derived server-side; otherwise the report is
//   logged as anonymous.
// - Always answers 204 with no body: the client must never learn anything
//   from this endpoint, and a logging problem must never surface to a user.
// - Abuse guard: 16 KB body cap + small per-IP rate limit (best-effort,
//   per Worker isolate) on top of the fingerprint dedupe in reportSystemError.

const NO_CONTENT = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

const hits = new Map<string, { n: number; reset: number }>();
const LIMIT = 30; // reports
const WINDOW_MS = 60_000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now > h.reset) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    if (hits.size > 5_000) for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
    return false;
  }
  h.n += 1;
  return h.n > LIMIT;
}

const SEVERITIES = new Set(["warning", "error", "critical"]);

export const Route = createFileRoute("/api/public/report-error")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
          if (rateLimited(ip)) return NO_CONTENT();

          const raw = await request.text();
          if (!raw || raw.length > 16_384) return NO_CONTENT();

          let body: any;
          try {
            body = JSON.parse(raw);
          } catch {
            return NO_CONTENT();
          }
          if (!body || typeof body !== "object" || typeof body.message !== "string") return NO_CONTENT();

          // Verified identity (optional)
          let userId: string | null = null;
          let schoolId: string | null = null;
          const auth = request.headers.get("authorization");
          if (auth?.startsWith("Bearer ")) {
            try {
              const { data } = await (supabaseAdmin as any).auth.getUser(auth.slice(7));
              userId = data?.user?.id ?? null;
              if (userId) schoolId = await schoolIdForUser(userId);
            } catch {
              /* anonymous */
            }
          }

          const severity: Severity = SEVERITIES.has(body.severity) ? body.severity : "error";

          await reportSystemError({
            source: typeof body.source === "string" ? body.source : "client",
            code: typeof body.code === "string" ? body.code : undefined,
            severity,
            message: body.message,
            stack: typeof body.stack === "string" ? body.stack : null,
            context: body.context && typeof body.context === "object" ? body.context : undefined,
            url: typeof body.url === "string" ? body.url : null,
            userAgent: request.headers.get("user-agent"),
            userId,
            schoolId,
          });
        } catch (e: any) {
          console.error("[report-error] intake failed:", e?.message ?? e);
        }
        return NO_CONTENT();
      },
    },
  },
});
