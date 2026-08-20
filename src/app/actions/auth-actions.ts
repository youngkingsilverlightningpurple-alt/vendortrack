'use server';

/**
 * @fileOverview Auth Server Actions — Profile Setup
 *
 * P0 FIX (war room): the audit identified that the signup flow silently failed
 * to set the user's role. The client-side Supabase client is subject to RLS,
 * and the `profiles` UPDATE policy has a `WITH CHECK` clause that blocks
 * changing the `role` field from its default ('buyer') to 'seller'.
 *
 * As a result, sellers who signed up would silently remain 'buyer' role and
 * never see the seller dashboard.
 *
 * Fix: this server action uses the service-role admin client (which bypasses
 * RLS) to set the role + full_name on the freshly-created profile row. The
 * action is gated by `requireAuth` so only the authenticated user can set
 * their OWN profile (the action receives the userId from the session, not
 * from the client).
 *
 * SECURITY: the service-role key is NEVER exposed to the client. The action
 * validates that the userId in the payload matches the authenticated session
 * user. A malicious client cannot use this action to set another user's role.
 */

import { requireAuth, isAuthError } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getErrorMessage } from '@/types';

export interface SetupProfileResult {
  success: boolean;
  error?: string;
}

/**
 * Set the user's role + full_name on their profile row.
 *
 * Called from the signup page after `supabase.auth.signUp` succeeds.
 * Uses the service-role admin client to bypass the RLS `WITH CHECK` clause
 * that would otherwise block the role update.
 *
 * @param userId - the authenticated user's ID (from the session, NOT the client)
 * @param role - 'buyer' or 'seller' (validated against the enum)
 * @param fullName - the user's full name
 */
export async function setupProfile(
  userId: string,
  role: 'buyer' | 'seller',
  fullName: string
): Promise<SetupProfileResult> {
  // Authenticate the caller — this action is only callable by an authenticated user.
  const auth = await requireAuth({});

  if (isAuthError(auth) || !auth.success) {
    return { success: false, error: 'Authentication required' };
  }

  // SECURITY: verify the userId in the payload matches the authenticated session user.
  // Without this check, a malicious client could pass another user's ID and change their role.
  if (auth.userId !== userId) {
    return { success: false, error: 'Forbidden — cannot set profile for another user' };
  }

  // Validate the role — only 'buyer' and 'seller' are valid for self-signup.
  // 'admin' and 'super_admin' can only be granted by an existing admin via the admin dashboard.
  if (role !== 'buyer' && role !== 'seller') {
    return { success: false, error: 'Invalid role — only buyer or seller allowed' };
  }

  // Validate the full name — basic length check.
  if (!fullName || fullName.trim().length < 1 || fullName.trim().length > 100) {
    return { success: false, error: 'Full name is required (1-100 characters)' };
  }

  try {
    const admin = getSupabaseAdmin();

    // Update the profile row using the service-role client (bypasses RLS).
    // We also set seller_status='pending' for sellers — they must be approved
    // by an admin before they can list products. (The trigger
    // `verify_seller_before_insert` in rls-migration.sql:326 prevents
    // unapproved sellers from creating products.)
    const updateData: Record<string, unknown> = {
      role,
      full_name: fullName.trim(),
    };

    if (role === 'seller') {
      updateData.seller_status = 'pending';
    }

    const { error } = await (admin
      .from('profiles') as any)
      .update(updateData)
      .eq('id', userId);

    if (error) {
      return { success: false, error: `Failed to set profile: ${error.message}` };
    }

    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: getErrorMessage(error) };
  }
}
