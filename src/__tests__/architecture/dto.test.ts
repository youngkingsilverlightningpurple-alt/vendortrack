/**
 * @fileoverview DTO Validation Tests
 *
 * Tests all Zod schemas for request/response validation.
 * Ensures that no raw request bodies can reach business logic.
 *
 * UPDATED: All ID fields now use UUID format as enforced by security hardening.
 */

import { describe, it, expect } from 'vitest';
import {
  CheckoutItemSchema,
  CheckoutSessionRequestSchema,
  SearchRequestSchema,
  CreateProductSchema,
  UpdateOrderStatusSchema,
  RefundRequestSchema,
  RefundDecisionSchema,
  UpdateCartItemSchema,
  RemoveCartItemSchema,
  ToggleAdminSchema,
  UpdateSellerStatusSchema,
  SendMessageSchema,
  validateDto,
  safeValidateDto,
} from '@/dto';
import { AppError, ErrorCode } from '@/lib/errors';

// Valid UUID for testing
const UUID = '123e4567-e89b-12d3-a456-426614174000';
const UUID2 = '223e4567-e89b-12d3-a456-426614174001';

// ============================================================
// CHECKOUT DTOs
// ============================================================

describe('CheckoutItemSchema', () => {
  it('validates a valid checkout item', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 2 });
    expect(result.success).toBe(true);
  });

  it('rejects empty productId', () => {
    const result = CheckoutItemSchema.safeParse({ productId: '', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID productId', () => {
    const result = CheckoutItemSchema.safeParse({ productId: 'prod_123', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects quantity less than 1', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects quantity greater than 100', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer quantity', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('CheckoutSessionRequestSchema', () => {
  it('validates a valid request', () => {
    const result = CheckoutSessionRequestSchema.safeParse({
      items: [{ productId: UUID, quantity: 2 }, { productId: UUID2, quantity: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty items array', () => {
    const result = CheckoutSessionRequestSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 50 items', () => {
    const items = Array.from({ length: 51 }, (_, i) => ({ productId: UUID, quantity: 1 }));
    const result = CheckoutSessionRequestSchema.safeParse({ items });
    expect(result.success).toBe(false);
  });

  it('rejects missing items', () => {
    const result = CheckoutSessionRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

// ============================================================
// SEARCH DTOs
// ============================================================

describe('SearchRequestSchema', () => {
  it('validates with defaults', () => {
    const result = SearchRequestSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(0);
      expect(result.data.limit).toBe(12);
    }
  });

  it('rejects query too long', () => {
    const result = SearchRequestSchema.safeParse({ q: 'a'.repeat(201) });
    expect(result.success).toBe(false);
  });

  it('rejects limit greater than 100', () => {
    const result = SearchRequestSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects negative page', () => {
    const result = SearchRequestSchema.safeParse({ page: -1 });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// PRODUCT DTOs
// ============================================================

describe('CreateProductSchema', () => {
  it('validates a valid product', () => {
    const result = CreateProductSchema.safeParse({
      title: 'Test Product',
      description: 'A great product',
      price_cents: 1000,
      status: 'active',
      image_url: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty title', () => {
    const result = CreateProductSchema.safeParse({
      title: '',
      description: 'A great product',
      price_cents: 1000,
      status: 'active',
      image_url: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects price below minimum', () => {
    const result = CreateProductSchema.safeParse({
      title: 'Test',
      description: 'Desc',
      price_cents: 10,
      status: 'active',
      image_url: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = CreateProductSchema.safeParse({
      title: 'Test',
      description: 'Desc',
      price_cents: 1000,
      status: 'invalid',
      image_url: 'https://example.com/image.jpg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid URL', () => {
    const result = CreateProductSchema.safeParse({
      title: 'Test',
      description: 'Desc',
      price_cents: 1000,
      status: 'active',
      image_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ORDER DTOs
// ============================================================

describe('UpdateOrderStatusSchema', () => {
  it('validates a valid status update', () => {
    const result = UpdateOrderStatusSchema.safeParse({
      status: 'shipped',
      tracking_number: '1Z999AA1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = UpdateOrderStatusSchema.safeParse({ status: 'unknown' });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// REFUND DTOs
// ============================================================

describe('RefundRequestSchema', () => {
  it('validates a valid refund request', () => {
    const result = RefundRequestSchema.safeParse({
      orderId: UUID,
      reason: 'Item was defective',
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID orderId', () => {
    const result = RefundRequestSchema.safeParse({
      orderId: 'order_123',
      reason: 'Item was defective',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = RefundRequestSchema.safeParse({
      orderId: UUID,
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});

describe('RefundDecisionSchema', () => {
  it('validates approved', () => {
    const result = RefundDecisionSchema.safeParse({
      orderId: UUID,
      decision: 'approved',
    });
    expect(result.success).toBe(true);
  });

  it('validates rejected', () => {
    const result = RefundDecisionSchema.safeParse({
      orderId: UUID,
      decision: 'rejected',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid decision', () => {
    const result = RefundDecisionSchema.safeParse({
      orderId: UUID,
      decision: 'maybe',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CART DTOs
// ============================================================

describe('UpdateCartItemSchema', () => {
  it('validates a valid update', () => {
    const result = UpdateCartItemSchema.safeParse({
      cartItemId: UUID,
      quantity: 3,
    });
    expect(result.success).toBe(true);
  });

  it('allows quantity 0 (removal)', () => {
    const result = UpdateCartItemSchema.safeParse({
      cartItemId: UUID,
      quantity: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative quantity', () => {
    const result = UpdateCartItemSchema.safeParse({
      cartItemId: UUID,
      quantity: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID cartItemId', () => {
    const result = UpdateCartItemSchema.safeParse({
      cartItemId: 'cart_123',
      quantity: 3,
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CHAT DTOs
// ============================================================

describe('SendMessageSchema', () => {
  it('validates a valid message', () => {
    const result = SendMessageSchema.safeParse({
      conversationId: UUID,
      text: 'Hello, I need help with my order',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty text', () => {
    const result = SendMessageSchema.safeParse({
      conversationId: UUID,
      text: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects text too long', () => {
    const result = SendMessageSchema.safeParse({
      conversationId: UUID,
      text: 'a'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-UUID conversationId', () => {
    const result = SendMessageSchema.safeParse({
      conversationId: 'conv_123',
      text: 'Hello',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// VALIDATE DTO HELPER
// ============================================================

describe('validateDto', () => {
  it('returns validated data on success', () => {
    const result = validateDto(CheckoutItemSchema, { productId: UUID, quantity: 2 });
    expect(result).toEqual({ productId: UUID, quantity: 2 });
  });

  it('throws AppError on validation failure', () => {
    expect(() => validateDto(CheckoutItemSchema, { productId: '', quantity: 0 })).toThrow(AppError);
  });

  it('throws with VALIDATION_FAILED code', () => {
    try {
      validateDto(CheckoutItemSchema, { productId: '', quantity: 0 });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.VALIDATION_FAILED);
    }
  });
});

describe('safeValidateDto', () => {
  it('returns success result on valid data', () => {
    const result = safeValidateDto(CheckoutItemSchema, { productId: UUID, quantity: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ productId: UUID, quantity: 2 });
    }
  });

  it('returns failure result on invalid data', () => {
    const result = safeValidateDto(CheckoutItemSchema, { productId: '', quantity: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
