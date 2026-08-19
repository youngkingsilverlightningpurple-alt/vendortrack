/**
 * @fileoverview Payment Session Repository
 *
 * All database access for payment sessions goes through this module.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { PaymentSession, PaymentSessionRow } from '@/domain';
import { paymentSessionRowToDomain } from '@/domain';
import { fromDatabaseError } from '@/lib/errors';

class PaymentSessionRepository {
  /** Find a payment session by ID */
  async findById(sessionId: string): Promise<PaymentSession | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('payment_sessions') as any)
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw fromDatabaseError(error);
    }
    return data ? paymentSessionRowToDomain(data as PaymentSessionRow) : null;
  }

  /** Find an active pending session for a user */
  async findPendingByUserId(userId: string): Promise<PaymentSession | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('payment_sessions') as any)
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw fromDatabaseError(error);
    if (!data || data.length === 0) return null;
    return paymentSessionRowToDomain(data[0] as unknown as PaymentSessionRow);
  }

  /** Create a new payment session */
  async create(data: {
    userId: string;
    items: Record<string, unknown>[];
    amountTotalCents: number;
    status: string;
    expiresAt: string;
  }): Promise<PaymentSession> {
    const admin = getSupabaseAdmin();
    const { data: session, error } = await (admin
      .from('payment_sessions') as any)
      .insert({
        user_id: data.userId,
        items: data.items,
        amount_total_cents: data.amountTotalCents,
        status: data.status,
        expires_at: data.expiresAt,
      } as any)
      .select()
      .single();

    if (error) throw fromDatabaseError(error);
    return paymentSessionRowToDomain(session as PaymentSessionRow);
  }

  /** Update session status */
  async updateStatus(sessionId: string, status: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('payment_sessions') as any)
      .update({ status } as any)
      .eq('id', sessionId);

    if (error) throw fromDatabaseError(error);
  }

  /**
   * Cancel stale (expired but still marked pending) sessions for a user.
   *
   * P0 FIX (war room): The previous implementation queried sessions where
   * `expires_at > now()` (i.e. NOT yet expired) and then cancelled all of them,
   * including the most recent active session. That destroyed legitimate
   * concurrent checkout attempts.
   *
   * Correct behavior: only cancel sessions whose `expires_at` is in the past
   * (genuinely stale) AND whose status is still `pending`. Live pending
   * sessions (not yet expired) are left untouched.
   */
  async cancelStaleSessions(userId: string): Promise<number> {
    const admin = getSupabaseAdmin();
    const nowIso = new Date().toISOString();

    // Only select sessions that are genuinely stale: status=pending AND expires_at < now
    const { data: staleSessions, error } = await (admin
      .from('payment_sessions') as any)
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('expires_at', nowIso);

    if (error) throw fromDatabaseError(error);

    if (!staleSessions || staleSessions.length === 0) {
      return 0;
    }

    // Single UPDATE statement — atomic and idempotent
    const staleIds = (staleSessions as any[]).map((s) => s.id);
    const { error: updateError } = await (admin
      .from('payment_sessions') as any)
      .update({ status: 'failed' } as any)
      .in('id', staleIds)
      .eq('status', 'pending'); // re-check status to avoid TOCTOU race

    if (updateError) throw fromDatabaseError(updateError);

    return staleIds.length;
  }
}

export const paymentSessionRepository = new PaymentSessionRepository();
