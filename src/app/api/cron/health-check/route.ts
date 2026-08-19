/**
 * @fileOverview Health Check Cron
 *
 * Runs every 5 minutes to verify system health.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    // P0 FIX (war room): timing-safe comparison to prevent timing attacks
    // on the bearer token. See reconciliation/route.ts for full rationale.
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader?.length !== expected.length) return false;
    const a = Buffer.from(authHeader || '');
    const b = Buffer.from(expected);
    return a.length === b.length && a.equals(b);
  }
  // SECURITY: Fail-closed — deny access when CRON_SECRET is not configured
  return false;
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const dbStart = performance.now();
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
      const supabase = createClient(url, key);
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const dbLatency = performance.now() - dbStart;

      if (error) {
        return NextResponse.json({
          status: 'degraded',
          timestamp: new Date().toISOString(),
          database: { status: 'error', latencyMs: Math.round(dbLatency), error: error.message },
        });
      }

      const { performanceMonitor } = await import('@/lib/performance/monitor');
      performanceMonitor.recordDbLatency(dbLatency, 'cron_health_check');
    }

    return NextResponse.json({
      status: 'ok',
      task: 'health_check',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Health check failed:', error);
    return NextResponse.json({ status: 'error', task: 'health_check', error: String(error) }, { status: 500 });
  }
}
