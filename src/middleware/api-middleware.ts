/**
 * @fileoverview API Middleware
 *
 * Reusable middleware functions for API routes.
 * Extracted from duplicated auth/validation patterns in route handlers.
 *
 * ARCHITECTURE RULES:
 *   - Middleware functions are composable (chain multiple)
 *   - Each middleware handles ONE concern
 *   - Middleware returns early on failure (no fallthrough)
 */

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError, logDeniedAccess } from '@/lib/auth';
import type { Permission } from '@/lib/rbac';
import { toAppError, AppError } from '@/lib/errors';
import { validateDto, CheckoutSessionRequestSchema } from '@/dto';
import type { ZodSchema } from 'zod';

/**
 * Require authenticated and authorized user.
 * Returns the auth result or an error response.
 */
export async function withAuth(options: {
  permission?: Permission;
  adminOnly?: boolean;
  sellerOnly?: boolean;
}): Promise<{ auth: Awaited<ReturnType<typeof requireAuth>>; error?: NextResponse }> {
  const auth = await requireAuth({
    permission: options.permission,
    adminOnly: options.adminOnly,
    sellerOnly: options.sellerOnly,
  });

  if (isAuthError(auth)) {
    return {
      auth,
      error: NextResponse.json({ error: auth.error }, { status: auth.statusCode }),
    };
  }

  return { auth };
}

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the validated data or an error response.
 */
export async function withValidatedBody<T>(
  req: Request,
  schema: ZodSchema<T>,
  traceId?: string
): Promise<{ data: T; error?: NextResponse }> {
  try {
    const body = await req.json();
    const validated = validateDto(schema, body, traceId);
    return { data: validated };
  } catch (error: unknown) {
    const appError = toAppError(error, traceId);
    return {
      data: undefined as unknown as T,
      error: NextResponse.json(appError.toClientResponse(), { status: appError.httpStatus }),
    };
  }
}

/**
 * Create a success JSON response.
 */
export function successResponse(data: Record<string, unknown>, status: number = 200): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}

/**
 * Create an error JSON response from an AppError.
 */
export function errorResponse(error: unknown, traceId?: string): NextResponse {
  const appError = toAppError(error, traceId);
  return NextResponse.json(appError.toClientResponse(), { status: appError.httpStatus });
}
