/**
 * @fileOverview Performance Monitoring Service
 *
 * Instruments every critical path in VendorTrack:
 *   - API response time (p50, p95, p99)
 *   - Database query latency
 *   - Cache hit ratio
 *   - Slow query detection
 *   - Memory usage
 *   - Queue depth
 *   - Error rate
 *
 * DESIGN:
 *   - Low overhead (< 1% CPU impact)
 *   - Circular buffer for metrics (no unbounded growth)
 *   - Percentile calculations on demand
 *   - Exportable to Prometheus/OpenTelemetry format
 *   - Admin dashboard integration
 *
 * SECURITY: All monitoring endpoints require admin access.
 */

// ============================================================
// TYPES
// ============================================================

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'count' | 'percent' | 'rate';
  timestamp: number;
  tags?: Record<string, string>;
}

export interface LatencyHistogram {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface PerformanceSnapshot {
  timestamp: string;
  uptime: number;
  api: {
    requestCount: number;
    errorRate: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  database: {
    queryCount: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    slowQueryCount: number;
    activeConnections: number;
  };
  cache: {
    hitRate: number;
    keyCount: number;
    memoryUsageBytes: number;
  };
  queue: {
    pendingJobs: number;
    processingJobs: number;
    deadLetterCount: number;
  };
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    externalMb: number;
  };
}

// ============================================================
// CIRCULAR BUFFER
// ============================================================

class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private length = 0;
  private readonly capacity: number;

  constructor(capacity: number = 1000) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.length < this.capacity) {
      this.length++;
    }
  }

  toArray(): T[] {
    if (this.length < this.capacity) {
      return this.buffer.slice(0, this.length);
    }
    // Ring buffer is full — return in order
    const result = new Array<T>(this.length);
    for (let i = 0; i < this.length; i++) {
      result[i] = this.buffer[(this.head + i) % this.capacity]!;
    }
    return result;
  }

  get size(): number {
    return this.length;
  }

  clear(): void {
    this.head = 0;
    this.length = 0;
  }
}

// ============================================================
// PERFORMANCE MONITOR
// ============================================================

class PerformanceMonitor {
  private apiLatencies = new CircularBuffer<number>(5000);
  private dbLatencies = new CircularBuffer<number>(5000);
  private apiErrors = new CircularBuffer<{ timestamp: number; path: string; status: number }>(500);
  private slowQueries = new CircularBuffer<{ query: string; durationMs: number; timestamp: number }>(100);
  private requestCount = 0;
  private errorCount = 0;
  private dbQueryCount = 0;
  private slowQueryThresholdMs = 1000;
  private startTime = Date.now();

  // Metric counters by name
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();

  /**
   * Record an API request latency.
   */
  recordApiLatency(durationMs: number, path?: string, statusCode?: number): void {
    this.apiLatencies.push(durationMs);
    this.requestCount++;

    if (statusCode && statusCode >= 400) {
      this.errorCount++;
      this.apiErrors.push({
        timestamp: Date.now(),
        path: path || 'unknown',
        status: statusCode,
      });
    }
  }

  /**
   * Record a database query latency.
   */
  recordDbLatency(durationMs: number, query?: string): void {
    this.dbLatencies.push(durationMs);
    this.dbQueryCount++;

    if (durationMs > this.slowQueryThresholdMs && query) {
      this.slowQueries.push({
        query: query.substring(0, 200),
        durationMs,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Increment a counter.
   */
  incrementCounter(name: string, value: number = 1): void {
    this.counters.set(name, (this.counters.get(name) || 0) + value);
  }

  /**
   * Set a gauge value.
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Calculate percentiles from a circular buffer.
   */
  private calculatePercentiles(values: number[]): LatencyHistogram {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, avg: 0, count: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    return {
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      min: sorted[0] ?? 0,
      max: sorted[sorted.length - 1] ?? 0,
      avg: sum / sorted.length,
      count: sorted.length,
    };
  }

  /**
   * Get a performance snapshot.
   */
  getSnapshot(): PerformanceSnapshot {
    const apiLatenciesArr = this.apiLatencies.toArray();
    const dbLatenciesArr = this.dbLatencies.toArray();
    const apiHistogram = this.calculatePercentiles(apiLatenciesArr);
    const dbHistogram = this.calculatePercentiles(dbLatenciesArr);

    const memUsage = process.memoryUsage();

    return {
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      api: {
        requestCount: this.requestCount,
        errorRate: this.requestCount > 0 ? this.errorCount / this.requestCount : 0,
        avgLatencyMs: apiHistogram.avg,
        p95LatencyMs: apiHistogram.p95,
        p99LatencyMs: apiHistogram.p99,
      },
      database: {
        queryCount: this.dbQueryCount,
        avgLatencyMs: dbHistogram.avg,
        p95LatencyMs: dbHistogram.p95,
        slowQueryCount: this.slowQueries.size,
        activeConnections: this.gauges.get('db.active_connections') || 0,
      },
      cache: {
        hitRate: this.gauges.get('cache.hit_rate') || 0,
        keyCount: this.gauges.get('cache.key_count') || 0,
        memoryUsageBytes: this.gauges.get('cache.memory_bytes') || 0,
      },
      queue: {
        pendingJobs: this.gauges.get('queue.pending') || 0,
        processingJobs: this.gauges.get('queue.processing') || 0,
        deadLetterCount: this.gauges.get('queue.dead') || 0,
      },
      memory: {
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024 * 100) / 100,
        rssMb: Math.round(memUsage.rss / 1024 / 1024 * 100) / 100,
        externalMb: Math.round(memUsage.external / 1024 / 1024 * 100) / 100,
      },
    };
  }

  /**
   * Get API latency histogram.
   */
  getApiLatencyHistogram(): LatencyHistogram {
    return this.calculatePercentiles(this.apiLatencies.toArray());
  }

  /**
   * Get database latency histogram.
   */
  getDbLatencyHistogram(): LatencyHistogram {
    return this.calculatePercentiles(this.dbLatencies.toArray());
  }

  /**
   * Get recent slow queries.
   */
  getSlowQueries(limit: number = 20): Array<{ query: string; durationMs: number; timestamp: number }> {
    return this.slowQueries.toArray().slice(-limit);
  }

  /**
   * Get recent API errors.
   */
  getRecentErrors(limit: number = 20): Array<{ timestamp: number; path: string; status: number }> {
    return this.apiErrors.toArray().slice(-limit);
  }

  /**
   * Export metrics in Prometheus format.
   */
  exportPrometheus(): string {
    const snapshot = this.getSnapshot();
    const lines: string[] = [];

    const addMetric = (name: string, value: number, help: string, type: string = 'gauge', labels?: string) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);
      const labelStr = labels ? `{${labels}}` : '';
      lines.push(`${name}${labelStr} ${value}`);
    };

    addMetric('vt_api_request_count', snapshot.api.requestCount, 'Total API requests', 'counter');
    addMetric('vt_api_error_rate', snapshot.api.errorRate, 'API error rate');
    addMetric('vt_api_latency_avg_ms', snapshot.api.avgLatencyMs, 'Average API latency in ms');
    addMetric('vt_api_latency_p95_ms', snapshot.api.p95LatencyMs, 'P95 API latency in ms');
    addMetric('vt_api_latency_p99_ms', snapshot.api.p99LatencyMs, 'P99 API latency in ms');

    addMetric('vt_db_query_count', snapshot.database.queryCount, 'Total DB queries', 'counter');
    addMetric('vt_db_latency_avg_ms', snapshot.database.avgLatencyMs, 'Average DB latency in ms');
    addMetric('vt_db_latency_p95_ms', snapshot.database.p95LatencyMs, 'P95 DB latency in ms');
    addMetric('vt_db_slow_query_count', snapshot.database.slowQueryCount, 'Slow DB queries', 'counter');

    addMetric('vt_cache_hit_rate', snapshot.cache.hitRate, 'Cache hit rate');
    addMetric('vt_cache_key_count', snapshot.cache.keyCount, 'Cached key count');

    addMetric('vt_queue_pending', snapshot.queue.pendingJobs, 'Pending queue jobs');
    addMetric('vt_queue_dead', snapshot.queue.deadLetterCount, 'Dead letter queue count');

    addMetric('vt_memory_heap_used_mb', snapshot.memory.heapUsedMb, 'Heap used in MB');
    addMetric('vt_memory_rss_mb', snapshot.memory.rssMb, 'RSS memory in MB');

    return lines.join('\n');
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.apiLatencies.clear();
    this.dbLatencies.clear();
    this.apiErrors.clear();
    this.slowQueries.clear();
    this.requestCount = 0;
    this.errorCount = 0;
    this.dbQueryCount = 0;
    this.counters.clear();
    this.gauges.clear();
    this.startTime = Date.now();
  }
}

// ============================================================
// SINGLETON
// ============================================================

export const performanceMonitor = new PerformanceMonitor();

// ============================================================
// TIMING HELPERS
// ============================================================

/**
 * Measure the execution time of an async function.
 * Automatically records the result in the performance monitor.
 */
export async function measureApiLatency<T>(
  fn: () => Promise<T>,
  path?: string
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    performanceMonitor.recordApiLatency(duration, path);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    performanceMonitor.recordApiLatency(duration, path, 500);
    throw error;
  }
}

/**
 * Measure the execution time of a database query.
 * Automatically records the result in the performance monitor.
 */
export async function measureDbLatency<T>(
  fn: () => Promise<T>,
  query?: string
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    performanceMonitor.recordDbLatency(duration, query);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    performanceMonitor.recordDbLatency(duration, query);
    throw error;
  }
}

/**
 * Create a timer that returns elapsed milliseconds when called.
 */
export function startTimer(): () => number {
  const start = performance.now();
  return () => performance.now() - start;
}
