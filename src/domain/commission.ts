/**
 * @fileoverview Commission Calculation — Deterministic Rounding
 *
 * CRITICAL FINANCIAL RULE:
 *   Σ ROUND(item_i * rate) ≠ ROUND(Σ item_i * rate) in general.
 *   This module ensures commission is distributed so that:
 *   1. sum(commission_i) === commission_total  (no cent drift)
 *   2. Distribution is deterministic (same input → same output)
 *   3. Remainder cents go to the largest items first (Hamilton method)
 *
 * This prevents the one-cent discrepancy between:
 *   - Stripe application_fee_amount (computed on total)
 *   - Order commission_cents (computed per item in fulfill_order())
 *   - Reconciliation expected values
 *   - Refund commission reversals
 */

/** Platform commission rate (10%) */
export const COMMISSION_RATE = 0.10;

/**
 * Calculate total commission for an amount in cents.
 * This is the single source of truth for total commission.
 * All per-item distributions must sum to this value.
 */
export function calculateTotalCommission(totalCents: number): number {
  return Math.round(totalCents * COMMISSION_RATE);
}

/**
 * Calculate seller transfer amount (total minus commission).
 */
export function calculateSellerTransfer(totalCents: number): number {
  return totalCents - calculateTotalCommission(totalCents);
}

/**
 * Distribute commission across items using the Largest Remainder Method
 * (Hamilton/Vinton method). This guarantees:
 *   1. Σ result[i] === totalCommission (no cent drift)
 *   2. Each result[i] ≈ itemAmount[i] * rate
 *   3. Deterministic: same input always produces same output
 *
 * Algorithm:
 *   1. Compute floor(item_i * rate) for each item
 *   2. Compute fractional remainders
 *   3. Distribute remaining cents to items with largest fractional remainders
 *
 * @param itemAmounts - Array of item amounts in cents
 * @param totalCommission - Pre-computed total commission (from calculateTotalCommission)
 * @returns Array of commission amounts in cents, same order as input
 */
export function distributeCommission(
  itemAmounts: number[],
  totalCommission?: number
): number[] {
  if (itemAmounts.length === 0) return [];

  const total = itemAmounts.reduce((sum, a) => sum + a, 0);
  const targetTotal = totalCommission ?? calculateTotalCommission(total);

  // Special case: single item — no distribution needed
  if (itemAmounts.length === 1) {
    return [targetTotal];
  }

  // Step 1: Compute floor for each item
  const floored = itemAmounts.map(a => Math.floor(a * COMMISSION_RATE));

  // Step 2: Compute fractional remainders
  const remainders = itemAmounts.map(a => (a * COMMISSION_RATE) - Math.floor(a * COMMISSION_RATE));

  // Step 3: How many cents remain to distribute?
  const distributedSoFar = floored.reduce((sum, f) => sum + f, 0);
  const remainingCents = targetTotal - distributedSoFar;

  // Step 4: Distribute remaining cents to items with largest remainders
  // Create index array sorted by remainder descending (deterministic: stable sort)
  const indices = remainders
    .map((_, i) => i)
    .sort((a, b) => {
      const diff = remainders[b]! - remainders[a]!;
      // Tie-break: larger amount gets priority (deterministic)
      if (diff === 0) return itemAmounts[b]! - itemAmounts[a]!;
      return diff;
    });

  const result = [...floored];
  for (let i = 0; i < remainingCents; i++) {
    result[indices[i]!] = (result[indices[i]!] ?? 0) + 1;
  }

  return result;
}

/**
 * Calculate commission for a refund based on the original order's stored commission.
 *
 * RULE: Never recalculate commission for refunds. Always derive from the
 * stored commission_cents of the original order. For partial refunds,
 * pro-rate based on the refund-to-original ratio.
 *
 * @param refundAmountCents - The amount being refunded (in cents)
 * @param originalAmountCents - The original order total (in cents)
 * @param originalCommissionCents - The original order's stored commission (in cents)
 * @returns Commission to reverse (in cents)
 */
export function calculateRefundCommission(
  refundAmountCents: number,
  originalAmountCents: number,
  originalCommissionCents: number
): number {
  if (originalAmountCents <= 0) return 0;

  // Full refund: reverse entire commission
  if (refundAmountCents >= originalAmountCents) {
    return originalCommissionCents;
  }

  // Partial refund: pro-rate commission based on refund ratio
  // Use ROUND to ensure integer cents
  const ratio = refundAmountCents / originalAmountCents;
  return Math.round(originalCommissionCents * ratio);
}

/**
 * Verify that commission distribution sums correctly.
 * Used in tests and reconciliation.
 */
export function verifyCommissionIntegrity(
  itemCommissions: number[],
  totalCents: number
): { valid: boolean; expected: number; actual: number; discrepancy: number } {
  const expected = calculateTotalCommission(totalCents);
  const actual = itemCommissions.reduce((sum, c) => sum + c, 0);
  return {
    valid: expected === actual,
    expected,
    actual,
    discrepancy: actual - expected,
  };
}
