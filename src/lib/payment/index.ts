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
export { enqueueJob, enqueueJobs, registerJobHandler, processNextJob, runQueueProcessor, getQueueStatus, cleanupOldJobs } from './queue';
export type { JobType, JobStatus, PaymentJob, QueueJobOptions } from './queue';

// Reconciliation
export { runReconciliation, quickReconciliationCheck } from './reconciliation-service';
export type { ReconciliationReport, ReconciliationDiscrepancy } from './reconciliation-service';
