/**
 * @fileoverview Commission Rounding Consistency Tests
 *
 * Verifies that commission calculations are mathematically identical
 * across all payment flow paths:
 *   - Order totals
 *   - Payout totals
 *   - Platform commission
 *   - Reconciliation
 *   - Refund calculations
 *
 * There must NEVER be a one-cent discrepancy.
 */

import { describe, it, expect } from 'vitest';
import {
  COMMISSION_RATE,
  calculateTotalCommission,
  calculateSellerTransfer,
  distributeCommission,
  calculateRefundCommission,
  verifyCommissionIntegrity,
} from '@/domain/commission';

// ============================================================
// Total Commission Tests
// ============================================================

describe('calculateTotalCommission', () => {
  it('calculates commission for round numbers', () => {
    expect(calculateTotalCommission(1000)).toBe(100);  // $10.00 → $1.00
    expect(calculateTotalCommission(10000)).toBe(1000); // $100.00 → $10.00
  });

  it('rounds correctly for awkward decimal values', () => {
    // $0.99 = 99 cents → ROUND(99 * 0.10) = ROUND(9.9) = 10
    expect(calculateTotalCommission(99)).toBe(10);
    // $0.33 = 33 cents → ROUND(33 * 0.10) = ROUND(3.3) = 3
    expect(calculateTotalCommission(33)).toBe(3);
    // $0.07 = 7 cents → ROUND(7 * 0.10) = ROUND(0.7) = 1
    expect(calculateTotalCommission(7)).toBe(1);
    // $0.15 = 15 cents → ROUND(15 * 0.10) = ROUND(1.5) = 2
    expect(calculateTotalCommission(15)).toBe(2);
    // $0.25 = 25 cents → ROUND(25 * 0.10) = ROUND(2.5) = 3
    expect(calculateTotalCommission(25)).toBe(3);
  });

  it('handles zero amount', () => {
    expect(calculateTotalCommission(0)).toBe(0);
  });

  it('handles minimum order amount (50 cents)', () => {
    // $0.50 = 50 cents → ROUND(50 * 0.10) = 5
    expect(calculateTotalCommission(50)).toBe(5);
  });
});

// ============================================================
// Seller Transfer Tests
// ============================================================

describe('calculateSellerTransfer', () => {
  it('calculates correct seller transfer', () => {
    // $10.00 total, $1.00 commission → $9.00 seller
    expect(calculateSellerTransfer(1000)).toBe(900);
  });

  it('total = commission + seller transfer (invariant)', () => {
    const testAmounts = [50, 99, 333, 999, 1000, 9999, 10000, 12345];
    for (const total of testAmounts) {
      const commission = calculateTotalCommission(total);
      const sellerTransfer = calculateSellerTransfer(total);
      expect(commission + sellerTransfer).toBe(total);
    }
  });
});

// ============================================================
// Distribution Tests — The Critical Rounding Fix
// ============================================================

describe('distributeCommission', () => {
  it('single item: returns total commission', () => {
    const result = distributeCommission([1000]);
    expect(result).toEqual([100]);
    expect(result[0]).toBe(calculateTotalCommission(1000));
  });

  it('two equal items: splits evenly', () => {
    const result = distributeCommission([500, 500]);
    const total = calculateTotalCommission(1000);
    expect(result.reduce((s, c) => s + c, 0)).toBe(total);
    expect(result).toEqual([50, 50]);
  });

  it('multiple items: sum equals total commission (no cent drift)', () => {
    // This is the KEY invariant that was broken before
    const itemAmounts = [333, 333, 334]; // total = 1000
    const result = distributeCommission(itemAmounts);
    const totalCommission = calculateTotalCommission(1000);
    expect(result.reduce((s, c) => s + c, 0)).toBe(totalCommission);
  });

  it('awkward decimal values: no cent drift', () => {
    // Items: $0.33, $0.33, $0.33 = $0.99 total
    // Total commission: ROUND(99 * 0.10) = 10
    // Per item: FLOOR(33 * 0.10) = 3 each = 9, remainder = 1
    const result = distributeCommission([33, 33, 33]);
    expect(result.reduce((s, c) => s + c, 0)).toBe(10);
  });

  it('distributes remainder to items with largest fractional part', () => {
    // Items: 15, 15, 15 = 45 total
    // Total commission: ROUND(45 * 0.10) = ROUND(4.5) = 5
    // Per item floor: FLOOR(1.5) = 1 each = 3, remainder = 2
    // All remainders = 0.5, tie-break: all equal, so first 2 get +1
    const result = distributeCommission([15, 15, 15]);
    expect(result.reduce((s, c) => s + c, 0)).toBe(5);
    // Each item should get either 1 or 2
    for (const c of result) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(2);
    }
  });

  it('handles many items with rounding issues', () => {
    // 7 items of $0.07 each = $0.49 total
    // Total commission: ROUND(49 * 0.10) = ROUND(4.9) = 5
    // Per item floor: FLOOR(0.7) = 0 each = 0, remainder = 5
    const result = distributeCommission([7, 7, 7, 7, 7, 7, 7]);
    expect(result.reduce((s, c) => s + c, 0)).toBe(5);
  });

  it('large order with many items: invariant holds', () => {
    // 10 items of varying prices
    const itemAmounts = [999, 1500, 2333, 777, 4521, 888, 1234, 567, 3456, 2225];
    const total = itemAmounts.reduce((s, a) => s + a, 0);
    const result = distributeCommission(itemAmounts);
    const totalCommission = calculateTotalCommission(total);
    expect(result.reduce((s, c) => s + c, 0)).toBe(totalCommission);
  });

  it('empty array: returns empty', () => {
    expect(distributeCommission([])).toEqual([]);
  });

  it('deterministic: same input always produces same output', () => {
    const items = [333, 667]; // awkward split
    const r1 = distributeCommission(items);
    const r2 = distributeCommission(items);
    const r3 = distributeCommission(items);
    expect(r1).toEqual(r2);
    expect(r2).toEqual(r3);
  });
});

// ============================================================
// Refund Commission Tests
// ============================================================

describe('calculateRefundCommission', () => {
  it('full refund: reverses entire commission', () => {
    // Order: $10.00 total, $1.00 commission
    // Full refund of $10.00 → reverse $1.00 commission
    expect(calculateRefundCommission(1000, 1000, 100)).toBe(100);
  });

  it('partial refund: pro-rates commission', () => {
    // Order: $10.00 total, $1.00 commission
    // Refund $5.00 (50%) → reverse $0.50 commission
    expect(calculateRefundCommission(500, 1000, 100)).toBe(50);
  });

  it('partial refund with awkward amounts', () => {
    // Order: $9.99 total, commission = ROUND(999 * 0.10) = 100 cents
    // Refund $3.33 (1/3) → reverse ROUND(100 * 333/999) = ROUND(33.33) = 33
    expect(calculateRefundCommission(333, 999, 100)).toBe(33);
  });

  it('small partial refund', () => {
    // Order: $10.00 total, $1.00 commission
    // Refund $0.50 → reverse ROUND(100 * 50/1000) = ROUND(5) = 5
    expect(calculateRefundCommission(50, 1000, 100)).toBe(5);
  });

  it('refund exceeding original: reverses entire commission', () => {
    // Edge case: refund amount > original (shouldn't happen, but handle gracefully)
    expect(calculateRefundCommission(1500, 1000, 100)).toBe(100);
  });

  it('zero amount order: returns zero', () => {
    expect(calculateRefundCommission(0, 0, 0)).toBe(0);
  });

  it('commission consistency: refund commission never exceeds original commission', () => {
    const testCases = [
      { refund: 100, total: 1000, commission: 100 },
      { refund: 500, total: 1000, commission: 100 },
      { refund: 999, total: 1000, commission: 100 },
      { refund: 333, total: 999, commission: 100 },
      { refund: 7, total: 50, commission: 5 },
    ];
    for (const tc of testCases) {
      const refundComm = calculateRefundCommission(tc.refund, tc.total, tc.commission);
      expect(refundComm).toBeLessThanOrEqual(tc.commission);
      expect(refundComm).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================
// Integrity Verification Tests
// ============================================================

describe('verifyCommissionIntegrity', () => {
  it('valid when commissions sum to total', () => {
    const result = verifyCommissionIntegrity([50, 50], 1000);
    expect(result.valid).toBe(true);
    expect(result.discrepancy).toBe(0);
  });

  it('invalid when commissions do not sum to total', () => {
    // Manually constructed bad data: [40, 50] = 90, but expected = 100
    const result = verifyCommissionIntegrity([40, 50], 1000);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(-10);
  });

  it('detects one-cent drift', () => {
    // Expected: 100, Actual: 99
    const result = verifyCommissionIntegrity([33, 33, 33], 1000);
    expect(result.expected).toBe(100);
    expect(result.actual).toBe(99);
    expect(result.valid).toBe(false);
    expect(result.discrepancy).toBe(-1);
  });

  it('valid after proper distribution', () => {
    const itemAmounts = [333, 333, 334];
    const distributed = distributeCommission(itemAmounts);
    const total = itemAmounts.reduce((s, a) => s + a, 0);
    const result = verifyCommissionIntegrity(distributed, total);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// End-to-End Payment Flow Consistency Tests
// ============================================================

describe('Payment flow consistency', () => {
  it('1 item: checkout commission = order commission = reconciliation commission', () => {
    const itemAmount = 999; // $9.99
    const checkoutCommission = calculateTotalCommission(itemAmount);
    const orderCommission = calculateTotalCommission(itemAmount);
    const reconExpected = calculateTotalCommission(itemAmount);

    expect(checkoutCommission).toBe(orderCommission);
    expect(orderCommission).toBe(reconExpected);
  });

  it('multiple items: checkout total commission = sum of distributed order commissions', () => {
    const itemAmounts = [333, 333, 334]; // total = 1000
    const total = itemAmounts.reduce((s, a) => s + a, 0);

    // Checkout calculates commission on total
    const checkoutCommission = calculateTotalCommission(total);

    // fulfill_order distributes commission per item (using largest remainder)
    const orderCommissions = distributeCommission(itemAmounts);
    const sumOrderCommissions = orderCommissions.reduce((s, c) => s + c, 0);

    // Reconciliation checks against total
    const reconExpected = calculateTotalCommission(total);

    // ALL THREE MUST BE EQUAL
    expect(checkoutCommission).toBe(sumOrderCommissions);
    expect(sumOrderCommissions).toBe(reconExpected);
  });

  it('refund: commission reversal matches stored commission', () => {
    const orderAmount = 999; // $9.99
    const orderCommission = calculateTotalCommission(orderAmount); // 100 cents

    // Full refund
    const fullRefundCommission = calculateRefundCommission(orderAmount, orderAmount, orderCommission);
    expect(fullRefundCommission).toBe(orderCommission);

    // Partial refund (50%)
    const partialRefundAmount = 500; // $5.00
    const partialRefundCommission = calculateRefundCommission(partialRefundAmount, orderAmount, orderCommission);
    // Should be proportional: ROUND(100 * 500/999) = ROUND(50.05) = 50
    expect(partialRefundCommission).toBe(50);
    // Must not exceed original
    expect(partialRefundCommission).toBeLessThanOrEqual(orderCommission);
  });

  it('awkward decimal values across full flow', () => {
    // Multiple items with awkward cent values
    const itemAmounts = [7, 7, 7, 7, 7, 7, 7]; // 7 items × 7 cents = 49 cents
    const total = itemAmounts.reduce((s, a) => s + a, 0);

    const checkoutCommission = calculateTotalCommission(total);
    const orderCommissions = distributeCommission(itemAmounts);
    const sumOrderCommissions = orderCommissions.reduce((s, c) => s + c, 0);

    expect(checkoutCommission).toBe(sumOrderCommissions);

    // Verify seller gets the right amount
    const sellerTransfer = calculateSellerTransfer(total);
    expect(total).toBe(checkoutCommission + sellerTransfer);

    // Full refund reverses exactly
    for (let i = 0; i < itemAmounts.length; i++) {
      const refundCommission = calculateRefundCommission(
        itemAmounts[i]!,
        itemAmounts[i]!,
        orderCommissions[i]!
      );
      expect(refundCommission).toBe(orderCommissions[i]);
    }
  });

  it('no cent drift across 100 random multi-item orders', () => {
    // Stress test: generate 100 random multi-item orders
    for (let trial = 0; trial < 100; trial++) {
      const numItems = Math.floor(Math.random() * 10) + 2; // 2-11 items
      const itemAmounts: number[] = [];
      for (let i = 0; i < numItems; i++) {
        itemAmounts.push(Math.floor(Math.random() * 10000) + 50); // 50-10050 cents
      }
      const total = itemAmounts.reduce((s, a) => s + a, 0);
      const checkoutCommission = calculateTotalCommission(total);
      const orderCommissions = distributeCommission(itemAmounts);
      const sumOrderCommissions = orderCommissions.reduce((s, c) => s + c, 0);

      // THE critical invariant
      expect(sumOrderCommissions).toBe(checkoutCommission);
    }
  });
});
