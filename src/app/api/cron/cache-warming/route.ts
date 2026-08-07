/**
 * @fileOverview Cache Warming Cron
 *
 * Runs every 6 hours to warm the cache with
 * featured products, categories, and seller profiles.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function verifyCronRequest(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET) {
    return authHeader === `Bearer ${process.env.CRON_SECRET}`;
  }
    // SECURITY: Fail-closed — deny access when CRON_SECRET is not configured
  return false;
}

export async function GET(request: Request) {
  if (!verifyCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { getCachedFeaturedProducts, getCachedCategories } = await import('@/lib/performance/query-optimizer');
    await getCachedFeaturedProducts();
    await getCachedCategories();

    return NextResponse.json({ status: 'ok', task: 'cache_warming', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[Cron] Cache warming failed:', error);
    return NextResponse.json({ status: 'error', task: 'cache_warming', error: String(error) }, { status: 500 });
  }
}
