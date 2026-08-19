/**
 * @fileoverview Unified Error Handling Framework
 *
 * Single error hierarchy for the entire application:
 *   - AppError (base) — all application errors
 *     - ValidationError — input validation failures
 *     - AuthenticationError — auth/identity failures
 *     - AuthorizationError — permission/role failures
 *     - DatabaseError — Supabase/PostgreSQL failures
 *     - PaymentError — Stripe/payment failures
 *     - NotFoundError — resource not found
 *     - ConflictError — duplicate/state conflict
 *
 * ARCHITECTURE RULES:
 *   - Every error in the application MUST be an AppError subclass
 *   - No raw Error objects should be thrown from business logic
 *   - Each error has a structured code, HTTP status, and trace ID
 *   - Client-safe messages are separated from internal details
 *   - All errors are compatible with the structured logger
 */

// ============================================================
// ERROR CODES
// ============================================================

export enum ErrorCode {
  // Validation
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_STATE = 'INVALID_STATE',

  // Authentication
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',

  // Authorization
  INSUFFICIENT_PERMISSION = 'INSUFFICIENT_PERMISSION',
  INSUFFICIENT_ROLE = 'INSUFFICIENT_ROLE',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  SELLER_REQUIRED = 'SELLER_REQUIRED',
  OWNERSHIP_VIOLATION = 'OWNERSHIP_VIOLATION',
  ORDER_INVOLVEMENT_VIOLATION = 'ORDER_INVOLVEMENT_VIOLATION',

  // Database
  DB_ERROR = 'DB_ERROR',
  DB_CONSTRAINT_VIOLATION = 'DB_CONSTRAINT_VIOLATION',
  DB_NOT_FOUND = 'DB_NOT_FOUND',
  DB_CONNECTION_ERROR = 'DB_CONNECTION_ERROR',
  DB_RPC_FAILED = 'DB_RPC_FAILED',

  // Payment
  PAYMENT_STRIPE_ERROR = 'PAYMENT_STRIPE_ERROR',
  PAYMENT_STRIPE_RATE_LIMIT = 'PAYMENT_STRIPE_RATE_LIMIT',
  PAYMENT_STRIPE_REFUND_FAILED = 'PAYMENT_STRIPE_REFUND_FAILED',
  PAYMENT_INVALID_AMOUNT = 'PAYMENT_INVALID_AMOUNT',
  PAYMENT_INVALID_CURRENCY = 'PAYMENT_INVALID_CURRENCY',
  PAYMENT_INVALID_COMMISSION = 'PAYMENT_INVALID_COMMISSION',
  PAYMENT_SESSION_EXPIRED = 'PAYMENT_SESSION_EXPIRED',
  PAYMENT_CART_MISMATCH = 'PAYMENT_CART_MISMATCH',
  PAYMENT_INSUFFICIENT_STOCK = 'PAYMENT_INSUFFICIENT_STOCK',
  PAYMENT_SELLER_NOT_CONNECTED = 'PAYMENT_SELLER_NOT_CONNECTED',
  PAYMENT_PRICE_MISMATCH = 'PAYMENT_PRICE_MISMATCH',

  // Resource
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  ALREADY_EXISTS = 'ALREADY_EXISTS',

  // Internal
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// ============================================================
// ERROR CONTEXT
// ============================================================

/**
 * Primitive value type used across log data, error context, and ledger metadata.
 *
 * P0 FIX (war room): added `null` to support nullable ledger `order_id`.
 * Previously `PrimitiveValue` was `string | number | boolean | undefined`,
 * which prevented passing `null` for fields like `orderId: entry.order_id`
 * after `order_id` became `string | null` (see ledger-service.ts). NULL is
 * a legitimate runtime value for pre-order ledger events (e.g. `payment_created`
 * fires before `fulfill_order_v2` creates the order row).
 */
export type PrimitiveValue = string | number | boolean | null | undefined;
export type ErrorContext = Record<string, PrimitiveValue>;

// ============================================================
// BASE APPLICATION ERROR
// ============================================================

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly traceId: string;
  public readonly context: ErrorContext;
  public readonly retryable: boolean;
  public readonly clientMessage: string;
  override readonly cause?: Error;

  constructor(
    code: ErrorCode,
    options: {
      message?: string;
      traceId?: string;
      context?: ErrorContext;
      httpStatus?: number;
      retryable?: boolean;
      clientMessage?: string;
      cause?: Error;
    } = {}
  ) {
    super(options.message || code);
    this.name = 'AppError';
    this.code = code;
    this.traceId = options.traceId || 'unknown';
    this.context = options.context || {};
    this.retryable = options.retryable ?? false;
    this.cause = options.cause;

    // Determine HTTP status from code if not provided
    this.httpStatus = options.httpStatus ?? this.defaultHttpStatus(code);
    this.clientMessage = options.clientMessage ?? this.defaultClientMessage(code);
  }

  private defaultHttpStatus(code: ErrorCode): number {
    if (code.startsWith('VALIDATION') || code === ErrorCode.INVALID_INPUT || code === ErrorCode.INVALID_STATE) return 400;
    if (code === ErrorCode.UNAUTHENTICATED || code === ErrorCode.SESSION_EXPIRED) return 401;
    if (code.startsWith('INSUFFICIENT') || code === ErrorCode.ADMIN_REQUIRED || code === ErrorCode.SELLER_REQUIRED || code === ErrorCode.OWNERSHIP_VIOLATION || code === ErrorCode.ORDER_INVOLVEMENT_VIOLATION) return 403;
    if (code === ErrorCode.NOT_FOUND || code === ErrorCode.DB_NOT_FOUND || code === ErrorCode.PROFILE_NOT_FOUND) return 404;
    if (code === ErrorCode.CONFLICT || code === ErrorCode.ALREADY_EXISTS || code === ErrorCode.DB_CONSTRAINT_VIOLATION) return 409;
    if (code === ErrorCode.PAYMENT_STRIPE_RATE_LIMIT) return 429;
    if (code === ErrorCode.SERVICE_UNAVAILABLE) return 503;
    return 500;
  }

  private defaultClientMessage(code: ErrorCode): string {
    const messages: Partial<Record<ErrorCode, string>> = {
      [ErrorCode.VALIDATION_FAILED]: 'Invalid request data',
      [ErrorCode.UNAUTHENTICATED]: 'Authentication required',
      [ErrorCode.SESSION_EXPIRED]: 'Session expired',
      [ErrorCode.INSUFFICIENT_PERMISSION]: 'Insufficient permissions',
      [ErrorCode.OWNERSHIP_VIOLATION]: 'Access denied',
      [ErrorCode.NOT_FOUND]: 'Resource not found',
      [ErrorCode.CONFLICT]: 'Resource conflict',
      [ErrorCode.DB_ERROR]: 'Database error',
      [ErrorCode.PAYMENT_STRIPE_ERROR]: 'Payment processing error',
      [ErrorCode.INTERNAL_ERROR]: 'Internal server error',
      [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable',
    };
    return messages[code] || 'An error occurred';
  }

  /** Convert to a client-safe JSON response */
  toClientResponse(): { error: string; code: string; traceId: string } {
    return {
      error: this.clientMessage,
      code: this.code,
      traceId: this.traceId,
    };
  }

  /** Convert to a structured log entry */
  toLogEntry(): Record<string, unknown> {
    return {
      errorCode: this.code,
      httpStatus: this.httpStatus,
      traceId: this.traceId,
      retryable: this.retryable,
      context: this.context,
      internalMessage: this.message,
      cause: this.cause?.message,
    };
  }
}

// ============================================================
// SPECIALIZED ERROR CLASSES
// ============================================================

export class ValidationError extends AppError {
  constructor(options: { message: string; traceId?: string; context?: ErrorContext }) {
    super(ErrorCode.VALIDATION_FAILED, {
      ...options,
      httpStatus: 400,
      clientMessage: options.message,
    });
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(options: { message?: string; traceId?: string; code?: ErrorCode }) {
    super(options.code || ErrorCode.UNAUTHENTICATED, {
      message: options.message || 'Authentication required',
      traceId: options.traceId,
      httpStatus: 401,
      clientMessage: options.message || 'Authentication required',
    });
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(options: { message?: string; traceId?: string; code?: ErrorCode; context?: ErrorContext }) {
    super(options.code || ErrorCode.INSUFFICIENT_PERMISSION, {
      message: options.message || 'Insufficient permissions',
      traceId: options.traceId,
      context: options.context,
      httpStatus: 403,
      clientMessage: options.message || 'Access denied',
    });
    this.name = 'AuthorizationError';
  }
}

export class DatabaseError extends AppError {
  constructor(options: { message: string; traceId?: string; code?: ErrorCode; context?: ErrorContext; cause?: Error; retryable?: boolean }) {
    super(options.code || ErrorCode.DB_ERROR, {
      message: options.message,
      traceId: options.traceId,
      context: options.context,
      cause: options.cause,
      retryable: options.retryable ?? false,
      httpStatus: 500,
      clientMessage: 'A database error occurred',
    });
    this.name = 'DatabaseError';
  }
}

export class PaymentError extends AppError {
  constructor(options: { message: string; traceId?: string; code?: ErrorCode; context?: ErrorContext; cause?: Error; retryable?: boolean; clientMessage?: string }) {
    super(options.code || ErrorCode.PAYMENT_STRIPE_ERROR, {
      message: options.message,
      traceId: options.traceId,
      context: options.context,
      cause: options.cause,
      retryable: options.retryable ?? false,
      clientMessage: options.clientMessage || 'Payment processing error',
    });
    this.name = 'PaymentError';
  }
}

export class NotFoundError extends AppError {
  constructor(options: { resource: string; id?: string; traceId?: string }) {
    super(ErrorCode.NOT_FOUND, {
      message: `${options.resource} not found${options.id ? `: ${options.id}` : ''}`,
      traceId: options.traceId,
      context: { resource: options.resource, id: options.id },
      httpStatus: 404,
      clientMessage: `${options.resource} not found`,
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(options: { message: string; traceId?: string; context?: ErrorContext }) {
    super(ErrorCode.CONFLICT, {
      message: options.message,
      traceId: options.traceId,
      context: options.context,
      httpStatus: 409,
      clientMessage: options.message,
    });
    this.name = 'ConflictError';
  }
}

// ============================================================
// ERROR UTILITIES
// ============================================================

/** Extract a safe error message from unknown error */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    return typeof message === 'string' ? message : 'An unknown error occurred';
  }
  return 'An unknown error occurred';
}

/** Convert unknown error to AppError */
export function toAppError(error: unknown, traceId?: string): AppError {
  if (error instanceof AppError) return error;

  // Check for Supabase/PostgreSQL error codes on any object (Error or plain object)
  const errorObj = error as { code?: string; message?: string };
  if (errorObj && typeof errorObj === 'object') {
    if (errorObj.code === '23505') {
      return new ConflictError({ message: errorObj.message || 'Resource already exists', traceId, context: { pgCode: errorObj.code } });
    }
    if (errorObj.code?.startsWith('23')) {
      return new DatabaseError({ message: errorObj.message || 'Constraint violation', traceId, context: { pgCode: errorObj.code }, cause: error instanceof Error ? error : undefined });
    }
  }

  if (error instanceof Error) {
    return new AppError(ErrorCode.INTERNAL_ERROR, { message: error.message, traceId, cause: error });
  }
  return new AppError(ErrorCode.INTERNAL_ERROR, { message: getErrorMessage(error), traceId });
}

/** Map Stripe error to AppError */
export function fromStripeError(error: { type?: string; code?: string; message?: string }, traceId?: string): PaymentError {
  const message = error.message || 'Stripe error';

  if (error.type === 'rate_limit_error') {
    return new PaymentError({ message, traceId, code: ErrorCode.PAYMENT_STRIPE_RATE_LIMIT, retryable: true });
  }
  if (error.type === 'authentication_error' || error.type === 'invalid_request_error') {
    return new PaymentError({ message, traceId, code: ErrorCode.PAYMENT_STRIPE_ERROR, retryable: false });
  }
  if (error.type === 'api_connection_error') {
    return new PaymentError({ message, traceId, code: ErrorCode.PAYMENT_STRIPE_ERROR, retryable: true });
  }
  if (error.code === 'charge_disputed') {
    return new PaymentError({ message, traceId, code: ErrorCode.PAYMENT_STRIPE_REFUND_FAILED, clientMessage: 'Charge has been disputed' });
  }

  return new PaymentError({ message, traceId, code: ErrorCode.PAYMENT_STRIPE_ERROR, retryable: false });
}

/** Map database error to AppError */
export function fromDatabaseError(error: { code?: string; message?: string; details?: string }, traceId?: string): DatabaseError {
  const message = error.message || 'Database error';

  if (error.code === '23505') {
    return new DatabaseError({ message: 'Duplicate key violation', traceId, code: ErrorCode.DB_CONSTRAINT_VIOLATION, context: { pgCode: error.code } });
  }
  if (error.code === '23503') {
    return new DatabaseError({ message: 'Foreign key constraint violation', traceId, code: ErrorCode.DB_CONSTRAINT_VIOLATION, context: { pgCode: error.code } });
  }
  if (error.code?.startsWith('08')) {
    return new DatabaseError({ message, traceId, code: ErrorCode.DB_CONNECTION_ERROR, retryable: true, context: { pgCode: error.code } });
  }

  return new DatabaseError({ message, traceId, context: { pgCode: error.code, details: error.details } });
}
