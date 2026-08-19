/**
 * @fileOverview Payment System — Public API
 *
 * Central import for all payment services.
 * Import from '@/lib/payment' to access any payment functionality.
 */

// Error handling
export { PaymentError, PaymentErrorCode, PaymentErrorCategory, PaymentLogger, fromStripeError, fromDatabaseError, fromUnknownError } from './errors';
export type { PaymentLogEntry } from './errors';

// Retry strategy
export { withRetry, calculateDelay, sleep, RETRY_CONFIGS, getCircuitBreakerStatus } from './retry';
export type { RetryConfig, RetryResult } from './retry';

// Refund service
export { processRefund, processAdminRefundDecision } from './refund-service';
export type { RefundRequest, RefundResult } from './refund-service';

// Ledger service
export { createLedgerEntry, createLedgerEntries, getOrderLedgerBalance, getOrderLedgerEntries, getPlatformLedgerSummary, verifyLedgerIntegrity } from './ledger-service';
export type { LedgerEventType, LedgerEntry, LedgerBalance } from './ledger-service';

// Queue system
// P0 FIX (war room): queue is now unified — `enqueueJob` delegates to
// `enqueueBackgroundJob` from `@/lib/performance/background-jobs`, which
// writes to the `background_jobs` table that the worker polls.
// `registerJobHandler`, `processNextJob`, and `runQueueProcessor` are
// removed from this module — workers should use `runBackgroundWorker` and
// `registerJobHandler` from `@/lib/performance/background-jobs` directly.
// See `src/worker.ts` for the canonical worker entry point.
export { enqueueJob, enqueueJobs, getQueueStatus, cleanupOldJobs, retryDeadJobsManual } from './queue';
export type { JobType, JobStatus, PaymentJob, QueueJobOptions } from './queue';

// Reconciliation
export { runReconciliation, quickReconciliationCheck } from './reconciliation-service';
export type { ReconciliationReport, ReconciliationDiscrepancy } from './reconciliation-service';
