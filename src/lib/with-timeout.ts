/**
 * Guards a single Supabase (or any) promise so a slow/hanging call can't
 * sink an entire screen. Without this, a `Promise.all([...])` or a plain
 * `await` never settles if even one query stalls (slow query, connection-
 * pool exhaustion, the multi-tab supabase-js auth-lock hang documented in
 * `src/integrations/supabase/client.ts`, etc.) — the caller just spins
 * forever with no error surfaced anywhere.
 *
 * This does NOT cancel or abort the underlying request — it can't, fetch()
 * requests from supabase-js aren't exposed for cancellation here — it just
 * stops *waiting* on it and moves on with `fallback` after `ms`. If the
 * real call eventually does resolve, its result is discarded.
 *
 * Mirrors the pattern already proven out in `_app.portal.me.tsx` and
 * `use-auth.tsx`; pulled out here so `_app.portal.parent.tsx` and
 * `_app.portal.student.tsx` (which previously used bare `await`s with no
 * guard at all) can share it instead of re-implementing it a third time.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, fallback: T, label?: string): Promise<T> {
  let settled = false;
  return Promise.race([
    Promise.resolve(promise)
      .then((v) => { settled = true; return v; })
      .catch((err) => { settled = true; console.error(`[withTimeout] "${label ?? "query"}" rejected:`, err); return fallback; }),
    new Promise<T>((resolve) => setTimeout(() => {
      if (!settled) console.warn(`[withTimeout] "${label ?? "query"}" exceeded ${ms}ms — using fallback data`);
      resolve(fallback);
    }, ms)),
  ]);
}
