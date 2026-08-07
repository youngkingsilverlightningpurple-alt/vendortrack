/**
 * @fileoverview Enterprise Stripe Webhook Orchestrator
 *
 * REFACTORED: Thin route handler that delegates to services.
 * This file only handles: signature verification → idempotency → dispatch.
 * All business logic lives in the service and repository layers.
 *
 * CRITICAL: No webhook may process twice.
 * CRITICAL: No refund may exist in the database without Stripe.
 */

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import { PaymentLogger } from '@/lib/payment/errors';
import { createLedgerEntry } from '@/lib/payment/ledger-service';
import { enqueueJob } from '@/lib/payment/queue';
import { getErrorMessage } from '@/types';
import { paymentSessionRepository } from '@/repositories/payment-session-repository';
import { orderRepository } from '@/repositories/order-repository';
import { auditLogRepository } from '@/repositories/audit-log-repository';
import { toAppError, AppError, ErrorCode } from '@/lib/errors';

// Stripe singleton
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'), {
      apiVersion: '2024-06-20',
    });
  }
  return _stripe;
}

const MAX_EVENT_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get('stripe-signature')!;
  const stripe = getStripe();

  let event: Stripe.Event;

  // Step 1: Verify webhook signature
  try {
    event = stripe.webhooks.constructEvent(body, signature, requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch (error: unknown) {
    PaymentLogger.critical('webhook', 'WEBHOOK_SIGNATURE_INVALID', `Webhook signature verification failed: ${getErrorMessage(error)}`);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  const traceId = `wh_${event.id}_${Date.now()}`;

  // Step 2: Replay protection — reject old events
  const eventAge = Date.now() - (event.created * 1000);
  if (eventAge > MAX_EVENT_AGE_MS) {
    PaymentLogger.warn(traceId, 'webhook_replay_rejected', `Rejecting event ${event.id} — too old (${Math.round(eventAge / 1000)}s)`, {
      eventId: event.id,
      eventType: event.type,
      eventAgeMs: eventAge,
    });
    return NextResponse.json({ received: true, info: 'Event too old' });
  }

  // Step 3: ATOMIC idempotency check
  const { inserted } = await auditLogRepository.insertProcessedEvent(event.id);

  if (!inserted) {
    PaymentLogger.info(traceId, 'webhook_duplicate', `Event ${event.id} already processed — skipping`, {
      eventId: event.id,
      eventType: event.type,
    });
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Step 4: Process the event
  PaymentLogger.info(traceId, 'webhook_received', `Processing Stripe event: ${event.type}`, {
    eventId: event.id,
    eventType: event.type,
  });

  if (event.type === 'payment_intent.succeeded') {
    await handlePaymentIntentSucceeded(event, traceId, stripe);
  } else if (event.type === 'charge.refunded') {
    await handleChargeRefunded(event, traceId);
  } else if (event.type === 'payment_intent.payment_failed') {
    await handlePaymentIntentFailed(event, traceId);
  } else if (event.type === 'charge.dispute.created') {
    await handleDisputeCreated(event, traceId);
  } else {
    PaymentLogger.info(traceId, 'webhook_unhandled', `Unhandled event type: ${event.type}`, {
      eventId: event.id,
    });
  }

  return NextResponse.json({ received: true });
}

// ============================================================
// HANDLER: payment_intent.succeeded
// ============================================================

async function handlePaymentIntentSucceeded(
  event: Stripe.Event,
  traceId: string,
  stripe: Stripe
) {
  const pi = event.data.object as Stripe.PaymentIntent;
  const sessionId = (pi.metadata?.sessionId as string) || '';
  const piTraceId = (pi.metadata?.traceId as string) || '';
  const effectiveTraceId = piTraceId || traceId;

  try {
    // Step 4a: Strict session verification
    const session = await paymentSessionRepository.findById(sessionId);
    if (!session) {
      throw new AppError(ErrorCode.PAYMENT_CART_MISMATCH, {
        message: `RECONCILIATION_FAILED: Payment session record missing for session ${sessionId}`,
        traceId: effectiveTraceId,
        context: { sessionId, paymentIntentId: pi.id },
      });
    }

    // Step 4b: Amount verification
    if (session.amountTotalCents !== pi.amount) {
      throw new AppError(ErrorCode.PAYMENT_PRICE_MISMATCH, {
        message: `SECURITY_MISMATCH: Stripe amount (${pi.amount}) != session amount (${session.amountTotalCents})`,
        traceId: effectiveTraceId,
        context: { sessionId, stripeAmount: pi.amount, sessionAmount: session.amountTotalCents },
      });
    }

    // Step 4c: Session status check
    if (session.status !== 'pending') {
      PaymentLogger.info(effectiveTraceId, 'webhook_session_already_processed', `Session ${sessionId} already has status: ${session.status}`, {
        sessionId,
        status: session.status,
      });
      return;
    }

    // Step 4d: Expiry check
    if (new Date(session.expiresAt) < new Date()) {
      throw new AppError(ErrorCode.PAYMENT_SESSION_EXPIRED, {
        message: `Session ${sessionId} has expired — initiating auto-refund`,
        traceId: effectiveTraceId,
        context: { sessionId, expiresAt: session.expiresAt },
      });
    }

    // Step 4e: Atomic Fulfillment via PostgreSQL RPC
    await orderRepository.fulfillOrder(sessionId, pi.id, effectiveTraceId);

    // Step 4f: Queue background jobs (non-blocking)
    await enqueueJob({
      jobType: 'notification',
      payload: { type: 'payment_success_buyer', sessionId, paymentIntentId: pi.id, amount: pi.amount },
      traceId: effectiveTraceId,
    });

    await enqueueJob({
      jobType: 'notification',
      payload: { type: 'payment_success_seller', sessionId, paymentIntentId: pi.id, amount: pi.amount },
      traceId: effectiveTraceId,
    });

    await enqueueJob({
      jobType: 'analytics',
      payload: { type: 'payment_completed', sessionId, paymentIntentId: pi.id, amount: pi.amount },
      traceId: effectiveTraceId,
    });

    PaymentLogger.info(effectiveTraceId, 'webhook_fulfillment_success', `Payment fulfilled successfully for PI ${pi.id}`, {
      paymentIntentId: pi.id,
      sessionId,
      amount: pi.amount,
    });

  } catch (criticalError: unknown) {
    const appError = toAppError(criticalError, effectiveTraceId);

    PaymentLogger.critical(effectiveTraceId, 'webhook_fulfillment_failure', `Fulfillment failure — initiating safety refund. Error: ${appError.message}`, {
      paymentIntentId: pi.id,
      sessionId,
      errorCode: appError.code,
    });

    // SAFETY REFUND: Any failure here triggers a Stripe reversal
    try {
      const refund = await stripe.refunds.create({
        payment_intent: pi.id,
        metadata: {
          failure_reason: appError.message.substring(0, 500),
          trace_id: effectiveTraceId,
          recovery_action: 'AUTO_REFUND_ON_SYSTEM_FAILURE',
          original_event_id: event.id,
        },
      });

      await paymentSessionRepository.updateStatus(sessionId, 'failed');

      // Derive order_id from payment intent metadata or lookup
      const orderIdFromMeta = pi.metadata?.orderId || '';
      await createLedgerEntry({
        event_type: 'refund_completed',
        order_id: orderIdFromMeta,
        payment_intent_id: pi.id,
        stripe_refund_id: refund.id,
        amount_cents: pi.amount,
        currency: 'usd',
        trace_id: effectiveTraceId,
        metadata: {
          type: 'auto_refund_on_failure',
          reason: appError.code,
          original_event_id: event.id,
        },
      });

      await auditLogRepository.insert({
        traceId: effectiveTraceId,
        eventType: 'SYSTEM_FAILURE_REFUND',
        severity: 'CRITICAL',
        payload: {
          reason: appError.message,
          pi: pi.id,
          refundId: refund.id,
          errorCode: appError.code,
        },
      });

    } catch (refundError: unknown) {
      PaymentLogger.critical(effectiveTraceId, 'webhook_auto_refund_failed', `AUTO-REFUND FAILED for PI ${pi.id} — MANUAL INTERVENTION REQUIRED`, {
        paymentIntentId: pi.id,
        originalError: appError.message,
        refundError: getErrorMessage(refundError),
      });

      await paymentSessionRepository.updateStatus(sessionId, 'failed');

      await auditLogRepository.insert({
        traceId: effectiveTraceId,
        eventType: 'AUTO_REFUND_FAILED_MANUAL_INTERVENTION_REQUIRED',
        severity: 'CRITICAL',
        payload: {
          reason: appError.message,
          refundError: getErrorMessage(refundError),
          pi: pi.id,
          sessionId,
        },
      });
    }
  }
}

// ============================================================
// HANDLER: charge.refunded
// ============================================================

async function handleChargeRefunded(event: Stripe.Event, traceId: string) {
  const charge = event.data.object as Stripe.Charge;
  const paymentIntentId = charge.payment_intent as string;

  PaymentLogger.info(traceId, 'webhook_charge_refunded', `Charge refunded for PI ${paymentIntentId}`, {
    paymentIntentId,
    chargeId: charge.id,
    amountRefunded: charge.amount_refunded,
  });

  try {
    // Derive order_id from charge's payment intent metadata
    const orderIdFromCharge = (charge as any).metadata?.orderId || '';
    await createLedgerEntry({
      event_type: 'refund_completed',
      order_id: orderIdFromCharge,
      payment_intent_id: paymentIntentId,
      amount_cents: charge.amount_refunded,
      currency: charge.currency || 'usd',
      trace_id: traceId,
      metadata: {
        type: 'stripe_initiated_refund',
        chargeId: charge.id,
        eventId: event.id,
      },
    });
  } catch (error: unknown) {
    PaymentLogger.warn(traceId, 'webhook_refund_ledger_failed', `Failed to create refund ledger entry: ${getErrorMessage(error)}`);
  }
}

// ============================================================
// HANDLER: payment_intent.payment_failed
// ============================================================

async function handlePaymentIntentFailed(event: Stripe.Event, traceId: string) {
  const pi = event.data.object as Stripe.PaymentIntent;

  PaymentLogger.warn(traceId, 'webhook_payment_failed', `Payment failed for PI ${pi.id}`, {
    paymentIntentId: pi.id,
    lastPaymentError: pi.last_payment_error?.message,
  });

  const sessionId = pi.metadata?.sessionId;
  if (sessionId) {
    await paymentSessionRepository.updateStatus(sessionId, 'failed');
  }

  try {
    // Derive order_id from payment intent metadata
    const orderIdFromFailedPI = pi.metadata?.orderId || '';
    await createLedgerEntry({
      event_type: 'payment_created',
      order_id: orderIdFromFailedPI,
      payment_intent_id: pi.id,
      amount_cents: pi.amount,
      currency: pi.currency || 'usd',
      trace_id: traceId,
      metadata: {
        type: 'payment_failed',
        lastPaymentError: pi.last_payment_error?.message,
        eventId: event.id,
      },
    });
  } catch (error: unknown) {
    PaymentLogger.warn(traceId, 'webhook_failed_ledger_error', `Failed to create payment_failed ledger entry: ${getErrorMessage(error)}`);
  }
}

// ============================================================
// HANDLER: charge.dispute.created
// ============================================================

async function handleDisputeCreated(event: Stripe.Event, traceId: string) {
  const dispute = event.data.object as Stripe.Dispute;

  PaymentLogger.critical(traceId, 'webhook_dispute_created', `Dispute created for charge ${dispute.charge}`, {
    disputeId: dispute.id,
    chargeId: String(dispute.charge),
    amount: dispute.amount,
    reason: dispute.reason,
    status: dispute.status,
  });

  try {
    // Derive order_id from dispute's charge metadata
    const orderIdFromDispute = (dispute.metadata as Record<string, string>)?.orderId || '';
    await createLedgerEntry({
      event_type: 'dispute',
      order_id: orderIdFromDispute,
      payment_intent_id: dispute.payment_intent as string || '',
      amount_cents: dispute.amount,
      currency: dispute.currency || 'usd',
      trace_id: traceId,
      metadata: {
        type: 'dispute',
        disputeId: dispute.id,
        chargeId: String(dispute.charge),
        reason: dispute.reason,
        status: dispute.status,
        eventId: event.id,
      },
    });
  } catch (error: unknown) {
    PaymentLogger.warn(traceId, 'webhook_dispute_ledger_error', `Failed to create dispute ledger entry: ${getErrorMessage(error)}`);
  }

  await auditLogRepository.insert({
    traceId,
    eventType: 'DISPUTE_CREATED',
    severity: 'CRITICAL',
    payload: {
      disputeId: dispute.id,
      chargeId: String(dispute.charge),
      amount: dispute.amount,
      reason: dispute.reason,
    },
  });
}
