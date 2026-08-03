/**
 * @fileOverview Secure Server-Side Supabase Admin Client
 *
 * This module provides a SUPABASE ADMIN CLIENT that is only importable
 * from server-side code (API routes, Server Actions, middleware).
 *
 * It uses the SERVICE ROLE KEY which bypasses Row Level Security.
 * This client MUST NEVER be imported from client-side code.
 *
 * GRACEFUL DEGRADATION:
 *   - getSupabaseAdmin() throws if Supabase not configured (default behavior)
 *     Used by service files that require database access.
 *   - getSupabaseAdminSafe() returns null if not configured (safe version)
 *     Used by entry points (middleware, health endpoint) that need graceful handling.
 *   - isSupabaseAdminAvailable() checks without throwing.
 *
 * For client-side usage, use src/lib/supabase.ts instead.
 */

import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env';

let _adminClient: ReturnType<typeof createClient> | null = null;

/**
 * Get the Supabase admin client (service role).
 * Uses lazy initialization. Throws if Supabase is not configured.
 * Only call this from server-side code (API routes, server actions).
 *
 * @throws Error if called from client-side code
 * @throws Error if SUPABASE_SERVICE_ROLE_KEY is not set
 */
export function getSupabaseAdmin(): ReturnType<typeof createClient> {
  // Runtime guard against client-side import
  if (typeof window !== 'undefined') {
    throw new Error(
      'SECURITY VIOLATION: getSupabaseAdmin() must never be called from client-side code. ' +
      'Use the regular Supabase client from @/lib/supabase instead.'
    );
  }

  if (!_adminClient) {
    const url = requireEnv('NEXT_PUBLIC_SUPABASE_URL');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

    _adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return _adminClient;
}

/**
 * Safe version that returns null instead of throwing.
 * Use in middleware, health checks, and other entry points
 * that need graceful degradation.
 */
export function getSupabaseAdminSafe(): ReturnType<typeof createClient> | null {
  try {
    return getSupabaseAdmin();
  } catch {
    return null;
  }
}

/**
 * Check if Supabase admin client is available without throwing.
 */
export function isSupabaseAdminAvailable(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/**
 * Reset the admin client singleton (useful for testing).
 */
export function resetAdminClient(): void {
  _adminClient = null;
}
