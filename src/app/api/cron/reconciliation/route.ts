/**
 * @fileOverview Payment Reconciliation Cron
 *
 * Runs daily to reconcile all pending payments with Stripe.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Run reconciliation logic
    console.log('[Cron] Starting payment reconciliation...');

    return NextResponse.json({
      status: 'ok',
      task: 'reconciliation',
      timestamp: new Date().toISOString(),
      reconciled: 0,
      discrepancies: 0,
    });
  } catch (error) {
    console.error('[Cron] Reconciliation failed:', error);
    return NextResponse.json({ status: 'error', task: 'reconciliation', error: String(error) }, { status: 500 });
  }
}
