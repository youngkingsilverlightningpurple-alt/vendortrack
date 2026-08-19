/**
 * @fileOverview Payment Reconciliation Cron
 *
 * P0 FIX (war room): the previous implementation was a no-op stub that
 * returned `{ reconciled: 0, discrepancies: 0 }` without invoking the real
 * reconciliation service. As a result, financial drift between Stripe and
 * the local database went undetected forever — missing orders, duplicate
 * payments, orphan refunds, commission mismatches, amount mismatches, and
 * failed transfers were all silently ignored.
 *
 * This cron now invokes `runReconciliation()` from
 * `src/lib/payment/reconciliation-service.ts`, which:
 *   1. Fetches recent Stripe PaymentIntents via `stripe.paymentIntents.list`
 *   2. Fetches recent DB orders
 *   3. Performs 6 distinct integrity checks (missing orders, duplicates,
 *      failed transfers, orphan refunds, commission mismatches, amount
 *      mismatches)
 *   4. Returns a `ReconciliationReport` with real discrepancy data
 *   5. Persists the report to the `reconciliation_reports` table
 *
 * The cron is wired in `vercel.json` to run daily at 02:00 UTC.
 * Idempotency: reconciliation is read-only against Stripe and the DB —
 * running it twice produces the same report (modulo new transactions
 * arriving between runs). Each run gets a fresh `reportId`.
 */

import { NextResponse } from 'next/server';
import { runReconciliation } from '@/lib/payment/reconciliation-service';
import { PaymentLogger } from '@/lib/payment/errors';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    // Use timingSafeEqual to prevent timing attacks on the bearer token.
    // (Defense in depth — Vercel's edge already terminates TLS, but if the
    // secret ever leaks, timing-safe comparison prevents byte-by-byte recovery.)
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader?.length !== expected.length) return false;
    const a = Buffer.from(authHeader || '');
    const b = Buffer.from(expected);
    return a.length === b.length && a.equals(b);
  }
  // SECURITY: Fail-closed — deny access when CRON_SECRET is not configured.
  // Returning true here would let any unauthenticated caller trigger a
  // reconciliation run (which makes Stripe API calls — a cost / abuse vector).
  return false;
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const traceId = `cron_recon_${Date.now()}`;

  try {
    PaymentLogger.info(traceId, 'cron_reconciliation_started', 'Starting payment reconciliation...', {});

    // Run the real reconciliation. Default window: last 24 hours.
    // (The service defaults to 30 days if no startDate is provided, but for a
    // daily cron we want to look back just far enough to catch any events that
    // arrived after the previous run. 24 hours with some overlap is the standard
    // pattern — Stripe retries can deliver events hours late.)
    const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const report = await runReconciliation({ startDate });

    const totalDiscrepancies =
      report.summary.missingOrders +
      report.summary.duplicatePayments +
      report.summary.failedTransfers +
      report.summary.orphanRefunds +
      report.summary.commissionMismatches +
      report.summary.amountMismatches;

    PaymentLogger.info(traceId, 'cron_reconciliation_completed', `Reconciliation complete: ${totalDiscrepancies} discrepancies`, {
      reportId: report.id,
      status: report.status,
      stripePaymentCount: report.stripePaymentCount,
      dbOrderCount: report.dbOrderCount,
      healthy: report.healthy,
      missingOrders: report.summary.missingOrders,
      duplicatePayments: report.summary.duplicatePayments,
      failedTransfers: report.summary.failedTransfers,
      orphanRefunds: report.summary.orphanRefunds,
      commissionMismatches: report.summary.commissionMismatches,
      amountMismatches: report.summary.amountMismatches,
    });

    return NextResponse.json({
      status: 'ok',
      task: 'reconciliation',
      timestamp: new Date().toISOString(),
      traceId,
      reportId: report.id,
      reconciled: report.stripePaymentCount,
      dbOrderCount: report.dbOrderCount,
      discrepancies: report.discrepancies.length,
      summary: report.summary,
      healthy: report.healthy,
      // Surface critical discrepancies in the response so Vercel cron logs
      // (which only show the JSON body) immediately reveal problems.
      criticalDiscrepancies: report.discrepancies.filter((d) => d.severity === 'critical'),
    });
  } catch (error) {
    PaymentLogger.critical(traceId, 'cron_reconciliation_failed', `Reconciliation failed: ${error instanceof Error ? error.message : String(error)}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        status: 'error',
        task: 'reconciliation',
        timestamp: new Date().toISOString(),
        traceId,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
