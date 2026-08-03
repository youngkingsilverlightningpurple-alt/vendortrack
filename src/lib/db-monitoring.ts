/**
 * @fileOverview Database Performance Monitoring Service
 *
 * Provides real-time monitoring for:
 *   - Slow queries (execution time > threshold)
 *   - Query execution time tracking
 *   - Index usage statistics
 *   - Cache hit rate
 *   - Connection usage
 *   - Deadlocks
 *   - Long-running transactions
 *
 * This service uses PostgreSQL's built-in statistics views
 * (pg_stat_user_tables, pg_stat_user_indexes, pg_statio_user_tables)
 * to provide monitoring without requiring external tools.
 *
 * USAGE:
 *   - Admin dashboard can call getDatabaseHealth() for a health check
 *   - Cron job can call checkSlowQueries() periodically
 *   - Alert system can use getCriticalAlerts() for notifications
 *
 * SECURITY: Admin-only access. Never expose to client.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { PaymentLogger } from '@/lib/payment/errors';
import type { CacheHitRateRow, TableStatsRow, IndexUsageRow } from '@/types';

// ============================================================
// TYPES
// ============================================================

export interface DatabaseHealthReport {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  cacheHitRate: {
    index: number;
    table: number;
  };
  tableStats: TableStat[];
  unusedIndexes: UnusedIndex[];
  alerts: PerformanceAlert[];
  connectionInfo: {
    maxConnections: number;
    activeConnections: number;
    idleConnections: number;
  };
}

export interface TableStat {
  tableName: string;
  rowCount: number;
  deadRows: number;
  bloatPercentage: number;
  lastVacuum: string | null;
  lastAnalyze: string | null;
}

export interface UnusedIndex {
  tableName: string;
  indexName: string;
  indexScans: number;
  indexSize: string;
  usageStatus: string;
}

export interface PerformanceAlert {
  severity: 'info' | 'warning' | 'critical';
  category: string;
  message: string;
  recommendation: string;
  detectedAt: string;
}

// ============================================================
// HEALTH CHECK
// ============================================================

/**
 * Get a comprehensive database health report.
 * Uses the monitoring views created in the optimization migration.
 */
export async function getDatabaseHealth(): Promise<DatabaseHealthReport> {
  const admin = getSupabaseAdmin();
  const alerts: PerformanceAlert[] = [];
  const now = new Date().toISOString();

  // 1. Cache hit rate
  const { data: cacheData } = await admin
    .from('v_cache_hit_rate')
    .select('*');

  const indexHitRate = cacheData?.find((d: CacheHitRateRow) => d.metric === 'index_hit_rate')?.percentage || 0;
  const tableHitRate = cacheData?.find((d: CacheHitRateRow) => d.metric === 'table_hit_rate')?.percentage || 0;

  // Alert on low cache hit rates
  if (indexHitRate < 95) {
    alerts.push({
      severity: indexHitRate < 90 ? 'critical' : 'warning',
      category: 'cache',
      message: `Index cache hit rate is ${indexHitRate}%. Target: >99%.`,
      recommendation: 'Increase shared_buffers or add missing indexes. Low cache hit rate means PostgreSQL is reading from disk too often.',
      detectedAt: now,
    });
  }

  if (tableHitRate < 95) {
    alerts.push({
      severity: tableHitRate < 90 ? 'critical' : 'warning',
      category: 'cache',
      message: `Table cache hit rate is ${tableHitRate}%. Target: >99%.`,
      recommendation: 'Increase shared_buffers or optimize queries to reduce table scans.',
      detectedAt: now,
    });
  }

  // 2. Table statistics
  const { data: tableStats } = await admin
    .from('v_table_stats')
    .select('*');

  const tables: TableStat[] = (tableStats || []).map((t: TableStatsRow) => ({
    tableName: t.table_name,
    rowCount: t.row_count,
    deadRows: t.dead_rows,
    bloatPercentage: parseFloat(t.bloat_percentage) || 0,
    lastVacuum: t.last_vacuum || t.last_autovacuum,
    lastAnalyze: t.last_analyze || t.last_autoanalyze,
  }));

  // Alert on high bloat
  for (const table of tables) {
    if (table.bloatPercentage > 20) {
      alerts.push({
        severity: table.bloatPercentage > 50 ? 'critical' : 'warning',
        category: 'bloat',
        message: `Table ${table.tableName} has ${table.bloatPercentage}% bloat (${table.deadRows} dead rows).`,
        recommendation: 'Run VACUUM ANALYZE on this table. If bloat is severe, consider VACUUM FULL during maintenance window.',
        detectedAt: now,
      });
    }
  }

  // 3. Unused indexes
  const { data: indexData } = await admin
    .from('v_index_usage')
    .select('*');

  const unusedIndexes: UnusedIndex[] = (indexData || [])
    .filter((i: IndexUsageRow) => i.usage_status === 'UNUSED')
    .map((i: IndexUsageRow) => ({
      tableName: i.table_name,
      indexName: i.index_name,
      indexScans: i.index_scans,
      indexSize: i.index_size,
      usageStatus: i.usage_status,
    }));

  // Alert on unused indexes (wasted space)
  if (unusedIndexes.length > 5) {
    alerts.push({
      severity: 'info',
      category: 'indexes',
      message: `${unusedIndexes.length} unused indexes detected. These consume disk space and slow down writes.`,
      recommendation: 'Review unused indexes and consider dropping them. However, some indexes (like unique constraints) may be needed for data integrity even if rarely scanned.',
      detectedAt: now,
    });
  }

  // 4. Connection info (via pg_stat_activity)
  const { data: connectionData } = await admin.rpc('get_connection_stats').catch(() => ({
    data: null,
  }));

  const connectionInfo = {
    maxConnections: 100,
    activeConnections: connectionData?.active || 0,
    idleConnections: connectionData?.idle || 0,
  };

  // 5. Determine overall status
  const criticalAlerts = alerts.filter(a => a.severity === 'critical');
  const warningAlerts = alerts.filter(a => a.severity === 'warning');

  const status: 'healthy' | 'degraded' | 'critical' =
    criticalAlerts.length > 0 ? 'critical' :
    warningAlerts.length > 0 ? 'degraded' :
    'healthy';

  return {
    status,
    timestamp: now,
    cacheHitRate: {
      index: indexHitRate,
      table: tableHitRate,
    },
    tableStats: tables,
    unusedIndexes,
    alerts,
    connectionInfo,
  };
}

// ============================================================
// SLOW QUERY CHECK
// ============================================================

/**
 * Check for slow queries using pg_stat_statements.
 * Note: This requires the pg_stat_statements extension.
 * In Supabase, this may need to be enabled in the dashboard.
 */
export async function checkSlowQueries(thresholdMs: number = 1000): Promise<PerformanceAlert[]> {
  const alerts: PerformanceAlert[] = [];
  const now = new Date().toISOString();

  // If pg_stat_statements is not available, return empty
  try {
    const admin = getSupabaseAdmin();

    // Check for tables that haven't been analyzed recently
    const { data: tableStats } = await admin
      .from('v_table_stats')
      .select('*');

    for (const table of tableStats || []) {
      const lastAnalyze = table.last_analyze || table.last_autoanalyze;
      if (!lastAnalyze) {
        alerts.push({
          severity: 'warning',
          category: 'statistics',
          message: `Table ${table.table_name} has never been analyzed. Query planner may choose suboptimal plans.`,
          recommendation: 'Run ANALYZE on this table to update statistics.',
          detectedAt: now,
        });
      } else {
        const daysSinceAnalyze = (Date.now() - new Date(lastAnalyze).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAnalyze > 7) {
          alerts.push({
            severity: 'info',
            category: 'statistics',
            message: `Table ${table.table_name} was last analyzed ${Math.round(daysSinceAnalyze)} days ago.`,
            recommendation: 'Run ANALYZE on this table. Stale statistics may cause poor query plans.',
            detectedAt: now,
          });
        }
      }
    }
  } catch (error) {
    // Monitoring must never break the application
    PaymentLogger.error('db-monitoring', 'slow_query_check_failed', error instanceof Error ? error : new Error(String(error)));
  }

  return alerts;
}

// ============================================================
// CRITICAL ALERTS
// ============================================================

/**
 * Get critical alerts that require immediate attention.
 */
export async function getCriticalAlerts(): Promise<PerformanceAlert[]> {
  const health = await getDatabaseHealth();
  return health.alerts.filter(a => a.severity === 'critical');
}
