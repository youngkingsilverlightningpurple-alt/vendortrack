import { NextResponse } from 'next/server';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { requireAuth, isAuthError } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { getCircuitBreakerStatus } from '@/lib/payment/retry';
import { getErrorMessage } from '@/types';

/**
 * API Route: Payment Health Dashboard
 *
 * Returns real-time metrics for the payment system.
 *
 * OPTIMIZATION:
 *   - Before: 9+ separate Supabase queries (serial)
 *   - After: 1 RPC call (get_payment_health) + 1 circuit breaker check
 *   - Performance: ~90% reduction in database round-trips
 *
 * Admin-only access.
 */

export async function GET() {
  const auth = await requireAuth({
    permission: PERMISSIONS.ANALYTICS_READ,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
  }

  const admin = getSupabaseAdminSafe();

  if (!admin) {
    return NextResponse.json(
      { error: 'Database service unavailable', status: 'degraded' },
      { status: 503 }
    );
  }

  try {
    // Single RPC call replaces 9+ separate queries
    const { data: healthData, error: rpcError } = await admin.rpc('get_payment_health') as unknown as {
      data: Record<string, unknown> | null;
      error: { message?: string } | null;
    };

    if (rpcError) {
      throw rpcError;
    }

    // Circuit breaker status is in-memory (no DB query needed)
    const circuitBreakers = getCircuitBreakerStatus();

    return NextResponse.json({
      timestamp: healthData?.computed_at || new Date().toISOString(),
      healthy: healthData?.healthy ?? true,
      metrics: {
        successfulPayments: healthData?.successful_payments_24h || 0,
        failedSessions: healthData?.failed_sessions_24h || 0,
        refundRate: healthData?.refund_rate_7d || 0,
        pendingRefunds: healthData?.pending_refunds || 0,
        criticalEvents: healthData?.critical_events_24h || 0,
        gmv24h: healthData?.gmv_24h_cents || 0,
        commission24h: healthData?.commission_24h_cents || 0,
        ledgerEntries24h: healthData?.ledger_entries_24h || 0,
        totalOrders7d: healthData?.total_orders_7d || 0,
        refundedOrders7d: healthData?.refunded_orders_7d || 0,
      },
      queue: {
        pending: healthData?.queue_pending || 0,
        processing: healthData?.queue_processing || 0,
        dead: healthData?.queue_dead || 0,
      },
      circuitBreakers,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to fetch payment health metrics', details: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
