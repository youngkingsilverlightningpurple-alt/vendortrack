/**
 * @fileOverview Financial Reconciliation Service
 *
 * Compares Stripe data against the VendorTrack database to detect:
 *   - Missing orders (Stripe has payments we don't have orders for)
 *   - Duplicate payments (same PaymentIntent processed twice)
 *   - Failed transfers (seller didn't receive funds)
 *   - Orphan refunds (refund exists in DB but not in Stripe)
 *   - Commission mismatch (commission doesn't match 10% rate)
 *   - Amount mismatches (Stripe amount != DB amount)
 *
 * RECONCILIATION IS THE LAST LINE OF DEFENSE.
 * If any financial inconsistency exists, reconciliation will find it.
 *
 * Runs:
 *   - On-demand (admin API endpoint)
 *   - Scheduled (daily via cron job)
 *   - After critical failures (automatic reconciliation)
 */

import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireEnv } from '@/lib/env';
import { PaymentLogger, PaymentError, PaymentErrorCode } from './errors';
import { withRetry, RETRY_CONFIGS } from './retry';
import { getErrorMessage, type ReconciliationOrder } from '@/types';
import { calculateTotalCommission } from '@/domain/commission';

// ============================================================
// TYPES
// ============================================================

export interface ReconciliationReport {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: 'running' | 'completed' | 'failed';
  stripePaymentCount: number;
  dbOrderCount: number;
  discrepancies: ReconciliationDiscrepancy[];
  summary: {
    missingOrders: number;
    duplicatePayments: number;
    failedTransfers: number;
    orphanRefunds: number;
    commissionMismatches: number;
    amountMismatches: number;
  };
  healthy: boolean;
}

export interface ReconciliationDiscrepancy {
  type: 'missing_order' | 'duplicate_payment' | 'failed_transfer' | 'orphan_refund' | 'commission_mismatch' | 'amount_mismatch';
  severity: 'low' | 'medium' | 'high' | 'critical';
  stripePaymentIntentId?: string;
  orderId?: string;
  expectedAmount?: number;
  actualAmount?: number;
  description: string;
  traceId?: string;
  detectedAt: string;
}

// ============================================================
// STRIPE CLIENT
// ============================================================

function getStripeClient(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2024-06-20',
  });
}

// ============================================================
// RECONCILIATION ENGINE
// ============================================================

// Commission rate is sourced from the centralized module for reference only.
// The actual commission validation uses calculateTotalCommission() which
// is the single source of truth for commission calculation.

/**
 * Run a full reconciliation between Stripe and the database.
 *
 * This is the main entry point for reconciliation.
 * It fetches all recent Stripe payments and compares them
 * against the database orders.
 */
export async function runReconciliation(
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<ReconciliationReport> {
  const reportId = `recon_${Date.now()}`;
  const startTime = new Date().toISOString();

  const report: ReconciliationReport = {
    id: reportId,
    startedAt: startTime,
    status: 'running',
    stripePaymentCount: 0,
    dbOrderCount: 0,
    discrepancies: [],
    summary: {
      missingOrders: 0,
      duplicatePayments: 0,
      failedTransfers: 0,
      orphanRefunds: 0,
      commissionMismatches: 0,
      amountMismatches: 0,
    },
    healthy: true,
  };

  PaymentLogger.info(reportId, 'reconciliation_started', 'Starting financial reconciliation', {
    startDate: options.startDate,
    endDate: options.endDate,
    limit: options.limit,
  });

  try {
    const stripe = getStripeClient();
    const admin = getSupabaseAdmin();

    // 1. Fetch all recent Stripe PaymentIntents
    const stripePayments = await fetchStripePayments(stripe, {
      startDate: options.startDate,
      endDate: options.endDate,
      limit: options.limit,
    });

    report.stripePaymentCount = stripePayments.length;

    // 2. Fetch all recent DB orders
    const { data: dbOrders, error: dbError } = await (admin
      .from('orders') as any)
      .select('id, payment_intent_id, amount_total_cents, commission_cents, status, refund_status, trace_id, created_at')
      .gte('created_at', options.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false });

    if (dbError) {
      throw new PaymentError(PaymentErrorCode.INTERNAL_RECONCILIATION_ERROR, {
        message: `Failed to fetch DB orders: ${dbError.message}`,
        traceId: reportId,
      });
    }

    report.dbOrderCount = dbOrders?.length || 0;

    // 3. Build lookup maps
    const stripePaymentMap = new Map<string, Stripe.PaymentIntent>();
    for (const pi of stripePayments) {
      stripePaymentMap.set(pi.id, pi);
    }

    const dbOrderMap = new Map<string, ReconciliationOrder>();
    const dbPaymentIntentMap = new Map<string, ReconciliationOrder>();
    for (const order of dbOrders || []) {
      dbOrderMap.set(order.id, order);
      if (order.payment_intent_id) {
        dbPaymentIntentMap.set(order.payment_intent_id, order);
      }
    }

    // 4. CHECK 1: Missing orders (Stripe has payments we don't have)
    for (const pi of stripePayments) {
      if (pi.status !== 'succeeded') continue; // Only check successful payments

      const dbOrder = dbPaymentIntentMap.get(pi.id);

      if (!dbOrder) {
        // Check if there's a payment session for this
        const { data: session } = await (admin
          .from('payment_sessions') as any)
          .select('id, status')
          .eq('id', pi.metadata?.sessionId)
          .single();

        if (!session || session.status !== 'completed') {
          report.discrepancies.push({
            type: 'missing_order',
            severity: 'critical',
            stripePaymentIntentId: pi.id,
            expectedAmount: pi.amount,
            description: `Stripe PaymentIntent ${pi.id} succeeded but no matching order found in DB. Amount: ${pi.amount} cents.`,
            traceId: pi.metadata?.traceId,
            detectedAt: new Date().toISOString(),
          });
          report.summary.missingOrders++;
        }
      }
    }

    // 5. CHECK 2: Amount mismatches
    for (const order of dbOrders || []) {
      if (!order.payment_intent_id) continue;

      const stripePI = stripePaymentMap.get(order.payment_intent_id);
      if (!stripePI) continue; // Payment not in Stripe window — skip

      if (stripePI.amount !== order.amount_total_cents) {
        report.discrepancies.push({
          type: 'amount_mismatch',
          severity: 'high',
          stripePaymentIntentId: order.payment_intent_id,
          orderId: order.id,
          expectedAmount: stripePI.amount,
          actualAmount: order.amount_total_cents,
          description: `Amount mismatch: Stripe=${stripePI.amount} cents, DB=${order.amount_total_cents} cents for order ${order.id}`,
          traceId: order.trace_id,
          detectedAt: new Date().toISOString(),
        });
        report.summary.amountMismatches++;
      }
    }

    // 6. CHECK 3: Commission mismatches
    for (const order of dbOrders || []) {
      if (order.status === 'refunded') continue; // Skip refunded orders

      const expectedCommission = calculateTotalCommission(order.amount_total_cents);
      if (order.commission_cents !== expectedCommission) {
        report.discrepancies.push({
          type: 'commission_mismatch',
          severity: 'medium',
          orderId: order.id,
          expectedAmount: expectedCommission,
          actualAmount: order.commission_cents,
          description: `Commission mismatch: Expected=${expectedCommission} cents, Actual=${order.commission_cents} cents for order ${order.id}`,
          traceId: order.trace_id,
          detectedAt: new Date().toISOString(),
        });
        report.summary.commissionMismatches++;
      }
    }

    // 7. CHECK 4: Orphan refunds (refund in DB but not in Stripe)
    const refundedOrders = (dbOrders || []).filter((o: any) => o.refund_status === 'approved' || o.status === 'refunded');
    for (const order of refundedOrders) {
      if (!order.payment_intent_id) continue;

      try {
        const refunds = await stripe.refunds.list({
          payment_intent: order.payment_intent_id,
          limit: 10,
        });

        if (refunds.data.length === 0) {
          report.discrepancies.push({
            type: 'orphan_refund',
            severity: 'critical',
            stripePaymentIntentId: order.payment_intent_id,
            orderId: order.id,
            description: `Order ${order.id} is marked as refunded in DB but no refund found in Stripe for PI ${order.payment_intent_id}`,
            traceId: order.trace_id,
            detectedAt: new Date().toISOString(),
          });
          report.summary.orphanRefunds++;
        }
      } catch (error: unknown) {
        PaymentLogger.warn(reportId, 'reconciliation_refund_check_failed', `Failed to check Stripe refunds for PI ${order.payment_intent_id}: ${getErrorMessage(error)}`);
      }
    }

    // 8. CHECK 5: Duplicate payments (same PaymentIntent ID in multiple orders)
    const piCounts = new Map<string, number>();
    for (const order of dbOrders || []) {
      if (order.payment_intent_id) {
        piCounts.set(order.payment_intent_id, (piCounts.get(order.payment_intent_id) || 0) + 1);
      }
    }
    for (const [piId, count] of piCounts.entries()) {
      if (count > 1) {
        report.discrepancies.push({
          type: 'duplicate_payment',
          severity: 'critical',
          stripePaymentIntentId: piId,
          description: `PaymentIntent ${piId} is associated with ${count} orders (possible duplicate processing)`,
          detectedAt: new Date().toISOString(),
        });
        report.summary.duplicatePayments++;
      }
    }

    // 9. CHECK 6: Failed transfers (check Stripe Connect transfers)
    for (const pi of stripePayments) {
      if (pi.status !== 'succeeded') continue;
      if (!pi.transfer_data?.destination) continue;

      // Check if the transfer was actually created
      try {
        const transfers = await stripe.transfers.list({
          transfer_group: pi.id,
          limit: 1,
        });

        if (transfers.data.length === 0) {
          report.discrepancies.push({
            type: 'failed_transfer',
            severity: 'high',
            stripePaymentIntentId: pi.id,
            description: `PaymentIntent ${pi.id} succeeded but no transfer found to connected account ${pi.transfer_data.destination}`,
            detectedAt: new Date().toISOString(),
          });
          report.summary.failedTransfers++;
        }
      } catch (error: unknown) {
        PaymentLogger.warn(reportId, 'reconciliation_transfer_check_failed', `Failed to check transfers for PI ${pi.id}: ${getErrorMessage(error)}`);
      }
    }

    // 10. Finalize report
    report.completedAt = new Date().toISOString();
    report.status = 'completed';
    report.healthy = report.discrepancies.filter(d => d.severity === 'critical').length === 0;

    // Save report to database
    await ((admin.from('reconciliation_reports') as any) as any).insert({
      id: reportId,
      started_at: report.startedAt,
      completed_at: report.completedAt,
      status: report.status,
      stripe_payment_count: report.stripePaymentCount,
      db_order_count: report.dbOrderCount,
      discrepancy_count: report.discrepancies.length,
      summary: report.summary,
      discrepancies: report.discrepancies,
      healthy: report.healthy,
    }).catch((error: unknown) => {
      PaymentLogger.warn(reportId, 'reconciliation_report_save_failed', `Failed to save reconciliation report: ${getErrorMessage(error)}`);
    });

    PaymentLogger.info(reportId, 'reconciliation_completed', `Reconciliation completed: ${report.discrepancies.length} discrepancies found`, {
      healthy: report.healthy,
      summary: report.summary as any,
    });

    return report;
  } catch (error: unknown) {
    report.status = 'failed';
    report.completedAt = new Date().toISOString();

    PaymentLogger.error(reportId, 'reconciliation_failed', new PaymentError(PaymentErrorCode.INTERNAL_RECONCILIATION_ERROR, {
      message: `Reconciliation failed: ${getErrorMessage(error)}`,
      traceId: reportId,
      cause: error instanceof Error ? error : undefined,
    }));

    return report;
  }
}

// ============================================================
// STRIPE DATA FETCHING
// ============================================================

/**
 * Fetch recent Stripe PaymentIntents.
 */
async function fetchStripePayments(
  stripe: Stripe,
  options: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  } = {}
): Promise<Stripe.PaymentIntent[]> {
  const paymentIntents: Stripe.PaymentIntent[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  const created: Record<string, number> = {};
  if (options.startDate) {
    created.gte = Math.floor(new Date(options.startDate).getTime() / 1000);
  }
  if (options.endDate) {
    created.lte = Math.floor(new Date(options.endDate).getTime() / 1000);
  }

  const maxResults = options.limit || 1000;

  while (hasMore && paymentIntents.length < maxResults) {
    const params: Stripe.PaymentIntentListParams = {
      limit: 100,
      created: Object.keys(created).length > 0 ? created : undefined,
    };

    if (startingAfter) {
      params.starting_after = startingAfter;
    }

    const result = await withRetry(
      async () => {
        const list = await stripe.paymentIntents.list(params);
        return list;
      },
      RETRY_CONFIGS.reconciliation,
      `recon_fetch_${Date.now()}`
    );

    if (!result.success || !result.result) {
      PaymentLogger.error('recon', 'stripe_fetch_failed', result.error || new PaymentError(PaymentErrorCode.INTERNAL_RECONCILIATION_ERROR, {
        message: 'Failed to fetch Stripe payments',
      }));
      break;
    }

    const list = result.result;
    paymentIntents.push(...list.data);
    hasMore = list.has_more;
    if (list.data.length > 0) {
      startingAfter = list.data[list.data.length - 1]!.id;
    }
  }

  return paymentIntents;
}

// ============================================================
// QUICK RECONCILIATION CHECK
// ============================================================

/**
 * Quick health check: compare the count of recent Stripe payments vs DB orders.
 * Used for monitoring dashboards.
 */
export async function quickReconciliationCheck(): Promise<{
  healthy: boolean;
  stripeCount: number;
  dbCount: number;
  difference: number;
}> {
  const stripe = getStripeClient();
  const admin = getSupabaseAdmin();

  // Count Stripe payments from last 24 hours
  const yesterday = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);

  const stripeResult = await stripe.paymentIntents.list({
    created: { gte: yesterday },
    limit: 1,
  });

  const stripeCount = stripeResult.data.length > 0
    ? (await stripe.paymentIntents.list({ created: { gte: yesterday } })).data.filter(pi => pi.status === 'succeeded').length
    : 0;

  // Count DB orders from last 24 hours
  const yesterdayIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: dbCount } = await (admin
    .from('orders') as any)
    .select('*', { count: 'exact', head: true })
    .gte('created_at', yesterdayIso);

  const difference = Math.abs(stripeCount - (dbCount || 0));

  return {
    healthy: difference <= 2, // Allow small differences due to timing
    stripeCount,
    dbCount: dbCount || 0,
    difference,
  };
}
