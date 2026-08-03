/**
 * @fileoverview Performance Monitoring API Route
 *
 * Provides real-time performance metrics for the admin dashboard.
 * Includes:
 *   - Performance snapshot
 *   - Slow queries
 *   - Recent errors
 *   - Cache stats
 *   - Prometheus export
 *
 * SECURITY: Admin-only access.
 */

import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor } from '@/lib/performance/monitor';
import { cacheService } from '@/lib/cache/redis-client';
import { requireAuth, isAuthError } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';

export async function GET(request: NextRequest) {
  // Admin-only access
  const auth = await requireAuth({ permission: PERMISSIONS.ADMIN_READ });
  if (isAuthError(auth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') || 'json';

  // Prometheus format
  if (format === 'prometheus') {
    const prometheus = performanceMonitor.exportPrometheus();
    return new NextResponse(prometheus, {
      headers: {
        'Content-Type': 'text/plain; version=0.0.4',
      },
    });
  }

  // Full performance snapshot
  const snapshot = performanceMonitor.getSnapshot();
  const cacheStats = cacheService.getStats();
  const slowQueries = performanceMonitor.getSlowQueries(10);
  const recentErrors = performanceMonitor.getRecentErrors(10);

  return NextResponse.json({
    snapshot,
    cache: cacheStats,
    slowQueries,
    recentErrors,
    performanceTargets: {
      api: {
        p95LatencyMs: { target: 250, current: snapshot.api.p95LatencyMs },
        p99LatencyMs: { target: 500, current: snapshot.api.p99LatencyMs },
        errorRate: { target: 0.01, current: snapshot.api.errorRate },
      },
      database: {
        p95LatencyMs: { target: 50, current: snapshot.database.p95LatencyMs },
        slowQueryCount: { target: 0, current: snapshot.database.slowQueryCount },
      },
      cache: {
        hitRate: { target: 0.8, current: snapshot.cache.hitRate },
      },
      coreWebVitals: {
        ttfb: { target: 200, unit: 'ms' },
        lcp: { target: 2500, unit: 'ms' },
        cls: { target: 0.1, unit: 'score' },
        inp: { target: 200, unit: 'ms' },
      },
    },
  });
}
