/**
 * @fileoverview Checkout Create Session API Route
 *
 * REFACTORED: Thin route handler that delegates to CheckoutService.
 * This file only handles HTTP concerns (request parsing, response formatting).
 * All business logic lives in the service layer.
 *
 * SECURITY:
 *   - Authentication + Authorization (requireAuth)
 *   - Input validation via Zod DTOs
 *   - Rate limiting (per-user)
 *   - CSRF protection (handled by middleware)
 */

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError, logDeniedAccess } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { createCheckoutSession } from '@/services/checkout-service';
import { validateDto, CheckoutSessionRequestSchema } from '@/dto';
import { toAppError } from '@/lib/errors';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';

export async function POST(req: Request) {
  // Step 1: Authenticate + Authorize
  const auth = await requireAuth({
    permission: PERMISSIONS.PAYMENTS_CREATE,
  });

  if (isAuthError(auth)) {
    await logDeniedAccess(auth, 'CREATE_PAYMENT_SESSION', 'payment_sessions');
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
  }

  // Step 2: Rate limiting (per-user)
  const rateLimitResult = await checkRateLimit(
    RATE_LIMITS.CHECKOUT,
    `user:${auth.userId}`
  );

  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many checkout attempts', code: 'RATE_LIMIT_EXCEEDED', retryAfter: rateLimitResult.retryAfter },
      { status: 429 }
    );
  }

  try {
    // Step 3: Parse and validate request body
    const body = await req.json();
    const validated = validateDto(CheckoutSessionRequestSchema, body);

    // Step 4: Delegate to service
    const result = await createCheckoutSession(
      auth.userId,
      auth.role,
      validated.items
    );

    // Step 5: Return success response
    return NextResponse.json({
      clientSecret: result.clientSecret,
      traceId: result.traceId,
      sessionId: result.sessionId,
    });
  } catch (error: unknown) {
    const appError = toAppError(error);
    return NextResponse.json(
      appError.toClientResponse(),
      { status: appError.httpStatus }
    );
  }
}
