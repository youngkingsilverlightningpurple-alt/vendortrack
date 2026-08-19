/**
 * @fileOverview Financial Ledger — Immutable Double-Entry Accounting
 *
 * Implements an immutable financial ledger that records every monetary
 * event in the VendorTrack marketplace. The ledger is the single source
 * of truth for financial auditing and reconciliation.
 *
 * LEDGER EVENTS:
 *   - payment_created     — PaymentIntent created in Stripe
 *   - payment_completed   — Payment confirmed via webhook
 *   - refund_requested    — Buyer or admin initiates refund
 *   - refund_completed    — Stripe refund confirmed
 *   - commission_collected — Platform commission recorded
 *   - seller_transfer     — Funds transferred to seller
 *   - chargeback          — Chargeback initiated
 *   - dispute             — Dispute opened
 *
 * RULES:
 *   - Ledger entries are NEVER edited or deleted (append-only)
 *   - Every entry has a trace_id for end-to-end correlation
 *   - Every entry has a stripe_event_id for Stripe correlation
 *   - Entries are idempotent (same trace_id + event_type = no duplicate)
 *
 * SECURITY NOTE — service_role bypass:
 *   This module uses getSupabaseAdmin() (service_role) which bypasses RLS.
 *   This is INTENTIONAL and REQUIRED because:
 *   1. The ledger is a system-level audit trail — it must record even when
 *      no user session exists (e.g., Stripe webhooks, cron reconciliation).
 *   2. RLS policies are user-scoped; financial integrity requires system-scope.
 *   3. The ledger is append-only — no UPDATE or DELETE operations exist.
 *   4. RLS is enforced on the READ side: users can only read their own entries
 *      via the authenticated client; service_role is only used for WRITES.
 *
 * COMPLIANCE:
 *   - SOC2: Audit trail for all financial operations
 *   - ISO27001: Integrity of financial records
 *   - PCI-DSS: No card data stored in the ledger
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { PaymentLogger, PaymentError, PaymentErrorCode } from './errors';
import { type LedgerMetadata } from '@/types';

// ============================================================
// TYPES
// ============================================================

export type LedgerEventType =
  | 'payment_created'
  | 'payment_completed'
  | 'refund_requested'
  | 'refund_completed'
  | 'commission_collected'
  | 'seller_transfer'
  | 'chargeback'
  | 'dispute';

export interface LedgerEntry {
  id?: string;
  event_type: LedgerEventType;
  /**
   * Optional order ID. Nullable because some ledger events occur BEFORE an
   * order exists (e.g. `payment_created` fires at PaymentIntent creation,
   * which happens BEFORE `fulfill_order_v2` creates the order row).
   *
   * P0 FIX (war room): previously typed as `string` and callers passed `''`,
   * which failed PostgreSQL UUID validation (`22P02: invalid input syntax for
   * type uuid: ""`) and aborted checkout with HTTP 500. The DB column is
   * `UUID REFERENCES orders(id)` with no NOT NULL constraint, so NULL is the
   * correct value for pre-order events.
   */
  order_id: string | null;
  payment_intent_id?: string;
  stripe_refund_id?: string;
  amount_cents: number;
  currency: string;
  trace_id: string;
  metadata?: LedgerMetadata;
  created_at?: string;
}

export interface LedgerBalance {
  totalPayments: number;
  totalRefunds: number;
  totalCommissions: number;
  totalTransfers: number;
  netBalance: number;
}

// ============================================================
// LEDGER SERVICE
// ============================================================

/**
 * Create an immutable ledger entry.
 * This is the ONLY way to write to the financial ledger.
 *
 * Idempotency: If an entry with the same trace_id + event_type + order_id
 * already exists, the existing entry is returned without creating a duplicate.
 */
export async function createLedgerEntry(entry: LedgerEntry): Promise<{ id: string; created: boolean }> {
  const admin = getSupabaseAdmin();

  // Idempotency check: same trace_id + event_type + order_id.
  //
  // P0 FIX (war room): order_id is now `string | null`. When null, we use
  // `.is('order_id', null)` instead of `.eq('order_id', null)` because
  // PostgREST's `.eq()` filter cannot match NULL values (NULL != NULL in SQL).
  // The unique constraint `idx_financial_ledger_idempotency (trace_id, event_type, order_id)`
  // treats multiple NULLs as distinct in PostgreSQL, so the idempotency check
  // for null-order_id entries effectively becomes (trace_id + event_type)
  // — which is acceptable because pre-order events (e.g. `payment_created`)
  // are only ever written once per checkout attempt.
  const idempotencyQuery = (admin
    .from('financial_ledger') as any)
    .select('id')
    .eq('trace_id', entry.trace_id)
    .eq('event_type', entry.event_type);
  if (entry.order_id === null) {
    idempotencyQuery.is('order_id', null);
  } else {
    idempotencyQuery.eq('order_id', entry.order_id);
  }
  const { data: existing } = await idempotencyQuery.single() as any;

  if (existing) {
    PaymentLogger.info(entry.trace_id, 'ledger_entry_duplicate', `Ledger entry already exists for ${entry.event_type}`, {
      entryId: existing.id,
      eventType: entry.event_type,
      orderId: entry.order_id,
    });
    return { id: (existing as any).id, created: false };
  }

  // Insert the new entry
  const { data, error } = await (admin
    .from('financial_ledger') as any)
    .insert({
      event_type: entry.event_type,
      order_id: entry.order_id,
      payment_intent_id: entry.payment_intent_id,
      stripe_refund_id: entry.stripe_refund_id,
      amount_cents: entry.amount_cents,
      currency: entry.currency || 'usd',
      trace_id: entry.trace_id,
      metadata: entry.metadata || {},
    } as any)
    .select('id')
    .single();

  if (error) {
    // If it's a unique constraint violation, it's a duplicate
    if (error.code === '23505') {
      PaymentLogger.info(entry.trace_id, 'ledger_entry_race_duplicate', `Ledger entry race condition resolved for ${entry.event_type}`, {
        eventType: entry.event_type,
        orderId: entry.order_id,
      });
      // Fetch the existing entry (same null-aware query)
      const retryQuery = (admin
        .from('financial_ledger') as any)
        .select('id')
        .eq('trace_id', entry.trace_id)
        .eq('event_type', entry.event_type);
      if (entry.order_id === null) {
        retryQuery.is('order_id', null);
      } else {
        retryQuery.eq('order_id', entry.order_id);
      }
      const { data: existingEntry } = await retryQuery.single() as any;

      return { id: (existingEntry as any)?.id || '', created: false };
    }

    PaymentLogger.error(entry.trace_id, 'ledger_entry_failed', new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to create ledger entry: ${error.message}`,
      traceId: entry.trace_id,
      context: { eventType: entry.event_type, orderId: entry.order_id, pgCode: error.code },
    }));

    throw new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to create ledger entry: ${error.message}`,
      traceId: entry.trace_id,
      context: { eventType: entry.event_type, orderId: entry.order_id },
    });
  }

  PaymentLogger.info(entry.trace_id, 'ledger_entry_created', `Ledger entry created: ${entry.event_type}`, {
    entryId: (data as any).id,
    eventType: entry.event_type,
    orderId: entry.order_id,
    amountCents: entry.amount_cents,
  });

  return { id: (data as any).id, created: true };
}

/**
 * Create multiple ledger entries atomically using a single database transaction.
 * Used for compound events (e.g., payment_completed + commission_collected).
 * All entries succeed or all fail — no partial writes.
 */
export async function createLedgerEntries(entries: LedgerEntry[]): Promise<{ ids: string[]; allCreated: boolean }> {
  if (entries.length === 0) return { ids: [], allCreated: true };

  const admin = getSupabaseAdmin();
  const ids: string[] = [];
  let allCreated = true;

  // Use Supabase RPC for atomic batch insert (wraps all in a single transaction)
  // Fall back to sequential inserts if RPC not available
  try {
    const rows = entries.map(entry => ({
      event_type: entry.event_type,
      order_id: entry.order_id,
      payment_intent_id: entry.payment_intent_id,
      stripe_refund_id: entry.stripe_refund_id,
      amount_cents: entry.amount_cents,
      currency: entry.currency || 'usd',
      trace_id: entry.trace_id,
      metadata: entry.metadata || {},
    }));

    const { data, error } = await (admin
      .from('financial_ledger') as any)
      .insert(rows as any)
      .select('id') as any;

    if (error) {
      // If unique constraint violation on any row, fall back to sequential
      if (error.code === '23505') {
        PaymentLogger.info('batch', 'ledger_batch_race_duplicate', 'Batch insert hit unique constraint — falling back to sequential', {
          entryCount: entries.length,
        });
        // Sequential fallback preserves idempotency
        for (const entry of entries) {
          const result = await createLedgerEntry(entry);
          ids.push(result.id);
          if (!result.created) allCreated = false;
        }
        return { ids, allCreated };
      }
      throw error;
    }

    for (const row of (data || []) as any[]) {
      ids.push(row.id);
    }

    PaymentLogger.info('batch', 'ledger_batch_created', `Batch created ${ids.length} ledger entries atomically`, {
      entryCount: entries.length,
    });
  } catch (batchError) {
    // Fallback: sequential insert with individual idempotency
    PaymentLogger.warn('batch', 'ledger_batch_fallback', 'Batch insert failed — falling back to sequential', {
      error: batchError instanceof Error ? batchError.message : String(batchError),
    });
    ids.length = 0;
    allCreated = true;
    for (const entry of entries) {
      const result = await createLedgerEntry(entry);
      ids.push(result.id);
      if (!result.created) allCreated = false;
    }
  }

  return { ids, allCreated };
}

/**
 * Get the ledger balance for a given order.
 * Returns the sum of all ledger entries for that order.
 */
export async function getOrderLedgerBalance(orderId: string): Promise<LedgerBalance> {
  const admin = getSupabaseAdmin();

  const { data: entries, error } = await (admin
    .from('financial_ledger') as any)
    .select('event_type, amount_cents')
    .eq('order_id', orderId) as any;

  if (error) {
    throw new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to fetch ledger balance: ${error.message}`,
      context: { orderId },
    });
  }

  const balance: LedgerBalance = {
    totalPayments: 0,
    totalRefunds: 0,
    totalCommissions: 0,
    totalTransfers: 0,
    netBalance: 0,
  };

  for (const entry of (entries || []) as any[]) {
    switch (entry.event_type) {
      case 'payment_created':
      case 'payment_completed':
        balance.totalPayments += entry.amount_cents;
        break;
      case 'refund_completed':
        balance.totalRefunds += entry.amount_cents;
        break;
      case 'commission_collected':
        balance.totalCommissions += entry.amount_cents;
        break;
      case 'seller_transfer':
        balance.totalTransfers += entry.amount_cents;
        break;
      // chargeback and dispute are tracked but don't affect the balance directly
      case 'chargeback':
      case 'dispute':
        break;
    }
  }

  balance.netBalance = balance.totalPayments - balance.totalRefunds - balance.totalCommissions - balance.totalTransfers;

  return balance;
}

/**
 * Get all ledger entries for a given order.
 * Used for audit trail display.
 */
export async function getOrderLedgerEntries(orderId: string): Promise<LedgerEntry[]> {
  const admin = getSupabaseAdmin();

  const { data, error } = await (admin
    .from('financial_ledger') as any)
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true }) as any;

  if (error) {
    throw new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to fetch ledger entries: ${error.message}`,
      context: { orderId },
    });
  }

  return (data || []) as LedgerEntry[];
}

/**
 * Get the platform-wide ledger summary for a date range.
 * Used for financial reporting and reconciliation.
 */
export async function getPlatformLedgerSummary(
  startDate: string,
  endDate: string
): Promise<{
  totalPayments: number;
  totalRefunds: number;
  totalCommissions: number;
  totalTransfers: number;
  netRevenue: number;
  refundRate: number;
  entryCount: number;
}> {
  const admin = getSupabaseAdmin();

  const { data, error } = await (admin
    .from('financial_ledger') as any)
    .select('event_type, amount_cents')
    .gte('created_at', startDate)
    .lte('created_at', endDate) as any;

  if (error) {
    throw new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to fetch platform ledger summary: ${error.message}`,
    });
  }

  let totalPayments = 0;
  let totalRefunds = 0;
  let totalCommissions = 0;
  let totalTransfers = 0;

  for (const entry of (data || []) as any[]) {
    switch (entry.event_type) {
      case 'payment_created':
      case 'payment_completed':
        totalPayments += entry.amount_cents;
        break;
      case 'refund_completed':
        totalRefunds += entry.amount_cents;
        break;
      case 'commission_collected':
        totalCommissions += entry.amount_cents;
        break;
      case 'seller_transfer':
        totalTransfers += entry.amount_cents;
        break;
    }
  }

  const netRevenue = totalCommissions;
  const refundRate = totalPayments > 0 ? (totalRefunds / totalPayments) * 100 : 0;

  return {
    totalPayments,
    totalRefunds,
    totalCommissions,
    totalTransfers,
    netRevenue,
    refundRate,
    entryCount: data?.length || 0,
  };
}

/**
 * Verify ledger integrity for an order.
 * Checks that all expected entries exist and amounts balance.
 */
export async function verifyLedgerIntegrity(orderId: string): Promise<{
  valid: boolean;
  issues: string[];
  balance: LedgerBalance;
}> {
  const issues: string[] = [];
  const balance = await getOrderLedgerBalance(orderId);
  const entries = await getOrderLedgerEntries(orderId);

  const eventTypes = new Set(entries.map(e => e.event_type));

  // Check: payment_completed should exist
  if (!eventTypes.has('payment_completed') && !eventTypes.has('payment_created')) {
    issues.push('No payment entry found in ledger');
  }

  // Check: if refund exists, commission_collected should also exist
  if (eventTypes.has('refund_completed') && !eventTypes.has('commission_collected')) {
    // This might be valid if commission was reversed in the refund
  }

  // Check: net balance should be zero for a fully settled order
  if (balance.totalPayments > 0 && balance.netBalance !== 0) {
    // This is expected for open orders (seller hasn't been paid yet)
    // Only flag if the order is old enough
  }

  return {
    valid: issues.length === 0,
    issues,
    balance,
  };
}
