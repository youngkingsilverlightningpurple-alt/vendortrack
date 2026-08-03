/**
 * @fileOverview Payment Error Classification & Structured Logging
 *
 * Categorizes every payment error into:
 *   - Stripe errors (API, rate-limit, auth, validation)
 *   - Network errors (timeout, DNS, connection)
 *   - Validation errors (business rule violations)
 *   - Database errors (constraint, connection, timeout)
 *   - Webhook errors (signature, replay, processing)
 *
 * Each error includes a structured code, HTTP status, retryability flag,
 * and a human-readable message safe for client responses.
 *
 * SECURITY: Never expose internal error details to the client.
 * Only the `clientMessage` field is safe to return in API responses.
 */

import { getErrorMessage, type ErrorContext, type LogData } from '@/types';

// ============================================================
// ERROR CATEGORIES
// ============================================================

export enum PaymentErrorCategory {
  STRIPE = 'stripe',
  NETWORK = 'network',
  VALIDATION = 'validation',
  DATABASE = 'database',
  WEBHOOK = 'webhook',
  INTERNAL = 'internal',
}

// ============================================================
// ERROR CODES
// ============================================================

export enum PaymentErrorCode {
  // Stripe errors
  STRIPE_API_ERROR = 'STRIPE_API_ERROR',
  STRIPE_RATE_LIMIT = 'STRIPE_RATE_LIMIT',
  STRIPE_AUTH_ERROR = 'STRIPE_AUTH_ERROR',
  STRIPE_INVALID_REQUEST = 'STRIPE_INVALID_REQUEST',
  STRIPE_CONNECTION_ERROR = 'STRIPE_CONNECTION_ERROR',
  STRIPE_REFUND_FAILED = 'STRIPE_REFUND_FAILED',
  STRIPE_PAYMENT_FAILED = 'STRIPE_PAYMENT_FAILED',
  STRIPE_CHARGE_DISPUTED = 'STRIPE_CHARGE_DISPUTED',

  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_DNS = 'NETWORK_DNS',
  NETWORK_CONNECTION = 'NETWORK_CONNECTION',
  NETWORK_SSL = 'NETWORK_SSL',

  // Validation errors
  VALIDATION_SESSION_EXPIRED = 'VALIDATION_SESSION_EXPIRED',
  VALIDATION_PRICE_MISMATCH = 'VALIDATION_PRICE_MISMATCH',
  VALIDATION_INSUFFICIENT_STOCK = 'VALIDATION_INSUFFICIENT_STOCK',
  VALIDATION_SELLER_NOT_CONNECTED = 'VALIDATION_SELLER_NOT_CONNECTED',
  VALIDATION_INVALID_COMMISSION = 'VALIDATION_INVALID_COMMISSION',
  VALIDATION_INVALID_CURRENCY = 'VALIDATION_INVALID_CURRENCY',
  VALIDATION_DUPLICATE_PAYMENT = 'VALIDATION_DUPLICATE_PAYMENT',
  VALIDATION_INVALID_AMOUNT = 'VALIDATION_INVALID_AMOUNT',
  VALIDATION_ORDER_NOT_REFUNDABLE = 'VALIDATION_ORDER_NOT_REFUNDABLE',
  VALIDATION_ALREADY_REFUNDED = 'VALIDATION_ALREADY_REFUNDED',
  VALIDATION_CART_MISMATCH = 'VALIDATION_CART_MISMATCH',

  // Database errors
  DATABASE_CONSTRAINT = 'DATABASE_CONSTRAINT',
  DATABASE_CONNECTION = 'DATABASE_CONNECTION',
  DATABASE_TIMEOUT = 'DATABASE_TIMEOUT',
  DATABASE_RPC_FAILED = 'DATABASE_RPC_FAILED',
  DATABASE_TRANSACTION_FAILED = 'DATABASE_TRANSACTION_FAILED',

  // Webhook errors
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',
  WEBHOOK_REPLAY_DETECTED = 'WEBHOOK_REPLAY_DETECTED',
  WEBHOOK_PROCESSING_FAILED = 'WEBHOOK_PROCESSING_FAILED',
  WEBHOOK_EVENT_MISSING = 'WEBHOOK_EVENT_MISSING',

  // Internal errors
  INTERNAL_STATE_ERROR = 'INTERNAL_STATE_ERROR',
  INTERNAL_LEDGER_ERROR = 'INTERNAL_LEDGER_ERROR',
  INTERNAL_RECONCILIATION_ERROR = 'INTERNAL_RECONCILIATION_ERROR',
}

// ============================================================
// ERROR METADATA
// ============================================================

interface ErrorMetadata {
  code: PaymentErrorCode;
  category: PaymentErrorCategory;
  httpStatus: number;
  retryable: boolean;
  clientMessage: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  maxRetries: number;
}

const ERROR_METADATA: Record<PaymentErrorCode, ErrorMetadata> = {
  // Stripe errors
  [PaymentErrorCode.STRIPE_API_ERROR]: {
    code: PaymentErrorCode.STRIPE_API_ERROR,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 502,
    retryable: true,
    clientMessage: 'Payment service temporarily unavailable. Please try again.',
    severity: 'ERROR',
    maxRetries: 3,
  },
  [PaymentErrorCode.STRIPE_RATE_LIMIT]: {
    code: PaymentErrorCode.STRIPE_RATE_LIMIT,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 429,
    retryable: true,
    clientMessage: 'Too many requests. Please wait and try again.',
    severity: 'WARN',
    maxRetries: 5,
  },
  [PaymentErrorCode.STRIPE_AUTH_ERROR]: {
    code: PaymentErrorCode.STRIPE_AUTH_ERROR,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 401,
    retryable: false,
    clientMessage: 'Payment configuration error. Contact support.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },
  [PaymentErrorCode.STRIPE_INVALID_REQUEST]: {
    code: PaymentErrorCode.STRIPE_INVALID_REQUEST,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Invalid payment request. Please review your order.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.STRIPE_CONNECTION_ERROR]: {
    code: PaymentErrorCode.STRIPE_CONNECTION_ERROR,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 502,
    retryable: true,
    clientMessage: 'Payment service temporarily unavailable. Please try again.',
    severity: 'ERROR',
    maxRetries: 3,
  },
  [PaymentErrorCode.STRIPE_REFUND_FAILED]: {
    code: PaymentErrorCode.STRIPE_REFUND_FAILED,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 502,
    retryable: true,
    clientMessage: 'Refund processing failed. Please try again or contact support.',
    severity: 'CRITICAL',
    maxRetries: 3,
  },
  [PaymentErrorCode.STRIPE_PAYMENT_FAILED]: {
    code: PaymentErrorCode.STRIPE_PAYMENT_FAILED,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 402,
    retryable: false,
    clientMessage: 'Payment was declined. Please try a different payment method.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.STRIPE_CHARGE_DISPUTED]: {
    code: PaymentErrorCode.STRIPE_CHARGE_DISPUTED,
    category: PaymentErrorCategory.STRIPE,
    httpStatus: 409,
    retryable: false,
    clientMessage: 'This charge is under dispute. Contact support.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },

  // Network errors
  [PaymentErrorCode.NETWORK_TIMEOUT]: {
    code: PaymentErrorCode.NETWORK_TIMEOUT,
    category: PaymentErrorCategory.NETWORK,
    httpStatus: 504,
    retryable: true,
    clientMessage: 'Request timed out. Please try again.',
    severity: 'WARN',
    maxRetries: 3,
  },
  [PaymentErrorCode.NETWORK_DNS]: {
    code: PaymentErrorCode.NETWORK_DNS,
    category: PaymentErrorCategory.NETWORK,
    httpStatus: 502,
    retryable: true,
    clientMessage: 'Service temporarily unavailable. Please try again.',
    severity: 'ERROR',
    maxRetries: 3,
  },
  [PaymentErrorCode.NETWORK_CONNECTION]: {
    code: PaymentErrorCode.NETWORK_CONNECTION,
    category: PaymentErrorCategory.NETWORK,
    httpStatus: 502,
    retryable: true,
    clientMessage: 'Could not connect to payment service. Please try again.',
    severity: 'ERROR',
    maxRetries: 3,
  },
  [PaymentErrorCode.NETWORK_SSL]: {
    code: PaymentErrorCode.NETWORK_SSL,
    category: PaymentErrorCategory.NETWORK,
    httpStatus: 502,
    retryable: false,
    clientMessage: 'Secure connection error. Please try again.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },

  // Validation errors
  [PaymentErrorCode.VALIDATION_SESSION_EXPIRED]: {
    code: PaymentErrorCode.VALIDATION_SESSION_EXPIRED,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Your checkout session has expired. Please start a new checkout.',
    severity: 'INFO',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_PRICE_MISMATCH]: {
    code: PaymentErrorCode.VALIDATION_PRICE_MISMATCH,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Price has changed since checkout started. Please review your order.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_INSUFFICIENT_STOCK]: {
    code: PaymentErrorCode.VALIDATION_INSUFFICIENT_STOCK,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 409,
    retryable: false,
    clientMessage: 'Some items are out of stock. Please update your cart.',
    severity: 'INFO',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_SELLER_NOT_CONNECTED]: {
    code: PaymentErrorCode.VALIDATION_SELLER_NOT_CONNECTED,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'The seller cannot accept payments right now. Please try again later.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_INVALID_COMMISSION]: {
    code: PaymentErrorCode.VALIDATION_INVALID_COMMISSION,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 500,
    retryable: false,
    clientMessage: 'Internal pricing error. Please contact support.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_INVALID_CURRENCY]: {
    code: PaymentErrorCode.VALIDATION_INVALID_CURRENCY,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Currency not supported.',
    severity: 'INFO',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_DUPLICATE_PAYMENT]: {
    code: PaymentErrorCode.VALIDATION_DUPLICATE_PAYMENT,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 409,
    retryable: false,
    clientMessage: 'This payment has already been processed.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_INVALID_AMOUNT]: {
    code: PaymentErrorCode.VALIDATION_INVALID_AMOUNT,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Invalid payment amount.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_ORDER_NOT_REFUNDABLE]: {
    code: PaymentErrorCode.VALIDATION_ORDER_NOT_REFUNDABLE,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'This order cannot be refunded at this time.',
    severity: 'INFO',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_ALREADY_REFUNDED]: {
    code: PaymentErrorCode.VALIDATION_ALREADY_REFUNDED,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 409,
    retryable: false,
    clientMessage: 'This order has already been refunded.',
    severity: 'WARN',
    maxRetries: 0,
  },
  [PaymentErrorCode.VALIDATION_CART_MISMATCH]: {
    code: PaymentErrorCode.VALIDATION_CART_MISMATCH,
    category: PaymentErrorCategory.VALIDATION,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Your cart has changed. Please review your order.',
    severity: 'INFO',
    maxRetries: 0,
  },

  // Database errors
  [PaymentErrorCode.DATABASE_CONSTRAINT]: {
    code: PaymentErrorCode.DATABASE_CONSTRAINT,
    category: PaymentErrorCategory.DATABASE,
    httpStatus: 409,
    retryable: false,
    clientMessage: 'A data conflict occurred. Please try again.',
    severity: 'ERROR',
    maxRetries: 0,
  },
  [PaymentErrorCode.DATABASE_CONNECTION]: {
    code: PaymentErrorCode.DATABASE_CONNECTION,
    category: PaymentErrorCategory.DATABASE,
    httpStatus: 503,
    retryable: true,
    clientMessage: 'Service temporarily unavailable. Please try again.',
    severity: 'CRITICAL',
    maxRetries: 3,
  },
  [PaymentErrorCode.DATABASE_TIMEOUT]: {
    code: PaymentErrorCode.DATABASE_TIMEOUT,
    category: PaymentErrorCategory.DATABASE,
    httpStatus: 504,
    retryable: true,
    clientMessage: 'Request timed out. Please try again.',
    severity: 'ERROR',
    maxRetries: 3,
  },
  [PaymentErrorCode.DATABASE_RPC_FAILED]: {
    code: PaymentErrorCode.DATABASE_RPC_FAILED,
    category: PaymentErrorCategory.DATABASE,
    httpStatus: 500,
    retryable: true,
    clientMessage: 'Internal processing error. Please try again.',
    severity: 'CRITICAL',
    maxRetries: 2,
  },
  [PaymentErrorCode.DATABASE_TRANSACTION_FAILED]: {
    code: PaymentErrorCode.DATABASE_TRANSACTION_FAILED,
    category: PaymentErrorCategory.DATABASE,
    httpStatus: 500,
    retryable: true,
    clientMessage: 'Transaction failed. Please try again.',
    severity: 'CRITICAL',
    maxRetries: 2,
  },

  // Webhook errors
  [PaymentErrorCode.WEBHOOK_SIGNATURE_INVALID]: {
    code: PaymentErrorCode.WEBHOOK_SIGNATURE_INVALID,
    category: PaymentErrorCategory.WEBHOOK,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Invalid webhook signature.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },
  [PaymentErrorCode.WEBHOOK_REPLAY_DETECTED]: {
    code: PaymentErrorCode.WEBHOOK_REPLAY_DETECTED,
    category: PaymentErrorCategory.WEBHOOK,
    httpStatus: 200,
    retryable: false,
    clientMessage: 'Duplicate webhook event.',
    severity: 'INFO',
    maxRetries: 0,
  },
  [PaymentErrorCode.WEBHOOK_PROCESSING_FAILED]: {
    code: PaymentErrorCode.WEBHOOK_PROCESSING_FAILED,
    category: PaymentErrorCategory.WEBHOOK,
    httpStatus: 500,
    retryable: true,
    clientMessage: 'Webhook processing failed.',
    severity: 'CRITICAL',
    maxRetries: 3,
  },
  [PaymentErrorCode.WEBHOOK_EVENT_MISSING]: {
    code: PaymentErrorCode.WEBHOOK_EVENT_MISSING,
    category: PaymentErrorCategory.WEBHOOK,
    httpStatus: 400,
    retryable: false,
    clientMessage: 'Missing webhook event data.',
    severity: 'ERROR',
    maxRetries: 0,
  },

  // Internal errors
  [PaymentErrorCode.INTERNAL_STATE_ERROR]: {
    code: PaymentErrorCode.INTERNAL_STATE_ERROR,
    category: PaymentErrorCategory.INTERNAL,
    httpStatus: 500,
    retryable: false,
    clientMessage: 'Internal error. Please contact support.',
    severity: 'CRITICAL',
    maxRetries: 0,
  },
  [PaymentErrorCode.INTERNAL_LEDGER_ERROR]: {
    code: PaymentErrorCode.INTERNAL_LEDGER_ERROR,
    category: PaymentErrorCategory.INTERNAL,
    httpStatus: 500,
    retryable: true,
    clientMessage: 'Financial recording error. Please contact support.',
    severity: 'CRITICAL',
    maxRetries: 2,
  },
  [PaymentErrorCode.INTERNAL_RECONCILIATION_ERROR]: {
    code: PaymentErrorCode.INTERNAL_RECONCILIATION_ERROR,
    category: PaymentErrorCategory.INTERNAL,
    httpStatus: 500,
    retryable: true,
    clientMessage: 'Reconciliation error. Please contact support.',
    severity: 'CRITICAL',
    maxRetries: 2,
  },
};

// ============================================================
// PAYMENT ERROR CLASS
// ============================================================

export class PaymentError extends Error {
  public readonly code: PaymentErrorCode;
  public readonly category: PaymentErrorCategory;
  public readonly httpStatus: number;
  public readonly retryable: boolean;
  public readonly clientMessage: string;
  public readonly severity: 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  public readonly maxRetries: number;
  public readonly traceId: string;
  public readonly timestamp: string;
  public readonly context: ErrorContext;

  constructor(
    code: PaymentErrorCode,
    options?: {
      message?: string;
      traceId?: string;
      cause?: Error;
      context?: ErrorContext;
    }
  ) {
    const meta = ERROR_METADATA[code];
    super(options?.message || meta.clientMessage);

    this.name = 'PaymentError';
    this.code = code;
    this.category = meta.category;
    this.httpStatus = meta.httpStatus;
    this.retryable = meta.retryable;
    this.clientMessage = meta.clientMessage;
    this.severity = meta.severity;
    this.maxRetries = meta.maxRetries;
    this.traceId = options?.traceId || `pe_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.timestamp = new Date().toISOString();
    this.context = options?.context || {};

    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  /** Convert to a structured log object for audit/logging */
  toLog(): { type: string; code: PaymentErrorCode; category: PaymentErrorCategory; httpStatus: number; retryable: boolean; severity: string; traceId: string; timestamp: string; message: string; context: ErrorContext } {
    return {
      type: 'PaymentError',
      code: this.code,
      category: this.category,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      severity: this.severity,
      traceId: this.traceId,
      timestamp: this.timestamp,
      message: this.message,
      context: this.context,
    };
  }

  /** Convert to a client-safe response (no internal details) */
  toClientResponse(): { error: string; code: string; traceId: string } {
    return {
      error: this.clientMessage,
      code: this.code,
      traceId: this.traceId,
    };
  }
}

// ============================================================
// ERROR PARSING UTILITIES
// ============================================================

/**
 * Parse a Stripe SDK error into a PaymentError.
 */
export function fromStripeError(err: unknown, traceId?: string): PaymentError {
  const e = (err && typeof err === 'object') ? err as Record<string, unknown> : {};
  const stripeType = typeof e.type === 'string' ? e.type : '';
  const stripeCode = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined;
  const declineCode = typeof e.decline_code === 'string' ? e.decline_code : undefined;

  if (statusCode === 401 || stripeType === 'authentication_error') {
    return new PaymentError(PaymentErrorCode.STRIPE_AUTH_ERROR, {
      message: `Stripe auth error: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { stripeType, stripeCode },
    });
  }

  if (statusCode === 429 || stripeType === 'rate_limit_error') {
    return new PaymentError(PaymentErrorCode.STRIPE_RATE_LIMIT, {
      message: `Stripe rate limit: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { stripeType, stripeCode },
    });
  }

  if (stripeType === 'card_error') {
    return new PaymentError(PaymentErrorCode.STRIPE_PAYMENT_FAILED, {
      message: `Stripe card error: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { stripeType, stripeCode, declineCode },
    });
  }

  if (stripeType === 'invalid_request_error') {
    return new PaymentError(PaymentErrorCode.STRIPE_INVALID_REQUEST, {
      message: `Stripe invalid request: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { stripeType, stripeCode },
    });
  }

  if (stripeType === 'api_connection_error') {
    return new PaymentError(PaymentErrorCode.STRIPE_CONNECTION_ERROR, {
      message: `Stripe connection error: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { stripeType, stripeCode },
    });
  }

  return new PaymentError(PaymentErrorCode.STRIPE_API_ERROR, {
    message: `Stripe API error: ${message}`,
    traceId,
    cause: err instanceof Error ? err : undefined,
    context: { stripeType, stripeCode, statusCode },
  });
}

/**
 * Parse a Supabase/PostgreSQL error into a PaymentError.
 */
export function fromDatabaseError(err: unknown, traceId?: string): PaymentError {
  const e = (err && typeof err === 'object') ? err as Record<string, unknown> : {};
  const pgCode = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : 'Unknown database error';
  const details = typeof e.details === 'string' ? e.details : '';

  // Unique violation
  if (pgCode === '23505') {
    return new PaymentError(PaymentErrorCode.DATABASE_CONSTRAINT, {
      message: `Unique constraint violation: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { pgCode },
    });
  }

  // Check violation
  if (pgCode === '23514') {
    return new PaymentError(PaymentErrorCode.DATABASE_CONSTRAINT, {
      message: `Check constraint violation: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { pgCode },
    });
  }

  // Connection errors
  if (message.includes('timeout') || pgCode === '57014') {
    return new PaymentError(PaymentErrorCode.DATABASE_TIMEOUT, {
      message: `Database timeout: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { pgCode },
    });
  }

  if (message.includes('connection') || pgCode.startsWith('08')) {
    return new PaymentError(PaymentErrorCode.DATABASE_CONNECTION, {
      message: `Database connection error: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { pgCode },
    });
  }

  // RPC failure
  if (message.includes('RPC') || details.includes('function')) {
    return new PaymentError(PaymentErrorCode.DATABASE_RPC_FAILED, {
      message: `Database RPC failed: ${message}`,
      traceId,
      cause: err instanceof Error ? err : undefined,
      context: { pgCode },
    });
  }

  return new PaymentError(PaymentErrorCode.DATABASE_TRANSACTION_FAILED, {
    message: `Database error: ${message}`,
    traceId,
    cause: err instanceof Error ? err : undefined,
    context: { pgCode },
  });
}

/**
 * Parse a network/unknown error into a PaymentError.
 */
export function fromUnknownError(err: unknown, traceId?: string): PaymentError {
  if (err instanceof PaymentError) return err;

  const message = getErrorMessage(err);

  if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
    return new PaymentError(PaymentErrorCode.NETWORK_TIMEOUT, {
      message,
      traceId,
      cause: err instanceof Error ? err : undefined,
    });
  }

  if (message.includes('ENOTFOUND') || message.includes('DNS')) {
    return new PaymentError(PaymentErrorCode.NETWORK_DNS, {
      message,
      traceId,
      cause: err instanceof Error ? err : undefined,
    });
  }

  if (message.includes('ECONNREFUSED') || message.includes('connection')) {
    return new PaymentError(PaymentErrorCode.NETWORK_CONNECTION, {
      message,
      traceId,
      cause: err instanceof Error ? err : undefined,
    });
  }

  if (message.includes('SSL') || message.includes('certificate')) {
    return new PaymentError(PaymentErrorCode.NETWORK_SSL, {
      message,
      traceId,
      cause: err instanceof Error ? err : undefined,
    });
  }

  return new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
    message,
    traceId,
    cause: err instanceof Error ? err : undefined,
  });
}

// ============================================================
// STRUCTURED PAYMENT LOGGER
// ============================================================

export type PaymentLogEntry = {
  traceId: string;
  event: string;
  category: PaymentErrorCategory | 'lifecycle' | 'reconciliation' | 'ledger' | 'queue' | 'internal';
  severity: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  data?: LogData;
  error?: PaymentError;
  timestamp: string;
};

/**
 * Structured payment logger.
 * Outputs JSON-formatted logs to console for log aggregation.
 * Also writes to the audit_logs table for critical events.
 */
export const PaymentLogger = {
  log(entry: Omit<PaymentLogEntry, 'timestamp'>): void {
    const fullEntry: PaymentLogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Console output (structured JSON for log aggregation)
    const logLevel = entry.severity === 'CRITICAL' || entry.severity === 'ERROR'
      ? console.error
      : entry.severity === 'WARN'
        ? console.warn
        : console.log;

    logLevel(JSON.stringify(fullEntry));

    // For CRITICAL errors, also write to audit_logs
    if (entry.severity === 'CRITICAL' || entry.severity === 'ERROR') {
      writeAuditLog(fullEntry).catch(() => {
        // Audit logging must never break the payment flow
      });
    }
  },

  info(traceId: string, event: string, message: string, data?: LogData): void {
    PaymentLogger.log({ traceId, event, category: 'lifecycle', severity: 'INFO', message, data });
  },

  warn(traceId: string, event: string, message: string, data?: LogData): void {
    PaymentLogger.log({ traceId, event, category: 'lifecycle', severity: 'WARN', message, data });
  },

  error(traceId: string, event: string, error: PaymentError | Error, data?: LogData): void {
    if (error instanceof PaymentError) {
      PaymentLogger.log({
        traceId,
        event,
        category: error.category,
        severity: error.severity,
        message: error.message,
        data: { ...data, ...error.context },
        error,
      });
    } else {
      PaymentLogger.log({
        traceId,
        event,
        category: 'internal',
        severity: 'ERROR',
        message: error.message,
        data,
      });
    }
  },

  critical(traceId: string, event: string, message: string, data?: LogData): void {
    PaymentLogger.log({ traceId, event, category: 'internal', severity: 'CRITICAL', message, data });
  },
};

/** Write a critical payment log to the audit_logs table */
async function writeAuditLog(entry: PaymentLogEntry): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
    const admin = getSupabaseAdmin();
    await ((admin.from('audit_logs') as any) as any).insert({
      trace_id: entry.traceId,
      event_type: `PAYMENT_${entry.event}`,
      severity: entry.severity,
      payload: {
        category: entry.category,
        message: entry.message,
        data: entry.data,
        error: entry.error?.toLog(),
      },
    } as any);
  } catch {
    // Audit logging must never break the payment flow
  }
}
