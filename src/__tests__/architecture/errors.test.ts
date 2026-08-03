/**
 * @fileoverview Error Handling Framework Tests
 *
 * Tests the unified error hierarchy and utility functions.
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  DatabaseError,
  PaymentError,
  NotFoundError,
  ConflictError,
  ErrorCode,
  getErrorMessage,
  toAppError,
  fromStripeError,
  fromDatabaseError,
} from '@/lib/errors';

// ============================================================
// APP ERROR BASE CLASS
// ============================================================

describe('AppError', () => {
  it('creates with all fields', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, {
      message: 'Test error',
      traceId: 'tr_123',
      context: { key: 'value' },
      httpStatus: 500,
      retryable: true,
      clientMessage: 'Something went wrong',
    });

    expect(error.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(error.message).toBe('Test error');
    expect(error.traceId).toBe('tr_123');
    expect(error.context).toEqual({ key: 'value' });
    expect(error.httpStatus).toBe(500);
    expect(error.retryable).toBe(true);
    expect(error.clientMessage).toBe('Something went wrong');
  });

  it('provides default HTTP status from code', () => {
    const error = new AppError(ErrorCode.UNAUTHENTICATED);
    expect(error.httpStatus).toBe(401);
  });

  it('provides default client message from code', () => {
    const error = new AppError(ErrorCode.NOT_FOUND);
    expect(error.clientMessage).toBe('Resource not found');
  });

  it('toClientResponse returns safe response', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, {
      message: 'Internal stack trace details',
      traceId: 'tr_123',
      clientMessage: 'Internal server error',
    });

    const response = error.toClientResponse();
    expect(response.error).toBe('Internal server error');
    expect(response.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(response.traceId).toBe('tr_123');
    // Internal message should NOT be exposed
    expect(response.error).not.toContain('stack trace');
  });

  it('toLogEntry returns structured log data', () => {
    const error = new AppError(ErrorCode.DB_ERROR, {
      message: 'Connection failed',
      traceId: 'tr_123',
      context: { table: 'orders' },
    });

    const log = error.toLogEntry();
    expect(log.errorCode).toBe(ErrorCode.DB_ERROR);
    expect(log.traceId).toBe('tr_123');
    expect(log.context).toEqual({ table: 'orders' });
  });
});

// ============================================================
// SPECIALIZED ERROR CLASSES
// ============================================================

describe('ValidationError', () => {
  it('creates with 400 status', () => {
    const error = new ValidationError({ message: 'Invalid input' });
    expect(error.httpStatus).toBe(400);
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.clientMessage).toBe('Invalid input');
  });
});

describe('AuthenticationError', () => {
  it('creates with 401 status', () => {
    const error = new AuthenticationError({ message: 'Token expired' });
    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });
});

describe('AuthorizationError', () => {
  it('creates with 403 status', () => {
    const error = new AuthorizationError({ message: 'No admin access' });
    expect(error.httpStatus).toBe(403);
    expect(error.code).toBe(ErrorCode.INSUFFICIENT_PERMISSION);
  });
});

describe('DatabaseError', () => {
  it('creates with 500 status', () => {
    const error = new DatabaseError({ message: 'Query failed' });
    expect(error.httpStatus).toBe(500);
    expect(error.code).toBe(ErrorCode.DB_ERROR);
    expect(error.retryable).toBe(false);
  });

  it('supports retryable flag', () => {
    const error = new DatabaseError({ message: 'Connection timeout', retryable: true });
    expect(error.retryable).toBe(true);
  });
});

describe('PaymentError', () => {
  it('creates with custom code', () => {
    const error = new PaymentError({
      message: 'Stripe rate limited',
      code: ErrorCode.PAYMENT_STRIPE_RATE_LIMIT,
      retryable: true,
    });
    expect(error.code).toBe(ErrorCode.PAYMENT_STRIPE_RATE_LIMIT);
    expect(error.retryable).toBe(true);
  });
});

describe('NotFoundError', () => {
  it('creates with 404 status', () => {
    const error = new NotFoundError({ resource: 'Order', id: 'order_123' });
    expect(error.httpStatus).toBe(404);
    expect(error.message).toContain('Order');
    expect(error.message).toContain('order_123');
    expect(error.clientMessage).toBe('Order not found');
  });
});

describe('ConflictError', () => {
  it('creates with 409 status', () => {
    const error = new ConflictError({ message: 'Duplicate entry' });
    expect(error.httpStatus).toBe(409);
    expect(error.code).toBe(ErrorCode.CONFLICT);
  });
});

// ============================================================
// ERROR UTILITIES
// ============================================================

describe('getErrorMessage', () => {
  it('extracts message from AppError', () => {
    const error = new AppError(ErrorCode.INTERNAL_ERROR, { message: 'Test message' });
    expect(getErrorMessage(error)).toBe('Test message');
  });

  it('extracts message from Error', () => {
    expect(getErrorMessage(new Error('Standard error'))).toBe('Standard error');
  });

  it('returns string as-is', () => {
    expect(getErrorMessage('String error')).toBe('String error');
  });

  it('handles objects with message', () => {
    expect(getErrorMessage({ message: 'Object error' })).toBe('Object error');
  });

  it('returns default for unknown', () => {
    expect(getErrorMessage(null)).toBe('An unknown error occurred');
    expect(getErrorMessage(undefined)).toBe('An unknown error occurred');
    expect(getErrorMessage(42)).toBe('An unknown error occurred');
  });
});

describe('toAppError', () => {
  it('returns AppError as-is', () => {
    const error = new AppError(ErrorCode.NOT_FOUND);
    expect(toAppError(error)).toBe(error);
  });

  it('converts Error to AppError', () => {
    const result = toAppError(new Error('Standard error'), 'tr_123');
    expect(result).toBeInstanceOf(AppError);
    expect(result.message).toBe('Standard error');
    expect(result.traceId).toBe('tr_123');
  });

  it('converts unknown to AppError', () => {
    const result = toAppError('string error');
    expect(result).toBeInstanceOf(AppError);
    expect(result.code).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('detects Supabase unique constraint violation', () => {
    const result = toAppError({ code: '23505', message: 'Duplicate' });
    expect(result.httpStatus).toBe(409);
    expect(result.code).toBe(ErrorCode.CONFLICT);
  });
});

describe('fromStripeError', () => {
  it('maps rate limit error', () => {
    const result = fromStripeError({ type: 'rate_limit_error', message: 'Rate limited' });
    expect(result).toBeInstanceOf(PaymentError);
    expect(result.retryable).toBe(true);
  });

  it('maps authentication error', () => {
    const result = fromStripeError({ type: 'authentication_error', message: 'Invalid key' });
    expect(result).toBeInstanceOf(PaymentError);
    expect(result.retryable).toBe(false);
  });

  it('maps connection error as retryable', () => {
    const result = fromStripeError({ type: 'api_connection_error', message: 'Timeout' });
    expect(result.retryable).toBe(true);
  });
});

describe('fromDatabaseError', () => {
  it('maps unique constraint violation', () => {
    const result = fromDatabaseError({ code: '23505', message: 'Duplicate key' });
    expect(result.code).toBe(ErrorCode.DB_CONSTRAINT_VIOLATION);
  });

  it('maps foreign key violation', () => {
    const result = fromDatabaseError({ code: '23503', message: 'FK violation' });
    expect(result.code).toBe(ErrorCode.DB_CONSTRAINT_VIOLATION);
  });

  it('maps connection error as retryable', () => {
    const result = fromDatabaseError({ code: '08001', message: 'Connection failed' });
    expect(result.code).toBe(ErrorCode.DB_CONNECTION_ERROR);
    expect(result.retryable).toBe(true);
  });
});
