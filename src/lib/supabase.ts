import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient as SupabaseClientType } from '@supabase/supabase-js';

/**
 * Supabase Client Factory — CLIENT-SIDE ONLY
 *
 * Creates a browser-side Supabase client using ONLY public-safe variables:
 * - NEXT_PUBLIC_SUPABASE_URL (safe for client bundle)
 * - NEXT_PUBLIC_SUPABASE_ANON_KEY (safe for client bundle, respects RLS)
 *
 * GRACEFUL DEGRADATION: If Supabase env vars are not configured,
 * returns a no-op stub client. The app renders in degraded mode
 * (no auth, no data, but no crash).
 *
 * SECURITY: This client NEVER has access to SUPABASE_SERVICE_ROLE_KEY.
 * For server-side admin operations, use getSupabaseAdmin() from
 * @/lib/supabase-admin instead.
 */

export const isSupabaseAvailable = (): boolean => {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
};

export const createClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Graceful degradation: return a no-op stub client
    // All operations return empty data instead of crashing
    console.warn(
      '[Supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY not set. ' +
      'Application will run in degraded mode (no database, no auth).'
    );

    // Return a Proxy-based no-op client that satisfies the SupabaseClient type
    return createNoOpClient();
  }

  return createBrowserClient(url, key);
};

/**
 * Create a no-op Supabase client stub for graceful degradation.
 */
function createNoOpClient() {
  return new Proxy({} as SupabaseClientType, {
    get(_target, prop) {
      if (prop === 'auth') {
        return {
          getUser: () => Promise.resolve({ data: { user: null }, error: null }),
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signInWithOAuth: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signUp: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signOut: () => Promise.resolve({ error: null }),
          resetPasswordForEmail: () => Promise.resolve({ data: {}, error: { message: 'Supabase not configured' } }),
        };
      }
      if (prop === 'from') {
        return (_table: string) => {
          const chain: any = {
            select: () => chain,
            insert: () => chain,
            update: () => chain,
            delete: () => chain,
            eq: () => chain,
            neq: () => chain,
            gt: () => chain,
            gte: () => chain,
            lt: () => chain,
            lte: () => chain,
            in: () => chain,
            like: () => chain,
            ilike: () => chain,
            is: () => chain,
            not: () => chain,
            range: () => chain,
            limit: () => chain,
            order: () => chain,
            single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            match: () => chain,
            then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
            catch: (_reject: (e: any) => void) => Promise.resolve({ data: [], error: null }),
            finally: (cb: () => void) => { cb(); return Promise.resolve({ data: [], error: null }); },
          };
          return chain;
        };
      }
      if (prop === 'rpc') {
        return (_fn: string) => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
      }
      if (prop === 'channel') {
        return () => ({ on: function() { return this; }, subscribe: function() { return this; }, unsubscribe: () => {} });
      }
      if (prop === 'removeChannel') return () => {};
      if (prop === 'getChannels') return () => [];
      return undefined;
    },
  });
}

export type SupabaseClient = ReturnType<typeof createBrowserClient>;
