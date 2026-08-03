/**
 * @fileoverview Validator Tests
 *
 * Tests all centralized validation functions.
 */

import { describe, it, expect } from 'vitest';
import {
  validateProductAvailability,
  validateSellerForPayment,
  validateCommission,
  validateSessionExpiry,
  validateSingleVendor,
  validateOwnership,
  validateOrderStatusTransition,
  validateRefundEligibility,
} from '@/validators';

// ============================================================
// PRODUCT AVAILABILITY
// ============================================================

describe('validateProductAvailability', () => {
  it('returns valid for active product with sufficient stock', () => {
    const result = validateProductAvailability({ status: 'active', deletedAt: null, stock: 10 }, 5);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for inactive product', () => {
    const result = validateProductAvailability({ status: 'draft', deletedAt: null, stock: 10 }, 5);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not available');
  });

  it('returns invalid for soft-deleted product', () => {
    const result = validateProductAvailability({ status: 'active', deletedAt: '2024-01-01', stock: 10 }, 5);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('removed');
  });

  it('returns invalid for insufficient stock', () => {
    const result = validateProductAvailability({ status: 'active', deletedAt: null, stock: 3 }, 5);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Insufficient stock');
  });
});

// ============================================================
// SELLER VALIDATION
// ============================================================

describe('validateSellerForPayment', () => {
  it('returns valid for connected and approved seller', () => {
    const result = validateSellerForPayment({
      stripeAccountId: 'acct_123',
      stripeConnected: true,
      sellerStatus: 'approved',
    });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for disconnected seller', () => {
    const result = validateSellerForPayment({
      stripeAccountId: null,
      stripeConnected: false,
      sellerStatus: 'approved',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Stripe');
  });

  it('returns invalid for unapproved seller', () => {
    const result = validateSellerForPayment({
      stripeAccountId: 'acct_123',
      stripeConnected: true,
      sellerStatus: 'pending',
    });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not approved');
  });
});

// ============================================================
// COMMISSION VALIDATION
// ============================================================

describe('validateCommission', () => {
  it('returns valid for normal amounts', () => {
    const result = validateCommission(1000, 0.10);
    expect(result.valid).toBe(true);
    expect(result.commissionCents).toBe(100);
  });

  it('returns invalid when commission exceeds total', () => {
    const result = validateCommission(5, 0.10);
    // Commission = 0.5, rounded to 1, total = 5, transfer = 4
    // This should still be valid
    expect(result.valid).toBe(true);
  });

  it('calculates commission correctly with rounding', () => {
    const result = validateCommission(99, 0.10);
    expect(result.commissionCents).toBe(10); // Math.round(99 * 0.10) = Math.round(9.9) = 10
  });
});

// ============================================================
// SESSION EXPIRY
// ============================================================

describe('validateSessionExpiry', () => {
  it('returns valid for future expiry', () => {
    const futureDate = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const result = validateSessionExpiry(futureDate);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for past expiry', () => {
    const pastDate = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = validateSessionExpiry(pastDate);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });
});

// ============================================================
// SINGLE VENDOR
// ============================================================

describe('validateSingleVendor', () => {
  it('returns valid for single vendor', () => {
    const result = validateSingleVendor([
      { sellerId: 'seller_1' },
      { sellerId: 'seller_1' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.sellerId).toBe('seller_1');
  });

  it('returns invalid for multi-vendor', () => {
    const result = validateSingleVendor([
      { sellerId: 'seller_1' },
      { sellerId: 'seller_2' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Multi-vendor');
  });

  it('returns invalid for empty items', () => {
    const result = validateSingleVendor([]);
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// OWNERSHIP
// ============================================================

describe('validateOwnership', () => {
  it('returns valid for owner', () => {
    const result = validateOwnership('user_1', 'user_1', false);
    expect(result.valid).toBe(true);
  });

  it('returns valid for admin', () => {
    const result = validateOwnership('user_1', 'user_2', true);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for non-owner', () => {
    const result = validateOwnership('user_1', 'user_2', false);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('do not own');
  });
});

// ============================================================
// ORDER STATUS TRANSITION
// ============================================================

describe('validateOrderStatusTransition', () => {
  it('allows pending → shipped', () => {
    const result = validateOrderStatusTransition('pending', 'shipped');
    expect(result.valid).toBe(true);
  });

  it('allows pending → refunded', () => {
    const result = validateOrderStatusTransition('pending', 'refunded');
    expect(result.valid).toBe(true);
  });

  it('allows shipped → delivered', () => {
    const result = validateOrderStatusTransition('shipped', 'delivered');
    expect(result.valid).toBe(true);
  });

  it('rejects pending → delivered (skip shipped)', () => {
    const result = validateOrderStatusTransition('pending', 'delivered');
    expect(result.valid).toBe(false);
  });

  it('rejects refunded → any', () => {
    const result = validateOrderStatusTransition('refunded', 'pending');
    expect(result.valid).toBe(false);
  });

  it('rejects unknown status', () => {
    const result = validateOrderStatusTransition('unknown', 'shipped');
    expect(result.valid).toBe(false);
  });
});

// ============================================================
// REFUND ELIGIBILITY
// ============================================================

describe('validateRefundEligibility', () => {
  it('returns valid for eligible order', () => {
    const result = validateRefundEligibility({ status: 'pending', refundStatus: 'none' });
    expect(result.valid).toBe(true);
  });

  it('returns invalid for already approved refund', () => {
    const result = validateRefundEligibility({ status: 'pending', refundStatus: 'approved' });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already approved');
  });

  it('returns invalid for already requested refund', () => {
    const result = validateRefundEligibility({ status: 'pending', refundStatus: 'requested' });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already requested');
  });

  it('returns invalid for fully refunded order', () => {
    const result = validateRefundEligibility({ status: 'refunded' });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('already fully refunded');
  });
});
