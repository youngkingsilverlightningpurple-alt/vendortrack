/**
 * @fileoverview Domain Layer Tests
 *
 * Tests pure domain logic: mappers, business rules, constants.
 */

import { describe, it, expect } from 'vitest';
import {
  profileRowToDomain,
  productRowToDomain,
  orderRowToDomain,
  cartItemRowToDomain,
  calculateCommission,
  calculateSellerTransfer,
  isProductAvailable,
  isSessionExpired,
  generateTraceId,
  getOrderStatusVariant,
  getRefundStatusVariant,
  COMMISSION_RATE,
  MIN_ORDER_AMOUNT_CENTS,
  SESSION_EXPIRY_MINUTES,
} from '@/domain';
import type { ProfileRow, ProductRow, OrderRow, CartItemRow } from '@/domain';

// ============================================================
// ROW-TO-DOMAIN MAPPERS
// ============================================================

describe('profileRowToDomain', () => {
  it('transforms snake_case to camelCase', () => {
    const row: ProfileRow = {
      id: 'user_1',
      full_name: 'John Doe',
      email: 'john@example.com',
      role: 'seller',
      seller_status: 'approved',
      created_at: '2024-01-01T00:00:00Z',
      store_name: 'John\'s Store',
      store_description: 'Best products',
      store_logo_url: 'https://example.com/logo.png',
      stripe_account_id: 'acct_123',
      stripe_connected: true,
      referral_code: 'REF123',
      referrer_id: 'user_0',
      is_demo: false,
      is_admin: false,
    };

    const result = profileRowToDomain(row);
    expect(result.id).toBe('user_1');
    expect(result.fullName).toBe('John Doe');
    expect(result.email).toBe('john@example.com');
    expect(result.role).toBe('seller');
    expect(result.sellerStatus).toBe('approved');
    expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
    expect(result.storeName).toBe('John\'s Store');
    expect(result.storeDescription).toBe('Best products');
    expect(result.storeLogoUrl).toBe('https://example.com/logo.png');
    expect(result.stripeAccountId).toBe('acct_123');
    expect(result.stripeConnected).toBe(true);
    expect(result.referralCode).toBe('REF123');
    expect(result.referrerId).toBe('user_0');
    expect(result.isDemo).toBe(false);
    expect(result.isAdmin).toBe(false);
  });
});

describe('productRowToDomain', () => {
  it('transforms and calculates price from cents', () => {
    const row: ProductRow = {
      id: 'prod_1',
      seller_id: 'seller_1',
      title: 'Widget',
      category: 'Electronics',
      description: 'A great widget',
      price_cents: 999,
      stock: 50,
      image_url: 'https://example.com/widget.jpg',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
    };

    const result = productRowToDomain(row);
    expect(result.price).toBe(9.99);
    expect(result.priceCents).toBe(999);
    expect(result.sellerId).toBe('seller_1');
  });
});

describe('orderRowToDomain', () => {
  it('transforms and calculates amount from cents', () => {
    const row: OrderRow = {
      id: 'order_1',
      seller_id: 'seller_1',
      buyer_id: 'buyer_1',
      buyer_name: 'Jane',
      product_id: 'prod_1',
      product_name: 'Widget',
      product_image_url: 'https://example.com/img.jpg',
      quantity: 2,
      amount_cents: 1998,
      commission_cents: 200,
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      payment_intent_id: 'pi_123',
      involved_users: ['buyer_1', 'seller_1'],
    };

    const result = orderRowToDomain(row);
    expect(result.amount).toBe(19.98);
    expect(result.amountCents).toBe(1998);
    expect(result.commissionCents).toBe(200);
    expect(result.buyerId).toBe('buyer_1');
    expect(result.involvedUsers).toEqual(['buyer_1', 'seller_1']);
  });
});

describe('cartItemRowToDomain', () => {
  it('transforms snake_case fields', () => {
    const row: CartItemRow = {
      id: 'cart_1',
      user_id: 'user_1',
      product_id: 'prod_1',
      quantity: 3,
      created_at: '2024-01-01T00:00:00Z',
    };

    const result = cartItemRowToDomain(row);
    expect(result.userId).toBe('user_1');
    expect(result.productId).toBe('prod_1');
    expect(result.quantity).toBe(3);
  });
});

// ============================================================
// BUSINESS RULES
// ============================================================

describe('calculateCommission', () => {
  it('calculates 10% commission with rounding', () => {
    expect(calculateCommission(1000)).toBe(100);
    expect(calculateCommission(99)).toBe(10); // Math.round(9.9)
    expect(calculateCommission(1)).toBe(0); // Math.round(0.1)
  });
});

describe('calculateSellerTransfer', () => {
  it('calculates total minus commission', () => {
    expect(calculateSellerTransfer(1000)).toBe(900);
    expect(calculateSellerTransfer(500)).toBe(450);
  });
});

describe('isProductAvailable', () => {
  it('returns true for active, non-deleted, in-stock product', () => {
    expect(isProductAvailable({ status: 'active', deletedAt: undefined, stock: 10 }, 5)).toBe(true);
  });

  it('returns false for inactive product', () => {
    expect(isProductAvailable({ status: 'draft', deletedAt: undefined, stock: 10 }, 5)).toBe(false);
  });

  it('returns false for deleted product', () => {
    expect(isProductAvailable({ status: 'active', deletedAt: '2024-01-01', stock: 10 }, 5)).toBe(false);
  });

  it('returns false for insufficient stock', () => {
    expect(isProductAvailable({ status: 'active', deletedAt: undefined, stock: 3 }, 5)).toBe(false);
  });
});

describe('isSessionExpired', () => {
  it('returns true for past expiry', () => {
    expect(isSessionExpired({ expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(true);
  });

  it('returns false for future expiry', () => {
    expect(isSessionExpired({ expiresAt: new Date(Date.now() + 60000).toISOString() })).toBe(false);
  });
});

describe('generateTraceId', () => {
  it('generates with prefix', () => {
    const id = generateTraceId('test');
    expect(id).toMatch(/^test_\d+_[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const id1 = generateTraceId();
    const id2 = generateTraceId();
    expect(id1).not.toBe(id2);
  });
});

describe('badge variants', () => {
  it('getOrderStatusVariant returns correct variant', () => {
    expect(getOrderStatusVariant('pending')).toBe('secondary');
    expect(getOrderStatusVariant('shipped')).toBe('default');
    expect(getOrderStatusVariant('delivered')).toBe('outline');
    expect(getOrderStatusVariant('refunded')).toBe('destructive');
    expect(getOrderStatusVariant('unknown')).toBe('default');
  });

  it('getRefundStatusVariant returns correct variant', () => {
    expect(getRefundStatusVariant('requested')).toBe('secondary');
    expect(getRefundStatusVariant('approved')).toBe('default');
    expect(getRefundStatusVariant('rejected')).toBe('destructive');
    expect(getRefundStatusVariant('unknown')).toBe('default');
  });
});

// ============================================================
// CONSTANTS
// ============================================================

describe('domain constants', () => {
  it('COMMISSION_RATE is 10%', () => {
    expect(COMMISSION_RATE).toBe(0.10);
  });

  it('MIN_ORDER_AMOUNT_CENTS is 50', () => {
    expect(MIN_ORDER_AMOUNT_CENTS).toBe(50);
  });

  it('SESSION_EXPIRY_MINUTES is 30', () => {
    expect(SESSION_EXPIRY_MINUTES).toBe(30);
  });
});
