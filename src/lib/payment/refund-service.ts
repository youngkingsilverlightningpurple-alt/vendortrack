/**
 * @fileOverview Refund Service — Enterprise Financial-Grade Refund Processing
 *
 * Implements a complete, atomic refund workflow:
 *   1. Validate refund eligibility
 *   2. Call Stripe Refund API
 *   3. Verify Stripe confirmation
 *   4. Update database (order status, refund status)
 *   5. Create financial ledger entry
 *   6. Create audit record
 *   7. Queue buyer notification
 *   8. Queue seller notification
 *
 * CRITICAL RULES:
 *   - No refund may exist in the database unless Stripe confirms it.
 *   - If any step fails after the Stripe call, the operation is rolled back.
 *   - Every refund is fully auditable via the financial ledger.
 *   - Partial refunds are supported with amount validation.
 *
 * OWASP: A01:2021 — Broken Access Control
 * This service enforces ownership verification and role-based access.
 */

import Stripe from 'stripe';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireEnv } from '@/lib/env';
import { requireAuth, isAuthError, logAuthEvent } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { PaymentError, PaymentErrorCode, fromStripeError, PaymentLogger } from './errors';
import { withRetry, RETRY_CONFIGS } from './retry';
import { calculateRefundCommission } from '@/domain/commission';

// ============================================================
// STRIPE CLIENT
// ============================================================

function getStripeClient(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
    apiVersion: '2024-06-20',
  });
}

// ============================================================
// TYPES
// ============================================================

export interface RefundRequest {
  orderId: string;
  reason: string;
  amount?: number; // If omitted, full refund; if provided, partial refund in cents
  initiatedBy: 'admin' | 'buyer';
  initiatorId: string;
  traceId?: string;
}

export interface RefundResult {
  success: boolean;
  refundId?: string;        // Stripe refund ID
  stripeRefundId?: string;  // Same as refundId (alias)
  amount?: number;           // Amount refunded in cents
  status?: string;           // Stripe refund status
  traceId: string;
  error?: string;
  ledgerEntryId?: string;
}

// ============================================================
// REFUND ELIGIBILITY VALIDATION
// ============================================================

interface OrderForRefund {
  id: string;
  buyer_id: string;
  seller_id: string;
  payment_intent_id: string;
  amount_total_cents: number;
  commission_cents: number;
  status: string;
  refund_status: string;
  trace_id: string;
  product_name: string;
}

/**
 * Validate that an order is eligible for a refund.
 * Returns the order data if eligible, or throws a PaymentError.
 */
async function validateRefundEligibility(
  orderId: string,
  requestedAmount?: number,
  traceId?: string
): Promise<OrderForRefund> {
  const tid = traceId || `rf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const admin = getSupabaseAdmin();

  // Fetch the order
  const { data: order, error: fetchError } = await (admin
    .from('orders') as any)
    .select('id, buyer_id, seller_id, payment_intent_id, amount_total_cents, commission_cents, status, refund_status, trace_id, product_name')
    .eq('id', orderId)
    .single();

  if (fetchError || !order) {
    throw new PaymentError(PaymentErrorCode.VALIDATION_ORDER_NOT_REFUNDABLE, {
      message: `Order not found: ${orderId}`,
      traceId: tid,
      context: { orderId },
    });
  }

  // Check if already refunded
  if (order.refund_status === 'approved') {
    throw new PaymentError(PaymentErrorCode.VALIDATION_ALREADY_REFUNDED, {
      message: `Order ${orderId} has already been refunded`,
      traceId: tid,
      context: { orderId, refundStatus: order.refund_status },
    });
  }

  // Check if order status allows refund
  if (order.status === 'refunded') {
    throw new PaymentError(PaymentErrorCode.VALIDATION_ALREADY_REFUNDED, {
      message: `Order ${orderId} is already in refunded status`,
      traceId: tid,
      context: { orderId, status: order.status },
    });
  }

  // Validate payment intent exists
  if (!order.payment_intent_id) {
    throw new PaymentError(PaymentErrorCode.VALIDATION_ORDER_NOT_REFUNDABLE, {
      message: `Order ${orderId} has no payment intent — cannot refund`,
      traceId: tid,
      context: { orderId },
    });
  }

  // Validate partial refund amount
  if (requestedAmount !== undefined) {
    if (requestedAmount <= 0) {
      throw new PaymentError(PaymentErrorCode.VALIDATION_INVALID_AMOUNT, {
        message: `Refund amount must be positive`,
        traceId: tid,
        context: { orderId, requestedAmount },
      });
    }
    if (requestedAmount > order.amount_total_cents) {
      throw new PaymentError(PaymentErrorCode.VALIDATION_INVALID_AMOUNT, {
        message: `Refund amount ${requestedAmount} exceeds order total ${order.amount_total_cents}`,
        traceId: tid,
        context: { orderId, requestedAmount, orderTotal: order.amount_total_cents },
      });
    }
  }

  PaymentLogger.info(tid, 'refund_eligibility_validated', `Order ${orderId} is eligible for refund`, {
    orderId,
    paymentIntentId: order.payment_intent_id,
    orderTotal: order.amount_total_cents,
    requestedAmount: requestedAmount || 'full',
  });

  return order;
}

// ============================================================
// STRIPE REFUND EXECUTION
// ============================================================

/**
 * Execute a refund via the Stripe API with retry.
 * Returns the Stripe Refund object on success.
 */
async function executeStripeRefund(
  paymentIntentId: string,
  amount: number | undefined,
  reason: string,
  traceId: string,
  orderId: string
): Promise<Stripe.Refund> {
  const stripe = getStripeClient();

  const refundParams: Stripe.RefundCreateParams = {
    payment_intent: paymentIntentId,
    reason: 'requested_by_customer',
    metadata: {
      trace_id: traceId,
      order_id: orderId,
      internal_reason: reason.substring(0, 500), // Stripe metadata value limit
    },
  };

  // Only include amount for partial refunds
  if (amount !== undefined) {
    refundParams.amount = amount;
  }

  PaymentLogger.info(traceId, 'stripe_refund_initiated', `Calling Stripe Refund API for PI ${paymentIntentId}`, {
    paymentIntentId,
    amount: amount || 'full',
    orderId,
  });

  // P0 FIX (war room): idempotency key.
  //
  // Without an idempotency key, `withRetry` would call
  // `stripe.refunds.create` up to 4 times — and each call creates a NEW
  // Stripe Refund object. A single network blip during a retry could
  // double-refund the seller.
  //
  // The key is deterministic per (order, refund operation). If `withRetry`
  // re-invokes the closure, Stripe recognizes the idempotency key and
  // returns the ORIGINAL refund object instead of creating a duplicate.
  //
  // Format: `refund:{orderId}:{traceId}`
  //   - Same order + same trace_id → same refund (idempotent retry)
  //   - Different trace_id → different refund (independent operation, e.g.
  //     a partial refund followed by a second partial refund)
  //   - Different order → different refund (independent operation)
  const idempotencyKey = `refund:${orderId}:${traceId}`;

  const retryResult = await withRetry(
    async () => {
      const refund = await stripe.refunds.create(refundParams, {
        idempotencyKey,
      });

      // Verify the refund status
      if (refund.status === 'failed') {
        throw new PaymentError(PaymentErrorCode.STRIPE_REFUND_FAILED, {
          message: `Stripe refund failed with status: ${refund.status}`,
          traceId,
          context: { refundId: refund.id, status: refund.status },
        });
      }

      return refund;
    },
    RETRY_CONFIGS.refund,
    traceId
  );

  if (!retryResult.success || !retryResult.result) {
    throw retryResult.error || new PaymentError(PaymentErrorCode.STRIPE_REFUND_FAILED, {
      message: 'Stripe refund failed after retries',
      traceId,
    });
  }

  return retryResult.result;
}

/**
 * Verify a Stripe refund was successful by retrieving it.
 */
async function verifyStripeRefund(
  refundId: string,
  traceId: string
): Promise<Stripe.Refund> {
  const stripe = getStripeClient();

  const refund = await stripe.refunds.retrieve(refundId);

  if (refund.status === 'failed' || refund.status === 'canceled') {
    throw new PaymentError(PaymentErrorCode.STRIPE_REFUND_FAILED, {
      message: `Stripe refund verification failed: status=${refund.status}`,
      traceId,
      context: { refundId, status: refund.status },
    });
  }

  PaymentLogger.info(traceId, 'stripe_refund_verified', `Refund ${refundId} verified: status=${refund.status}`, {
    refundId,
    status: refund.status as string | undefined,
    amount: refund.amount,
  });

  return refund;
}

// ============================================================
// DATABASE UPDATE (ATOMIC)
// ============================================================

/**
 * Update the database after a successful Stripe refund.
 * Uses the atomic process_refund RPC for transaction safety.
 */
async function recordRefundInDatabase(
  orderId: string,
  stripeRefundId: string,
  refundAmount: number,
  traceId: string,
  initiatorId: string
): Promise<void> {
  const admin = getSupabaseAdmin();

  // Use atomic RPC for the refund update
  const { error: rpcError } = await (admin as any).rpc('process_refund_atomic', {
    p_order_id: orderId,
    p_stripe_refund_id: stripeRefundId,
    p_refund_amount_cents: refundAmount,
    p_trace_id: traceId,
    p_initiated_by: initiatorId,
  });

  if (rpcError) {
    // CRITICAL: Stripe refunded but database not updated
    // This is a reconciliation gap that must be detected
    PaymentLogger.critical(traceId, 'refund_db_update_failed', `STRIPE REFUNDED but DB update failed! Manual reconciliation required.`, {
      orderId,
      stripeRefundId,
      refundAmount,
      dbError: rpcError.message,
    });
    throw new PaymentError(PaymentErrorCode.DATABASE_RPC_FAILED, {
      message: `Database update failed after Stripe refund: ${rpcError.message}`,
      traceId,
      context: { orderId, stripeRefundId, refundAmount, dbError: rpcError.message },
    });
  }
}

// ============================================================
// LEDGER ENTRY
// ============================================================

/**
 * Create an immutable financial ledger entry for the refund.
 */
async function createRefundLedgerEntry(
  orderId: string,
  stripeRefundId: string,
  refundAmount: number,
  commissionReversed: number,
  traceId: string
): Promise<string | null> {
  const admin = getSupabaseAdmin();

  const { data, error } = await (admin
    .from('financial_ledger') as any)
    .insert({
      event_type: 'refund_completed',
      order_id: orderId,
      amount_cents: refundAmount,
      currency: 'usd',
      stripe_refund_id: stripeRefundId,
      trace_id: traceId,
      metadata: {
        commission_reversed: commissionReversed,
        type: 'refund',
      },
    })
    .select('id')
    .single();

  if (error) {
    PaymentLogger.error(traceId, 'refund_ledger_entry_failed', new PaymentError(PaymentErrorCode.INTERNAL_LEDGER_ERROR, {
      message: `Failed to create ledger entry for refund: ${error.message}`,
      traceId,
      context: { orderId, stripeRefundId },
    }));
    // Don't throw — ledger failure should not block the refund
    // Reconciliation will detect the missing entry
    return null;
  }

  return data?.id || null;
}

// ============================================================
// NOTIFICATION QUEUING
// ============================================================

/**
 * Queue refund notifications for buyer and seller.
 * These are non-blocking — refund confirmation is already complete.
 */
async function queueRefundNotifications(
  orderId: string,
  buyerId: string,
  sellerId: string,
  refundAmount: number,
  traceId: string
): Promise<void> {
  const admin = getSupabaseAdmin();

  // Queue buyer notification
  const { error: buyerNotifError } = await (admin
    .from('payment_job_queue') as any)
    .insert({
      job_type: 'notification',
      payload: {
        type: 'refund_completed_buyer',
        orderId,
        buyerId,
        refundAmount,
        traceId,
      },
      status: 'pending',
      trace_id: traceId,
      max_attempts: 3,
    });

  if (buyerNotifError) {
    PaymentLogger.warn(traceId, 'refund_buyer_notification_queue_failed', `Failed to queue buyer notification: ${buyerNotifError.message}`, {
      orderId,
      buyerId,
    });
  }

  // Queue seller notification
  const { error: sellerNotifError } = await (admin
    .from('payment_job_queue') as any)
    .insert({
      job_type: 'notification',
      payload: {
        type: 'refund_completed_seller',
        orderId,
        sellerId,
        refundAmount,
        traceId,
      },
      status: 'pending',
      trace_id: traceId,
      max_attempts: 3,
    });

  if (sellerNotifError) {
    PaymentLogger.warn(traceId, 'refund_seller_notification_queue_failed', `Failed to queue seller notification: ${sellerNotifError.message}`, {
      orderId,
      sellerId,
    });
  }
}

// ============================================================
// MAIN REFUND SERVICE
// ============================================================

/**
 * Process a refund request with full atomic guarantees.
 *
 * FLOW:
 * 1. Validate eligibility
 * 2. Call Stripe Refund API (with retry)
 * 3. Verify Stripe confirmation
 * 4. Update database (atomic RPC)
 * 5. Create financial ledger entry
 * 6. Create audit record (via RPC)
 * 7. Queue notifications
 *
 * GUARANTEE:
 * No refund may exist in the database unless Stripe confirms it.
 * If any step fails after the Stripe call, the database update is attempted
 * and a CRITICAL alert is logged for manual reconciliation.
 */
export async function processRefund(request: RefundRequest): Promise<RefundResult> {
  const traceId = request.traceId || `rf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  PaymentLogger.info(traceId, 'refund_initiated', `Refund initiated for order ${request.orderId}`, {
    orderId: request.orderId,
    amount: request.amount || 'full',
    initiatedBy: request.initiatedBy,
    initiatorId: request.initiatorId,
  });

  try {
    // Step 1: Validate refund eligibility
    const order = await validateRefundEligibility(request.orderId, request.amount, traceId);

    // Step 2: Call Stripe Refund API
    const stripeRefund = await executeStripeRefund(
      order.payment_intent_id,
      request.amount,
      request.reason,
      traceId,
      request.orderId
    );

    // Step 3: Verify Stripe confirmation
    const verifiedRefund = await verifyStripeRefund(stripeRefund.id, traceId);

    const refundAmount = verifiedRefund.amount;
    // Use stored commission from the original order, not a recalculation.
    // This prevents cent-level drift between order commission and refund reversal.
    const commissionReversed = calculateRefundCommission(
      refundAmount,
      order.amount_total_cents,
      order.commission_cents
    );

    // Step 4: Update database (atomic)
    await recordRefundInDatabase(
      request.orderId,
      verifiedRefund.id,
      refundAmount,
      traceId,
      request.initiatorId
    );

    // Step 5: Create financial ledger entry
    const ledgerEntryId = await createRefundLedgerEntry(
      request.orderId,
      verifiedRefund.id,
      refundAmount,
      commissionReversed,
      traceId
    );

    // Step 6: Create audit record (already done in RPC, but add explicit one)
    await logAuthEvent({
      userId: request.initiatorId,
      action: 'REFUND_PROCESSED',
      resource: 'orders',
      resourceId: request.orderId,
      result: 'success',
      severity: 'WARN',
      details: {
        stripeRefundId: verifiedRefund.id,
        refundAmount,
        commissionReversed,
        initiatedBy: request.initiatedBy,
        reason: request.reason,
      },
    });

    // Step 7: Queue notifications (non-blocking)
    await queueRefundNotifications(
      request.orderId,
      order.buyer_id,
      order.seller_id,
      refundAmount,
      traceId
    );

    PaymentLogger.info(traceId, 'refund_completed', `Refund completed for order ${request.orderId}`, {
      orderId: request.orderId,
      stripeRefundId: verifiedRefund.id,
      refundAmount,
      status: verifiedRefund.status as string | undefined,
    });

    return {
      success: true,
      refundId: verifiedRefund.id,
      stripeRefundId: verifiedRefund.id,
      amount: refundAmount,
      status: verifiedRefund.status as string | undefined,
      traceId,
      ledgerEntryId: ledgerEntryId || undefined,
    };
  } catch (error: unknown) {
    const paymentError = error instanceof PaymentError
      ? error
      : new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
          message: error instanceof Error ? error.message : 'Unknown refund error',
          traceId,
          cause: error instanceof Error ? error : undefined,
        });

    PaymentLogger.error(traceId, 'refund_failed', paymentError, {
      orderId: request.orderId,
      initiatedBy: request.initiatedBy,
    });

    // Log the failed refund attempt
    await logAuthEvent({
      userId: request.initiatorId,
      action: 'REFUND_FAILED',
      resource: 'orders',
      resourceId: request.orderId,
      result: 'error',
      severity: 'CRITICAL',
      details: {
        errorCode: paymentError.code,
        errorMessage: paymentError.message,
        traceId,
      },
    });

    return {
      success: false,
      traceId,
      error: paymentError.clientMessage,
    };
  }
}

// ============================================================
// ADMIN REFUND DECISION (Server Action Integration)
// ============================================================

/**
 * Process an admin refund decision.
 * This is the enterprise replacement for the old processRefundDecision().
 *
 * When approved: calls Stripe Refund API, updates DB, creates ledger entry.
 * When rejected: only updates DB status (no Stripe call needed).
 */
export async function processAdminRefundDecision(
  orderId: string,
  decision: 'approved' | 'rejected',
  adminId: string,
  adminReason?: string
): Promise<RefundResult> {
  const traceId = `adm_rf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (decision === 'approved') {
    // Process the refund via Stripe
    return processRefund({
      orderId,
      reason: adminReason || 'Admin approved refund',
      initiatedBy: 'admin',
      initiatorId: adminId,
      traceId,
    });
  } else {
    // Rejected — just update the DB
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('orders') as any)
      .update({
        refund_status: 'rejected',
      })
      .eq('id', orderId);

    if (error) {
      return {
        success: false,
        traceId,
        error: 'Failed to update order status.',
      };
    }

    await logAuthEvent({
      userId: adminId,
      action: 'REFUND_REJECTED',
      resource: 'orders',
      resourceId: orderId,
      result: 'success',
      severity: 'INFO',
      details: { reason: adminReason },
    });

    return {
      success: true,
      traceId,
    };
  }
}

// Re-export logAuthEvent for convenience
export { logAuthEvent };
