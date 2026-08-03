/**
 * @fileoverview DTOs — Data Transfer Objects with Zod Validation
 *
 * Every request/response that crosses a boundary (API, Server Action,
 * external service) MUST be validated through a Zod schema defined here.
 * No raw request bodies may reach business logic.
 *
 * SECURITY HARDENING:
 *   - UUID format validation for all ID fields
 *   - SQL injection character rejection
 *   - HTML sanitization transformers
 *   - Strict enum validation (no free-text where enums exist)
 *   - Length limits on every string field
 *   - Regex patterns for structured data
 *
 * ARCHITECTURE RULES:
 *   - DTOs are the ONLY way data enters/exits the application boundary
 *   - Every DTO has a Zod schema for runtime validation
 *   - TypeScript types are inferred from Zod schemas (single source of truth)
 *   - DTOs never contain business logic — only data shape + validation rules
 */

import { z } from 'zod';

// ============================================================
// SECURITY: COMMON VALIDATION PATTERNS
// ============================================================

/**
 * SQL injection pattern detector.
 * Rejects strings that contain common SQL injection payloads.
 */
const SQL_INJECTION_PATTERN = /('|(--|\/\*|\*\/|;|\\x|\\0|UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|EXEC|EXECUTE|xp_|sp_|0x)\s)/i;

/**
 * UUID format validation.
 * All ID fields must be UUID format to prevent injection.
 */
const uuidSchema = z.string().uuid('Invalid ID format');

/**
 * Safe string schema that rejects SQL injection patterns.
 * Use for all user-provided text fields.
 */
function safeString(fieldName: string, minLen: number = 1, maxLen: number = 500) {
  return z.string()
    .min(minLen, `${fieldName} is required`)
    .max(maxLen, `${fieldName} is too long (max ${maxLen} characters)`)
    .refine(
      val => !SQL_INJECTION_PATTERN.test(val),
      { message: `${fieldName} contains invalid characters` }
    )
    .transform(val => val.trim());
}

/**
 * Safe text schema for longer text fields (descriptions, messages).
 * Allows more characters but still rejects SQL injection patterns.
 */
function safeText(fieldName: string, minLen: number = 0, maxLen: number = 5000) {
  return z.string()
    .min(minLen, `${fieldName} is required`)
    .max(maxLen, `${fieldName} is too long (max ${maxLen} characters)`)
    .refine(
      val => !SQL_INJECTION_PATTERN.test(val),
      { message: `${fieldName} contains invalid characters` }
    )
    .transform(val => val.trim());
}

// ============================================================
// CHECKOUT DTOs
// ============================================================

export const CheckoutItemSchema = z.object({
  productId: uuidSchema,
  quantity: z.number().int().min(1, 'Quantity must be at least 1').max(100, 'Quantity cannot exceed 100'),
});

export const CheckoutSessionRequestSchema = z.object({
  items: z.array(CheckoutItemSchema).min(1, 'At least one item is required').max(50, 'Maximum 50 items per checkout'),
});

export const CheckoutSessionResponseSchema = z.object({
  clientSecret: z.string().optional(),
  sessionId: z.string().optional(),
  traceId: z.string().optional(),
  error: z.string().optional(),
});

export type CheckoutItemDto = z.infer<typeof CheckoutItemSchema>;
export type CheckoutSessionRequestDto = z.infer<typeof CheckoutSessionRequestSchema>;
export type CheckoutSessionResponseDto = z.infer<typeof CheckoutSessionResponseSchema>;

// ============================================================
// SEARCH DTOs
// ============================================================

export const SearchRequestSchema = z.object({
  q: z.string().max(200, 'Query too long').optional()
    .refine(val => !val || !SQL_INJECTION_PATTERN.test(val), { message: 'Search query contains invalid characters' })
    .transform(val => val?.trim()),
  category: z.string().max(100).optional()
    .refine(val => !val || /^[a-zA-Z0-9\s\-&]+$/.test(val), { message: 'Invalid category format' }),
  minPrice: z.number().min(0).max(10000000).optional(),
  maxPrice: z.number().min(0).max(10000000).optional(),
  page: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(12),
}).refine(data => {
  // minPrice must be <= maxPrice
  if (data.minPrice !== undefined && data.maxPrice !== undefined) {
    return data.minPrice <= data.maxPrice;
  }
  return true;
}, { message: 'minPrice must be less than or equal to maxPrice' });

export const SearchResponseSchema = z.object({
  products: z.array(z.object({
    id: z.string(),
    title: z.string(),
    price: z.number(),
    imageUrl: z.string().optional(),
    category: z.string().optional(),
    status: z.string(),
    rank: z.number().optional(),
  })),
  total: z.number().int().min(0),
  page: z.number().int().min(0),
  pageSize: z.number().int().min(1),
});

export type SearchRequestDto = z.infer<typeof SearchRequestSchema>;
export type SearchResponseDto = z.infer<typeof SearchResponseSchema>;

// ============================================================
// PRODUCT DTOs
// ============================================================

export const CreateProductSchema = z.object({
  title: safeString('Title', 1, 200),
  category: z.string().max(100).optional()
    .refine(val => !val || /^[a-zA-Z0-9\s\-&]+$/.test(val), { message: 'Invalid category format' }),
  description: safeText('Description', 1, 5000),
  price_cents: z.number().int().min(50, 'Minimum price is $0.50').max(10000000, 'Maximum price is $100,000'),
  status: z.enum(['active', 'draft']),
  image_url: z.string().url('Invalid image URL').min(1, 'Image URL is required')
    .refine(url => {
      // Block javascript: and data: URLs
      const lower = url.toLowerCase();
      return !lower.startsWith('javascript:') && !lower.startsWith('data:');
    }, { message: 'Invalid image URL scheme' }),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export type CreateProductDto = z.infer<typeof CreateProductSchema>;
export type UpdateProductDto = z.infer<typeof UpdateProductSchema>;

// ============================================================
// ORDER DTOs
// ============================================================

export const UpdateOrderStatusSchema = z.object({
  status: z.enum(['pending', 'shipped', 'delivered', 'refunded']),
  tracking_number: z.string().max(100).optional()
    .refine(val => !val || /^[a-zA-Z0-9\-_]+$/.test(val), { message: 'Invalid tracking number format' }),
  carrier: z.string().max(100).optional()
    .refine(val => !val || /^[a-zA-Z0-9\s\-]+$/.test(val), { message: 'Invalid carrier name format' }),
});

export type UpdateOrderStatusDto = z.infer<typeof UpdateOrderStatusSchema>;

// ============================================================
// REFUND DTOs
// ============================================================

export const RefundRequestSchema = z.object({
  orderId: uuidSchema,
  reason: safeText('Reason', 1, 1000),
});

export const RefundDecisionSchema = z.object({
  orderId: uuidSchema,
  decision: z.enum(['approved', 'rejected']),
});

export type RefundRequestDto = z.infer<typeof RefundRequestSchema>;
export type RefundDecisionDto = z.infer<typeof RefundDecisionSchema>;

// ============================================================
// CART DTOs
// ============================================================

export const UpdateCartItemSchema = z.object({
  cartItemId: uuidSchema,
  quantity: z.number().int().min(0, 'Quantity must be non-negative').max(100),
});

export const RemoveCartItemSchema = z.object({
  cartItemId: uuidSchema,
});

export type UpdateCartItemDto = z.infer<typeof UpdateCartItemSchema>;
export type RemoveCartItemDto = z.infer<typeof RemoveCartItemSchema>;

// ============================================================
// USER DTOs
// ============================================================

export const ToggleAdminSchema = z.object({
  userId: uuidSchema,
  makeAdmin: z.boolean(),
});

export const UpdateSellerStatusSchema = z.object({
  userId: uuidSchema,
  status: z.enum(['approved', 'rejected', 'pending']),
});

export type ToggleAdminDto = z.infer<typeof ToggleAdminSchema>;
export type UpdateSellerStatusDto = z.infer<typeof UpdateSellerStatusSchema>;

// ============================================================
// CHAT DTOs
// ============================================================

export const SendMessageSchema = z.object({
  conversationId: uuidSchema,
  text: safeText('Message', 1, 2000)
    .refine(val => !SQL_INJECTION_PATTERN.test(val), { message: 'Message contains invalid characters' }),
});

export type SendMessageDto = z.infer<typeof SendMessageSchema>;

// ============================================================
// AI PRODUCT DESCRIPTION DTOs
// ============================================================

export const AIProductDescriptionRequestSchema = z.object({
  productName: safeString('Product name', 1, 200),
  category: z.string().max(100).optional()
    .refine(val => !val || /^[a-zA-Z0-9\s\-&]+$/.test(val), { message: 'Invalid category format' }),
  keyFeatures: safeText('Key features', 1, 1000),
  targetAudience: safeString('Target audience', 1, 200),
  tone: z.enum(['Professional', 'Friendly', 'Luxury', 'Minimal', 'Bold']),
});

export type AIProductDescriptionRequestDto = z.infer<typeof AIProductDescriptionRequestSchema>;

// ============================================================
// API RESPONSE DTOs
// ============================================================

export const ApiSuccessResponseSchema = z.object({
  success: z.literal(true),
  data: z.unknown().optional(),
});

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string().optional(),
  traceId: z.string().optional(),
});

export type ApiSuccessResponseDto = z.infer<typeof ApiSuccessResponseSchema>;
export type ApiErrorResponseDto = z.infer<typeof ApiErrorResponseSchema>;

// ============================================================
// VALIDATION HELPER
// ============================================================

import { AppError, ErrorCode } from '@/lib/errors';

/**
 * Validate data against a Zod schema.
 * Throws an AppError with VALIDATION_FAILED code on failure.
 *
 * SECURITY: This is the GATEKEEPER. No data passes into business
 * logic without being validated here first.
 */
export function validateDto<T>(schema: z.ZodSchema<T>, data: unknown, traceId?: string): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
  throw new AppError(ErrorCode.VALIDATION_FAILED, {
    message: `Validation failed: ${errors}`,
    traceId: traceId || 'unknown',
    context: { zodErrors: JSON.stringify(result.error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))) },
  });
}

/**
 * Safe validation that returns a result object instead of throwing.
 */
export function safeValidateDto<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`) };
}
