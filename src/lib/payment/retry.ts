/**
 * @fileOverview Exponential Backoff Retry Strategy
 *
 * Implements retry logic for all payment operations:
 *   - Webhooks (processing failures)
 *   - Refunds (Stripe API failures)
 *   - Transfers (Connect destination failures)
 *   - Notifications (email/push failures)
 *
 * Design principles:
 *   - Never retry forever (bounded by maxRetries)
 *   - Exponential backoff with jitter (prevent thundering herd)
 *   - Only retry retryable errors
 *   - Full observability via PaymentLogger
 *   - Circuit breaker for repeated failures
 *
 * SECURITY: Retry operations must be idempotent.
 */

import { PaymentError, PaymentErrorCode } from './errors';
import { PaymentLogger } from './errors';
import { getErrorMessage } from '@/types';

// ============================================================
// CONFIGURATION
// ============================================================

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff (typically 2) */
  multiplier: number;
  /** Whether to add jitter to prevent thundering herd */
  jitter: boolean;
  /** Operation name for logging */
  operationName: string;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  multiplier: 2,
  jitter: true,
  operationName: 'unknown',
};

/** Predefined configs for specific operations */
export const RETRY_CONFIGS = {
  /** Webhook processing retry — fast initial, longer backoff */
  webhook: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    multiplier: 2,
    jitter: true,
    operationName: 'webhook_process',
  } satisfies RetryConfig,

  /** Refund API call retry — moderate */
  refund: {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    multiplier: 2,
    jitter: true,
    operationName: 'refund_create',
  } satisfies RetryConfig,

  /** Transfer/payout retry — slower */
  transfer: {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    multiplier: 2,
    jitter: true,
    operationName: 'transfer_create',
  } satisfies RetryConfig,

  /** Notification retry — lightweight */
  notification: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 15000,
    multiplier: 2,
    jitter: true,
    operationName: 'notification_send',
  } satisfies RetryConfig,

  /** Database operation retry */
  database: {
    maxRetries: 2,
    baseDelayMs: 500,
    maxDelayMs: 10000,
    multiplier: 2,
    jitter: true,
    operationName: 'database_operation',
  } satisfies RetryConfig,

  /** Reconciliation retry */
  reconciliation: {
    maxRetries: 3,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    multiplier: 2,
    jitter: true,
    operationName: 'reconciliation',
  } satisfies RetryConfig,
};

// ============================================================
// CIRCUIT BREAKER
// ============================================================

interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  openedAt: number;
}

const circuitBreakers = new Map<string, CircuitBreakerState>();

const CIRCUIT_BREAKER_THRESHOLD = 5; // Open after 5 failures
const CIRCUIT_BREAKER_RESET_MS = 60000; // Try again after 60s

/**
 * Check if a circuit breaker allows the operation.
 * Returns true if the operation should proceed, false if it should be rejected.
 */
function circuitBreakerAllows(key: string): boolean {
  let breaker = circuitBreakers.get(key);

  if (!breaker) {
    breaker = { failures: 0, lastFailureTime: 0, state: 'closed', openedAt: 0 };
    circuitBreakers.set(key, breaker);
  }

  if (breaker.state === 'closed') {
    return true;
  }

  if (breaker.state === 'open') {
    const elapsed = Date.now() - breaker.openedAt;
    if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
      breaker.state = 'half-open';
      return true; // Allow one attempt
    }
    return false; // Still open
  }

  // half-open: allow one attempt
  return true;
}

/**
 * Record a success/failure for the circuit breaker.
 */
function recordCircuitBreakerResult(key: string, success: boolean): void {
  let breaker = circuitBreakers.get(key);
  if (!breaker) {
    breaker = { failures: 0, lastFailureTime: 0, state: 'closed', openedAt: 0 };
    circuitBreakers.set(key, breaker);
  }

  if (success) {
    breaker.failures = 0;
    breaker.state = 'closed';
  } else {
    breaker.failures++;
    breaker.lastFailureTime = Date.now();
    if (breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      breaker.state = 'open';
      breaker.openedAt = Date.now();
    }
  }
}

// ============================================================
// DELAY CALCULATION
// ============================================================

/**
 * Calculate the delay for a given retry attempt with exponential backoff + jitter.
 */
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelayMs * Math.pow(config.multiplier, attempt);

  let delay = Math.min(exponentialDelay, config.maxDelayMs);

  if (config.jitter) {
    // Full jitter: random between 0 and the calculated delay
    delay = Math.random() * delay;
  }

  return Math.round(delay);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// RETRY EXECUTOR
// ============================================================

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: PaymentError;
  attempts: number;
  totalDelayMs: number;
  traceId: string;
}

/**
 * Execute an operation with exponential backoff retry.
 *
 * Only retries if the error is retryable and the circuit breaker allows it.
 * Never retries forever.
 *
 * @param operation - The async function to execute
 * @param config - Retry configuration
 * @param traceId - Trace ID for logging
 * @returns The result of the operation or the last error
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  traceId?: string
): Promise<RetryResult<T>> {
  const fullConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const tid = traceId || `retry_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const breakerKey = fullConfig.operationName;

  let lastError: PaymentError | undefined;
  let totalDelayMs = 0;
  let attempts = 0;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    attempts++;

    // Check circuit breaker
    if (!circuitBreakerAllows(breakerKey)) {
      PaymentLogger.warn(tid, `${fullConfig.operationName}_circuit_open`, 'Circuit breaker is open, rejecting operation');
      return {
        success: false,
        error: new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
          message: `Circuit breaker open for ${fullConfig.operationName}`,
          traceId: tid,
          context: { failures: circuitBreakers.get(breakerKey)?.failures },
        }),
        attempts,
        totalDelayMs,
        traceId: tid,
      };
    }

    try {
      const result = await operation();
      recordCircuitBreakerResult(breakerKey, true);

      if (attempt > 0) {
        PaymentLogger.info(tid, `${fullConfig.operationName}_retry_success`, `Operation succeeded after ${attempt} retries`, {
          attempts,
          totalDelayMs,
        });
      }

      return { success: true, result, attempts, totalDelayMs, traceId: tid };
    } catch (error: unknown) {
      const paymentError = error instanceof PaymentError
        ? error
        : new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
            message: getErrorMessage(error),
            traceId: tid,
            cause: error instanceof Error ? error : undefined,
          });

      lastError = paymentError;
      recordCircuitBreakerResult(breakerKey, false);

      // Don't retry if error is not retryable
      if (!paymentError.retryable) {
        PaymentLogger.warn(tid, `${fullConfig.operationName}_non_retryable`, `Non-retryable error: ${paymentError.code}`, {
          code: paymentError.code,
          attempt,
        });
        return {
          success: false,
          error: paymentError,
          attempts,
          totalDelayMs,
          traceId: tid,
        };
      }

      // Don't retry if we've exhausted retries
      if (attempt >= fullConfig.maxRetries) {
        PaymentLogger.error(tid, `${fullConfig.operationName}_retries_exhausted`, paymentError, {
          attempts,
          totalDelayMs,
        });
        return {
          success: false,
          error: paymentError,
          attempts,
          totalDelayMs,
          traceId: tid,
        };
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, fullConfig);
      totalDelayMs += delay;

      PaymentLogger.warn(tid, `${fullConfig.operationName}_retry`, `Retrying after ${delay}ms (attempt ${attempt + 1}/${fullConfig.maxRetries})`, {
        code: paymentError.code,
        nextDelayMs: delay,
        attempt: attempt + 1,
        maxRetries: fullConfig.maxRetries,
      });

      await sleep(delay);
    }
  }

  // Should never reach here, but just in case
  return {
    success: false,
    error: lastError || new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, { traceId: tid }),
    attempts,
    totalDelayMs,
    traceId: tid,
  };
}

/**
 * Get the current state of all circuit breakers (for monitoring).
 */
export function getCircuitBreakerStatus(): Record<string, { state: string; failures: number; lastFailureTime: number }> {
  const status: Record<string, { state: string; failures: number; lastFailureTime: number }> = {};
  for (const [key, breaker] of circuitBreakers.entries()) {
    status[key] = {
      state: breaker.state,
      failures: breaker.failures,
      lastFailureTime: breaker.lastFailureTime,
    };
  }
  return status;
}
