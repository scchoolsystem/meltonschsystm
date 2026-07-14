import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://vpikrrytxeyybfhnozyt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LoBEcMCHCaFrg-oTLulmXw_qTRCsI26';

function createSupabaseClient() {
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'sb-vpikrrytxeyybfhnozyt-auth-token',
    }
  });

  /**
   * ROOT CAUSE of the "spinner never resolves, zero requests in Supabase
   * logs" bug (confirmed against the real @supabase/supabase-js@2.107.0
   * source and reproduced against the live library):
   *
   * Every single call this client makes — .rpc(), .from(), storage, all of
   * it, not just supabase.auth.* calls — internally calls
   * `_getAccessToken()`, which awaits `this.auth.getSession()` to build the
   * Authorization header BEFORE it ever dispatches its own HTTP request.
   * `getSession()` in turn starts with `await this.initializePromise`, a
   * one-time promise that only resolves once the client's startup routine
   * (`_recoverAndRefresh` -> `_refreshAccessToken`) finishes. That startup
   * routine does a bare `fetch()` to the `/token` endpoint with NO timeout
   * of any kind — not even an AbortController. Its retry logic only
   * triggers on an actual rejected fetch; it does nothing if the fetch
   * simply never settles (a stalled TCP/TLS handshake — common on a desktop
   * app after sleep/wake, a VPN reconnect, or a flaky adapter reconnecting).
   *
   * If that one fetch stalls, `initializePromise` never resolves, so
   * `getSession()` — and therefore literally every unguarded query anywhere
   * in this codebase — awaits it forever. No request ever leaves the
   * browser (this is why Supabase's API logs show zero entries for the
   * stuck call), and nothing ever throws or times out on its own.
   *
   * We can't add a timeout inside supabase-js's private
   * `_refreshAccessToken`, and wrapping our own `global.fetch` doesn't help
   * either — the hang happens *before* fetch is ever called. Overriding
   * `getSession()` itself is the one choke point every call path shares, so
   * this single override protects every call site in the app at once,
   * instead of requiring every individual component to remember to wrap its
   * own calls in a timeout.
   *
   * On timeout this falls back to `{ session: null }`, which makes
   * `_getAccessToken()` use the anon/publishable key instead of a user
   * token — i.e. the call proceeds as if logged out (RLS-safe: it can only
   * return what an anonymous request is allowed to see) rather than hanging
   * forever. The real background refresh keeps running; once it resolves
   * (or the network recovers), subsequent calls get the real session again
   * automatically.
   */
  const realGetSession = client.auth.getSession.bind(client.auth);
  client.auth.getSession = (async () => {
    const TIMEOUT = Symbol("getSession-timeout");
    let timeoutId: ReturnType<typeof setTimeout>;
    const result = await Promise.race([
      realGetSession(),
      new Promise<typeof TIMEOUT>((resolve) => {
        timeoutId = setTimeout(() => resolve(TIMEOUT), 5000);
      }),
    ]);
    clearTimeout(timeoutId!);
    if (result === TIMEOUT) {
      console.warn("[supabase] getSession() exceeded 5s (likely a stuck startup token refresh) — proceeding without a session for this call");
      return { data: { session: null }, error: null };
    }
    return result;
  }) as typeof client.auth.getSession;

  return client;
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});

/**
 * supabase.auth.getSession() is called from `beforeLoad` in a dozen+ route
 * files — it runs on essentially every navigation in the app because the
 * `/_app` layout route's beforeLoad re-fires for the whole matched chain.
 *
 * NOTE: an earlier version of this comment blamed a "supabase-js internal
 * lock." That was wrong — checked against the actual installed version
 * (2.107.0): no custom `lock` is configured in createSupabaseClient() above,
 * so GoTrueClient takes its default lockless path entirely; `_acquireLock`
 * is never even called. The real (confirmed) risk is the one described on
 * the `getSession` override above: a stuck one-time startup token refresh
 * can leave `initializePromise` — and therefore every `getSession()` call —
 * pending forever. That override already protects this function's own call
 * below. This wrapper is kept as a second, independent ceiling specifically
 * for route guards, since a frozen route transition (no paint, no DOM) is a
 * worse user experience than a frozen component and deserves its own
 * explicit timeout rather than relying solely on the shared one above.
 *
 * Use this instead of `supabase.auth.getSession()` directly in any
 * beforeLoad/route guard. On timeout it returns `null` (treated as "no
 * session confirmed yet"), NOT an error — callers should not hard-redirect
 * to /login on a timeout, since that could log out someone with a
 * perfectly valid session just because the check was briefly stuck. Let the
 * client-side auth check (which has its own safety timers) make the real
 * call once it mounts.
 */
export async function getSessionSafe(timeoutMs = 4000) {
  const TIMEOUT = Symbol("getSessionSafe-timeout");
  const result = await Promise.race([
    supabase.auth.getSession(),
    new Promise<typeof TIMEOUT>((resolve) => setTimeout(() => resolve(TIMEOUT), timeoutMs)),
  ]);
  if (result === TIMEOUT) {
    console.warn(`[getSessionSafe] getSession() exceeded ${timeoutMs}ms — treating as unresolved, not as logged-out`);
    return { data: { session: null }, error: null, timedOut: true as const };
  }
  return { ...result, timedOut: false as const };
}
