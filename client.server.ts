import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL =
    process.env.SUPABASE_URL ?? (globalThis as any).__env__?.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    (globalThis as any).__env__?.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    // Hard throw — returning null caused silent data-loss in the M-Pesa
    // callback and any other server route that calls supabaseAdmin.from().
    // A misconfigured deployment should fail loudly at startup, not silently
    // drop writes at runtime.
    throw new Error(
      '[Supabase] Admin client cannot be created: ' +
        [
          !SUPABASE_URL ? 'SUPABASE_URL' : '',
          !SUPABASE_SERVICE_ROLE_KEY ? 'SUPABASE_SERVICE_ROLE_KEY' : '',
        ]
          .filter(Boolean)
          .join(', ') +
        ' is missing. Set these in your Cloudflare Worker secrets.',
    );
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

// Lazy singleton — created on first use so the Worker can boot even before
// the env is bridged from Cloudflare into process.env (done in server.ts).
let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

export const supabaseAdmin = new Proxy(
  {} as ReturnType<typeof createSupabaseAdminClient>,
  {
    get(_, prop, receiver) {
      if (!_supabaseAdmin) {
        _supabaseAdmin = createSupabaseAdminClient(); // throws if misconfigured
      }
      return Reflect.get(_supabaseAdmin, prop, receiver);
    },
  },
);
