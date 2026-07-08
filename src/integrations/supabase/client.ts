import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = 'https://vpikrrytxeyybfhnozyt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_LoBEcMCHCaFrg-oTLulmXw_qTRCsI26';

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'sb-vpikrrytxeyybfhnozyt-auth-token',
    }
  });
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
 * supabase-js's session handling can, rarely, hang on its internal lock
 * (worse with multiple tabs open against the same storageKey), and an
 * unguarded `await` there blocks the ENTIRE route transition forever —
 * before React renders anything, so no CPU usage, no DOM, just a page
 * that looks completely frozen with the browser still showing "loading".
 *
 * Use this instead of `supabase.auth.getSession()` directly in any
 * beforeLoad/route guard. On timeout it returns `null` (treated as "no
 * session confirmed yet"), NOT an error — callers should not hard-redirect
 * to /login on a timeout, since that could log out someone with a
 * perfectly valid session just because the lock was briefly stuck. Let the
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
