/**
 * @fileoverview Worker Entry Point
 *
 * This is the executable entry point for the background worker process.
 * It imports and starts the background job processor.
 *
 * Usage: npx tsx src/worker.ts
 * Docker: CMD ["npx", "tsx", "src/worker.ts"]
 */

import { runBackgroundWorker, registerJobHandler } from '@/lib/performance/background-jobs';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ============================================================
// REGISTER JOB HANDLERS
// ============================================================

// Reconciliation handler
registerJobHandler('reconciliation', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing reconciliation job`);
  // Reconciliation is handled by the cron endpoint
});

// Cache warming handler
registerJobHandler('cache_warming', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing cache warming job`);
  // Cache warming logic
});

// Notification handler
registerJobHandler('notification', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing notification job`);
});

// Email handler
registerJobHandler('email', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing email job`);
});

// Analytics handler
registerJobHandler('analytics', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing analytics job`);
});

// Search indexing handler
registerJobHandler('search_indexing', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing search indexing job`);
});

// Audit handler
registerJobHandler('audit', async (payload, traceId) => {
  console.log(`[${traceId}] Processing audit job`, payload);
});

// Seller payout handler
registerJobHandler('seller_payout', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing seller payout job`);
});

// Ledger reconciliation handler
registerJobHandler('ledger_reconciliation', async (_payload, traceId) => {
  console.log(`[${traceId}] Processing ledger reconciliation job`);
});

// ============================================================
// START WORKER
// ============================================================

console.log('[Worker] Starting VendorTrack background worker...');

runBackgroundWorker({
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS) || 2000,
  maxConcurrentJobs: Number(process.env.WORKER_MAX_CONCURRENT) || 5,
  maxDurationMs: Number(process.env.WORKER_MAX_DURATION_MS) || 3600000, // 1 hour default
  maxJobs: Number(process.env.WORKER_MAX_JOBS) || 10000,
})
  .then((result) => {
    console.log(`[Worker] Completed: ${result.jobsProcessed} jobs processed in ${result.durationMs}ms, ${result.errors} errors`);
    process.exit(result.errors > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('[Worker] Fatal error:', error);
    process.exit(1);
  });
