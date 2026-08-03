/**
 * @fileoverview Checkout Service
 *
 * Business logic for the checkout flow.
 * Extracted from the fat route handler in /api/checkout/create-session/route.ts.
 *
 * ARCHITECTURE: This service orchestrates the checkout process:
 *   1. Validate input (DTOs)
 *   2. Verify cart ownership
 *   3. Fetch products and validate availability
 *   4. Calculate totals and commission
 *   5. Create payment session
 *   6. Create Stripe PaymentIntent
 *   7. Create ledger entry
 *
 * The route handler now only does: parse request → call service → return response.
 */

import Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import { productRepository } from '@/repositories/product-repository';
import { cartRepository } from '@/repositories/cart-repository';
import { paymentSessionRepository } from '@/repositories/payment-session-repository';
import { auditLogRepository } from '@/repositories/audit-log-repository';
import { createLedgerEntry } from '@/lib/payment/ledger-service';
import { PaymentLogger } from '@/lib/payment/errors';
import { PaymentError, ErrorCode } from '@/lib/errors';
import {
  validateProductAvailability,
  validateSellerForPayment,
  validateCommission,
  validateSingleVendor,
  validateSessionExpiry,
} from '@/validators';
import {
  COMMISSION_RATE,
  SESSION_EXPIRY_MINUTES,
  MIN_ORDER_AMOUNT_CENTS,
  generateTraceId,
  type CheckoutItemDto,
} from '@/domain';
import type { SellerProfile } from '@/types';

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

export interface CheckoutResult {
  clientSecret: string;
  sessionId: string;
  traceId: string;
}

/**
 * Create a checkout session.
 *
 * This is the core business logic that was previously in the route handler.
 * The route handler now only handles HTTP concerns (request parsing, response formatting).
 */
export async function createCheckoutSession(
  userId: string,
  role: string,
  items: CheckoutItemDto[],
  traceId?: string
): Promise<CheckoutResult> {
  const tid = traceId || generateTraceId('ck');

  // Step 1: Validate input
  if (!items || items.length === 0) {
    throw new PaymentError({ message: 'No items provided for checkout', traceId: tid, code: ErrorCode.PAYMENT_CART_MISMATCH });
  }

  // Step 2: Verify cart ownership
  const productIds = items.map((i) => i.productId);

  if (role !== 'super_admin' && role !== 'admin') {
    const userCartProductIds = await cartRepository.getProductIdsByUserId(userId);
    const userCartSet = new Set(userCartProductIds);
    const unauthorizedItems = productIds.filter((id) => !userCartSet.has(id));

    if (unauthorizedItems.length > 0) {
      throw new PaymentError({
        message: 'Cart contains items not belonging to your account.',
        traceId: tid,
        code: ErrorCode.PAYMENT_CART_MISMATCH,
        context: { unauthorizedCount: unauthorizedItems.length },
      });
    }
  }

  // Step 3: Fetch products with seller data
  const products = await productRepository.findByIdsWithSeller(productIds);

  if (!products || products.length === 0) {
    throw new PaymentError({ message: 'System verification failed', traceId: tid, code: ErrorCode.DB_RPC_FAILED });
  }

  // Step 4: Validate each item
  let totalCents = 0;
  const sessionItems: Array<{ id: string; title: string; q: number; p_cents: number }> = [];
  const firstSellerId = products[0]?.seller_id;
  const sellerProfile = (products[0]?.profiles as SellerProfile | undefined);

  // 4a: Validate seller account
  const sellerValidation = validateSellerForPayment({
    stripeAccountId: sellerProfile?.stripe_account_id,
    stripeConnected: sellerProfile?.stripe_connected,
    sellerStatus: sellerProfile?.seller_status,
  });
  if (!sellerValidation.valid) {
    throw new PaymentError({
      message: sellerValidation.reason || 'Seller not eligible for payments',
      traceId: tid,
      code: ErrorCode.PAYMENT_SELLER_NOT_CONNECTED,
      context: { sellerId: firstSellerId },
    });
  }

  for (const item of items) {
    const p = products.find((prod) => prod.id === item.productId);

    if (!p) {
      throw new PaymentError({ message: `Product ${item.productId} not found`, traceId: tid, code: ErrorCode.PAYMENT_CART_MISMATCH, context: { productId: item.productId } });
    }

    // Product availability
    const availability = validateProductAvailability(
      { status: p.status, deletedAt: (p as unknown as Record<string, unknown>).deleted_at as string | null, stock: p.stock },
      item.quantity
    );
    if (!availability.valid) {
      throw new PaymentError({
        message: availability.reason || `Product "${p.title}" is not available`,
        traceId: tid,
        code: ErrorCode.PAYMENT_INSUFFICIENT_STOCK,
        context: { productId: p.id, title: p.title },
      });
    }

    // Single-vendor check
    if (p.seller_id !== firstSellerId) {
      throw new PaymentError({
        message: 'Multi-vendor checkout is not supported. Please check out from one seller at a time.',
        traceId: tid,
        code: ErrorCode.PAYMENT_CART_MISMATCH,
        context: { firstSellerId, currentSellerId: p.seller_id },
      });
    }

    // Server-side price calculation
    totalCents += p.price_cents * item.quantity;
    sessionItems.push({
      id: p.id,
      title: p.title,
      q: item.quantity,
      p_cents: p.price_cents,
    });
  }

  // Step 5: Validate minimum amount
  if (totalCents < MIN_ORDER_AMOUNT_CENTS) {
    throw new PaymentError({
      message: `Minimum order amount is $${MIN_ORDER_AMOUNT_CENTS / 100}`,
      traceId: tid,
      code: ErrorCode.PAYMENT_INVALID_AMOUNT,
      context: { totalCents },
    });
  }

  // Step 6: Validate commission calculation
  const commissionResult = validateCommission(totalCents, COMMISSION_RATE);
  if (!commissionResult.valid) {
    throw new PaymentError({
      message: commissionResult.reason || 'Commission calculation error',
      traceId: tid,
      code: ErrorCode.PAYMENT_INVALID_COMMISSION,
      context: { totalCents, commissionCents: commissionResult.commissionCents },
    });
  }

  // Step 7: Cancel stale sessions
  await paymentSessionRepository.cancelStaleSessions(userId);

  // Step 8: Create payment session
  const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const session = await paymentSessionRepository.create({
    userId,
    items: sessionItems as unknown as unknown as Record<string, unknown>[],
    amountTotalCents: totalCents,
    status: 'pending',
    expiresAt,
  });

  // Step 9: Create Stripe PaymentIntent
  const stripe = getStripe();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalCents,
    currency: 'usd',
    application_fee_amount: commissionResult.commissionCents,
    transfer_data: { destination: sellerProfile!.stripe_account_id! },
    metadata: {
      sessionId: session.id,
      traceId: tid,
      userId,
      commissionRate: COMMISSION_RATE.toString(),
      itemCount: sessionItems.length.toString(),
    },
  });

  // Step 10: Create financial ledger entry
  await createLedgerEntry({
    event_type: 'payment_created',
    order_id: '',
    payment_intent_id: paymentIntent.id,
    amount_cents: totalCents,
    currency: 'usd',
    trace_id: tid,
    metadata: {
      sessionId: session.id,
      type: 'checkout',
      commissionCents: commissionResult.commissionCents,
      itemCount: sessionItems.length,
    },
  });

  PaymentLogger.info(tid, 'checkout_session_created', `Payment session created: ${session.id}`, {
    sessionId: session.id,
    paymentIntentId: paymentIntent.id,
    totalCents,
    commissionCents: commissionResult.commissionCents,
    itemCount: sessionItems.length,
    expiresAt,
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    sessionId: session.id,
    traceId: tid,
  };
}
