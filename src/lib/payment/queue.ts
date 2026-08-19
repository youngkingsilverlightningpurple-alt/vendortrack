/**
 * @fileOverview Payment Job Queue — Background Processing
 *
 * P0 FIX (war room): UNIFIED QUEUE.
 *
 * Previously this module wrote to a `payment_job_queue` table, while the
 * background worker (`src/worker.ts` → `runBackgroundWorker` from
 * `@/lib/performance/background-jobs`) polled a DIFFERENT table called
 * `background_jobs`. The two tables never communicated — every job enqueued
 * by the Stripe webhook sat in `payment_job_queue` forever and was never
 * processed. Notifications, analytics, reconciliation, search indexing —
 * all silently dead-lettered.
 *
 * Fix: `enqueueJob` and `enqueueJobs` now delegate to `enqueueBackgroundJob`
 * from `@/lib/performance/background-jobs`, which writes to `background_jobs`
 * (the table the worker actually polls). The legacy `payment_job_queue`
 * table is no longer written to.
 *
 * The original public API of this module (`enqueueJob`, `enqueueJobs`,
 * `QueueJobOptions`, `JobType`) is preserved so existing callers (webhook,
 * refund-service) continue to work without changes.
 *
 * Migration note: any rows already in `payment_job_queue` from before this
 * fix are NOT automatically migrated. Operators should manually inspect
 * and re-enqueue if needed:
 *   SELECT job_type, payload, trace_id, created_at
 *   FROM payment_job_queue
 *   WHERE status = 'pending'
 *   ORDER BY created_at;
 *
 * DESIGN:
 *   - Jobs are stored in the `background_jobs` table (shared with the worker)
 *   - Workers poll the queue via `runBackgroundWorker`
 *   - Each job has a max_attempts limit (prevents infinite retries)
 *   - Failed jobs are retried with exponential backoff
 *   - Completed/failed jobs are marked and retained for audit
 *   - Optional `dedupKey` prevents duplicate enqueues
 *
 * SECURITY: Jobs are processed server-side only. The `background_jobs`
 * table has RLS enabled (admin-only for SELECT/UPDATE/DELETE — see
 * `docs/supabase-performance-migration.sql` P0 fix).
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { PaymentLogger, PaymentError, PaymentErrorCode } from './errors';
import { getErrorMessage, type PaymentPayload } from '@/types';
import {
  enqueueBackgroundJob,
  getBackgroundJobQueueStatus,
  cleanupOldBackgroundJobs,
  retryDeadJobs,
} from '@/lib/performance/background-jobs';

// ============================================================
// TYPES
// ============================================================

/**
 * Job types supported by the payment queue.
 *
 * NOTE: This is a subset of the broader `JobType` union in
 * `@/lib/performance/background-jobs`. Payment-adjacent jobs only.
 * If you need image_processing, ai_task, search_indexing, etc., import
 * `enqueueBackgroundJob` directly.
 */
export type JobType =
  | 'notification'
  | 'analytics'
  | 'audit'
  | 'reconciliation'
  | 'seller_payout'
  | 'ledger_reconciliation';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead' | 'scheduled';

export interface PaymentJob {
  id: string;
  job_type: JobType;
  payload: PaymentPayload;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string;
  trace_id: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export interface QueueJobOptions {
  jobType: JobType;
  payload: PaymentPayload;
  traceId: string;
  maxAttempts?: number;
  delayMs?: number;
  /**
   * Optional deduplication key. If a job with the same dedupKey is already
   * pending or processing, the new enqueue is a no-op (returns the existing
   * job ID). Recommended for idempotent operations like "send order
   * confirmation for order X" — prevents duplicate emails if the webhook
   * fires twice.
   */
  dedupKey?: string;
}

// ============================================================
// JOB ENQUEUE  (delegates to background_jobs table)
// ============================================================

/**
 * Enqueue a job for background processing.
 *
 * P0 FIX (war room): delegates to `enqueueBackgroundJob` so jobs land in
 * the `background_jobs` table that the worker actually polls. Returns the
 * job ID, or empty string on failure (preserved from original API).
 */
export async function enqueueJob(options: QueueJobOptions): Promise<string> {
  try {
    const jobId = await enqueueBackgroundJob({
      jobType: options.jobType,
      payload: options.payload as Record<string, unknown>,
      traceId: options.traceId,
      maxAttempts: options.maxAttempts,
      delayMs: options.delayMs,
      dedupKey: options.dedupKey,
    });

    PaymentLogger.info(options.traceId, 'job_enqueued', `Job enqueued: ${options.jobType}`, {
      jobId,
      jobType: options.jobType,
    });

    return jobId;
  } catch (error) {
    PaymentLogger.error(options.traceId, 'job_enqueue_failed', new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
      message: `Failed to enqueue job: ${getErrorMessage(error)}`,
      traceId: options.traceId,
      context: { jobType: options.jobType },
    }));
    // Don't throw — job queue failure should not block the main operation
    // (e.g. webhook processing). The caller can detect the empty string and
    // choose to log/surface the failure, but the primary payment flow continues.
    return '';
  }
}

/**
 * Enqueue multiple jobs at once.
 */
export async function enqueueJobs(jobs: QueueJobOptions[]): Promise<string[]> {
  const ids: string[] = [];
  for (const job of jobs) {
    const id = await enqueueJob(job);
    ids.push(id);
  }
  return ids;
}

// ============================================================
// JOB QUEUE STATUS  (delegates to background_jobs)
// ============================================================

/**
 * Get the current status of the job queue.
 * Used for monitoring and health checks.
 *
 * P0 FIX (war room): now reads from `background_jobs` (the table the worker
 * actually polls) instead of the orphaned `payment_job_queue` table.
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  oldestPending?: string;
}> {
  try {
    const status = await getBackgroundJobQueueStatus();
    // background-jobs returns `oldestPending: string | null`; we expose
    // `oldestPending?: string` for API compatibility. Convert null → undefined.
    return {
      pending: status.pending,
      processing: status.processing,
      completed: status.completed,
      failed: status.failed,
      dead: status.dead,
      oldestPending: status.oldestPending ?? undefined,
    };
  } catch {
    // If the queue status check fails (DB error, etc.), return zeros rather
    // than throwing — this is used in health checks and should not break
    // the health endpoint.
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };
  }
}

/**
 * Clean up old completed/failed jobs (older than 30 days).
 * Should be called periodically to prevent unbounded growth.
 *
 * P0 FIX (war room): delegates to `cleanupOldBackgroundJobs`.
 */
export async function cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
  return cleanupOldBackgroundJobs(olderThanDays);
}

/**
 * Retry dead jobs (manual recovery).
 *
 * P0 FIX (war room): delegates to `retryDeadJobs` from background-jobs.
 * Operators can use this to retry jobs that exhausted their max_attempts
 * after a transient issue has been resolved.
 */
export async function retryDeadJobsManual(jobType?: JobType, limit: number = 10): Promise<number> {
  return retryDeadJobs(jobType, limit);
}
