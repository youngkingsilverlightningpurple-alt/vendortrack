/**
 * @fileOverview Payment Job Queue — Background Processing
 *
 * Implements a database-backed job queue for long-running payment work:
 *   - Email notifications (buyer/seller)
 *   - Analytics updates
 *   - Seller notifications
 *   - Audit processing
 *   - Reconciliation jobs
 *
 * DESIGN:
 *   - Jobs are stored in the `payment_job_queue` table
 *   - Workers poll the queue and process jobs
 *   - Each job has a max_attempts limit (prevents infinite retries)
 *   - Failed jobs are retried with exponential backoff
 *   - Completed/failed jobs are marked and retained for audit
 *
 * WHY DATABASE-BACKED:
 *   - No additional infrastructure (Redis, RabbitMQ) required
 *   - Jobs survive server restarts
 *   - Full audit trail of all job processing
 *   - Works with existing Supabase infrastructure
 *
 * SECURITY: Jobs are processed server-side only.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { PaymentLogger, PaymentError, PaymentErrorCode } from './errors';
import { withRetry, RETRY_CONFIGS, sleep } from './retry';
import { getErrorMessage, type PaymentPayload } from '@/types';

// ============================================================
// TYPES
// ============================================================

export type JobType =
  | 'notification'
  | 'analytics'
  | 'audit'
  | 'reconciliation'
  | 'seller_payout'
  | 'ledger_reconciliation';

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

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
}

// ============================================================
// JOB ENQUEUE
// ============================================================

/**
 * Enqueue a job for background processing.
 * Returns the job ID.
 */
export async function enqueueJob(options: QueueJobOptions): Promise<string> {
  const admin = getSupabaseAdmin();

  const nextAttemptAt = options.delayMs
    ? new Date(Date.now() + options.delayMs).toISOString()
    : new Date().toISOString();

  const { data, error } = await (admin
    .from('payment_job_queue') as any)
    .insert({
      job_type: options.jobType,
      payload: options.payload,
      status: 'pending',
      attempts: 0,
      max_attempts: options.maxAttempts || 3,
      next_attempt_at: nextAttemptAt,
      trace_id: options.traceId,
    } as any)
    .select('id')
    .single();

  if (error) {
    PaymentLogger.error(options.traceId, 'job_enqueue_failed', new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
      message: `Failed to enqueue job: ${error.message}`,
      traceId: options.traceId,
      context: { jobType: options.jobType },
    }));
    // Don't throw — job queue failure should not block the main operation
    return '';
  }

  PaymentLogger.info(options.traceId, 'job_enqueued', `Job enqueued: ${options.jobType}`, {
    jobId: (data as any).id,
    jobType: options.jobType,
  });

  return (data as any).id;
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
// JOB PROCESSING
// ============================================================

/** Map of job type handlers */
const jobHandlers = new Map<JobType, (payload: PaymentPayload, traceId: string) => Promise<void>>();

/**
 * Register a handler for a job type.
 */
export function registerJobHandler(
  jobType: JobType,
  handler: (payload: PaymentPayload, traceId: string) => Promise<void>
): void {
  jobHandlers.set(jobType, handler);
}

/**
 * Process a single job from the queue.
 * Returns true if a job was processed, false if the queue is empty.
 */
export async function processNextJob(): Promise<boolean> {
  const admin = getSupabaseAdmin();

  // Atomically claim the next pending job
  // Use SELECT ... FOR UPDATE SKIP LOCKED pattern (via RPC)
  const { data: job, error: claimError } = await (admin as any).rpc('claim_next_queue_job');

  if (claimError || !job) {
    return false; // No jobs available
  }

  const typedJob = job as PaymentJob;
  const handler = jobHandlers.get(typedJob.job_type);

  if (!handler) {
    // No handler registered — mark as dead
    await (admin
      .from('payment_job_queue') as any)
      .update({
        status: 'dead',
        error_message: `No handler registered for job type: ${typedJob.job_type}`,
      } as any)
      .eq('id', typedJob.id);

    PaymentLogger.warn(typedJob.trace_id, 'job_no_handler', `No handler for job type: ${typedJob.job_type}`, {
      jobId: typedJob.id,
      jobType: typedJob.job_type,
    });
    return true;
  }

  try {
    await handler(typedJob.payload, typedJob.trace_id);

    // Mark as completed
    await (admin
      .from('payment_job_queue') as any)
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      } as any)
      .eq('id', typedJob.id);

    PaymentLogger.info(typedJob.trace_id, 'job_completed', `Job completed: ${typedJob.job_type}`, {
      jobId: typedJob.id,
      jobType: typedJob.job_type,
    });
  } catch (error: unknown) {
    const newAttempts = typedJob.attempts + 1;
    const isMaxReached = newAttempts >= typedJob.max_attempts;
    const errorMessage = getErrorMessage(error);

    // Calculate next retry time with exponential backoff
    const delayMs = Math.min(1000 * Math.pow(2, newAttempts), 30000) + Math.random() * 1000;
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

    await (admin
      .from('payment_job_queue') as any)
      .update({
        status: isMaxReached ? 'dead' : 'pending',
        attempts: newAttempts,
        next_attempt_at: nextAttemptAt,
        error_message: errorMessage.substring(0, 500),
      } as any)
      .eq('id', typedJob.id);

    if (isMaxReached) {
      PaymentLogger.error(typedJob.trace_id, 'job_dead', new PaymentError(PaymentErrorCode.INTERNAL_STATE_ERROR, {
        message: `Job died after ${newAttempts} attempts: ${errorMessage}`,
        traceId: typedJob.trace_id,
      }), {
        jobId: typedJob.id,
        jobType: typedJob.job_type,
        attempts: newAttempts,
      });
    } else {
      PaymentLogger.warn(typedJob.trace_id, 'job_retry', `Job failed, retrying (${newAttempts}/${typedJob.max_attempts})`, {
        jobId: typedJob.id,
        jobType: typedJob.job_type,
        nextAttemptAt,
      });
    }
  }

  return true;
}

/**
 * Run the queue processor for a given duration.
 * This is the main entry point for the background worker.
 */
export async function runQueueProcessor(
  options: {
    pollIntervalMs?: number;
    maxDurationMs?: number;
    maxJobs?: number;
  } = {}
): Promise<{ jobsProcessed: number; durationMs: number }> {
  const pollIntervalMs = options.pollIntervalMs || 1000;
  const maxDurationMs = options.maxDurationMs || 60000;
  const maxJobs = options.maxJobs || 100;

  const startTime = Date.now();
  let jobsProcessed = 0;

  PaymentLogger.info('queue', 'queue_processor_started', 'Queue processor started', {
    pollIntervalMs,
    maxDurationMs,
    maxJobs,
  });

  while (
    Date.now() - startTime < maxDurationMs &&
    jobsProcessed < maxJobs
  ) {
    const hadJob = await processNextJob();

    if (hadJob) {
      jobsProcessed++;
    } else {
      // No jobs available — wait before polling again
      await sleep(pollIntervalMs);
    }
  }

  const durationMs = Date.now() - startTime;

  PaymentLogger.info('queue', 'queue_processor_stopped', 'Queue processor stopped', {
    jobsProcessed,
    durationMs,
  });

  return { jobsProcessed, durationMs };
}

// ============================================================
// JOB QUEUE STATUS
// ============================================================

/**
 * Get the current status of the job queue.
 * Used for monitoring and health checks.
 */
export async function getQueueStatus(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  oldestPending?: string;
}> {
  const admin = getSupabaseAdmin();

  const { data, error } = await (admin
    .from('payment_job_queue') as any)
    .select('status, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    return {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      dead: 0,
    };
  }

  const numericCounts: Record<JobStatus, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    dead: 0,
  };
  let oldestPending: string | undefined;

  for (const row of data || []) {
    const status = (row as Record<string, unknown>).status as JobStatus;
    if (status in numericCounts) {
      numericCounts[status]++;
    }
    if (status === 'pending' && !oldestPending) {
      oldestPending = (row as Record<string, unknown>).created_at as string;
    }
  }

  return { ...numericCounts, oldestPending };
}

/**
 * Clean up old completed/failed jobs (older than 30 days).
 * Should be called periodically to prevent unbounded growth.
 */
export async function cleanupOldJobs(olderThanDays: number = 30): Promise<number> {
  const admin = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await (admin
    .from('payment_job_queue') as any)
    .delete()
    .in('status', ['completed', 'failed', 'dead'])
    .lt('completed_at', cutoff)
    .select('id');

  return data?.length || 0;
}
