/**
 * @fileoverview Centralized Validation Library
 *
 * Reusable validation schemas and utilities for the entire application.
 * All validation logic is centralized here — no page or component should
 * contain inline validation rules.
 *
 * ARCHITECTURE RULES:
 *   - Validators are pure functions (no I/O, no side effects)
 *   - Validators use Zod schemas for runtime validation
 *   - Validators return structured results (never throw)
 *   - Complex business rules are expressed as composed validators
 */

import { z } from 'zod';

// ============================================================
// COMMON SCHEMAS
// ============================================================

/** UUID validation */
export const uuidSchema = z.string().uuid('Invalid ID format');

/** Pagination parameters */
export const paginationSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(100).default(20),
});

/** Date range filter */
export const dateRangeSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/** Non-empty string */
export const nonEmptyString = z.string().min(1).transform(s => s.trim());

/** Price in cents (positive integer) */
export const priceCentsSchema = z.number().int().min(50, 'Minimum price is $0.50').max(10000000, 'Maximum price is $100,000');

/** Email validation */
export const emailSchema = z.string().email('Invalid email format');

/** URL validation */
export const urlSchema = z.string().url('Invalid URL format');

// ============================================================
// BUSINESS RULE VALIDATORS
// ============================================================

/** Validate that a product can be purchased */
export function validateProductAvailability(product: {
  status: string;
  deletedAt?: string | null;
  stock: number;
}, requestedQty: number): { valid: boolean; reason?: string } {
  if (product.status !== 'active') {
    return { valid: false, reason: 'Product is not available' };
  }
  if (product.deletedAt) {
    return { valid: false, reason: 'Product has been removed' };
  }
  if (product.stock < requestedQty) {
    return { valid: false, reason: `Insufficient stock: ${product.stock} available, ${requestedQty} requested` };
  }
  return { valid: true };
}

/** Validate that a seller is eligible for payments */
export function validateSellerForPayment(seller: {
  stripeAccountId?: string | null;
  stripeConnected?: boolean | null;
  sellerStatus?: string | null;
}): { valid: boolean; reason?: string } {
  if (!seller.stripeAccountId || !seller.stripeConnected) {
    return { valid: false, reason: 'Seller has not connected their Stripe account' };
  }
  if (seller.sellerStatus !== 'approved') {
    return { valid: false, reason: 'Seller account is not approved' };
  }
  return { valid: true };
}

/** Validate commission calculation */
export function validateCommission(totalCents: number, commissionRate: number = 0.10): { valid: boolean; commissionCents: number; reason?: string } {
  const commissionCents = Math.round(totalCents * commissionRate);
  const sellerTransfer = totalCents - commissionCents;

  if (sellerTransfer <= 0) {
    return { valid: false, commissionCents, reason: `Commission (${commissionCents}) exceeds total (${totalCents})` };
  }
  return { valid: true, commissionCents };
}

/** Validate that a payment session is still valid */
export function validateSessionExpiry(expiresAt: string): { valid: boolean; reason?: string } {
  if (new Date(expiresAt) < new Date()) {
    return { valid: false, reason: 'Payment session has expired' };
  }
  return { valid: true };
}

/** Validate that all items belong to the same seller (single-vendor check) */
export function validateSingleVendor(items: Array<{ sellerId: string }>): { valid: boolean; sellerId?: string; reason?: string } {
  if (items.length === 0) {
    return { valid: false, reason: 'No items provided' };
  }
  const firstSellerId = items[0]!.sellerId;
  const mismatch = items.find(item => item.sellerId !== firstSellerId);
  if (mismatch) {
    return { valid: false, sellerId: firstSellerId, reason: 'Multi-vendor checkout is not supported' };
  }
  return { valid: true, sellerId: firstSellerId };
}

/** Validate ownership of a resource */
export function validateOwnership(userId: string, resourceOwnerId: string, isAdmin: boolean): { valid: boolean; reason?: string } {
  if (isAdmin) return { valid: true };
  if (userId !== resourceOwnerId) {
    return { valid: false, reason: 'You do not own this resource' };
  }
  return { valid: true };
}

/** Validate order status transition */
const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['shipped', 'refunded'],
  shipped: ['delivered', 'refunded'],
  delivered: ['refunded'],
  refunded: [],
};

export function validateOrderStatusTransition(currentStatus: string, newStatus: string): { valid: boolean; reason?: string } {
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed) {
    return { valid: false, reason: `Unknown current status: ${currentStatus}` };
  }
  if (!allowed.includes(newStatus)) {
    return { valid: false, reason: `Cannot transition from ${currentStatus} to ${newStatus}` };
  }
  return { valid: true };
}

/** Validate refund eligibility */
export function validateRefundEligibility(order: {
  status: string;
  refundStatus?: string | null;
}): { valid: boolean; reason?: string } {
  if (order.refundStatus === 'approved') {
    return { valid: false, reason: 'Refund already approved' };
  }
  if (order.refundStatus === 'requested') {
    return { valid: false, reason: 'Refund already requested' };
  }
  if (order.status === 'refunded') {
    return { valid: false, reason: 'Order is already fully refunded' };
  }
  return { valid: true };
}
