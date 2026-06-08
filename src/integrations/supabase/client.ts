// This file is manually configured for deployment
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Hardcoded values for production (these are public keys, safe to include)
const SUPABASE_URL = 'https://vpikrrytxeyybfhnozyt.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZwaWtycnl0eGV5eWJmaG5venl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwOTEwMzcsImV4cCI6MjA5NDY2NzAzN30.093gsEOCH5R1XKzhCr0mbrIEhydJc5Mv8TxUWga7iy0';

console.log('[Supabase] Initializing with URL:', SUPABASE_URL);

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
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
