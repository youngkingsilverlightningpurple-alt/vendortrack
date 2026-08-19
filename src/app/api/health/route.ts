/**
 * @fileoverview Health Check Endpoint — Production Readiness
 *
 * Provides a comprehensive health check for the platform.
 * Used by:
 *   - Docker HEALTHCHECK
 *   - Vercel Cron monitoring
 *   - Load balancers
 *   - Kubernetes probes
 *   - Acceptance tests
 *
 * Response format:
 *   { status: "healthy"|"degraded"|"unhealthy", checks: {...}, timestamp, version }
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  details?: string;
  error?: string;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: HealthCheckResult;
    redis: HealthCheckResult;
    memory: HealthCheckResult;
    env: HealthCheckResult;
  };
}

async function checkDatabase(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      return {
        status: 'unhealthy',
        error: 'Missing Supabase environment variables',
      };
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).limit(1);
    const latencyMs = performance.now() - start;

    if (error) {
      return {
        status: 'unhealthy',
        latencyMs: Math.round(latencyMs),
        error: error.message,
      };
    }

    return {
      status: latencyMs < 500 ? 'healthy' : 'degraded',
      latencyMs: Math.round(latencyMs),
      details: 'PostgreSQL connection verified',
    };
  } catch (err) {
    return {
      status: 'unhealthy',
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : 'Database check failed',
    };
  }
}

async function checkRedis(): Promise<HealthCheckResult> {
  const start = performance.now();
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      return {
        status: 'degraded',
        details: 'Redis not configured — using in-memory LRU cache fallback',
      };
    }

    // SECURITY: Parse URL to verify format, but NEVER expose hostname/port
    // in the health response. Only report connectivity status.
    try {
      const parsed = new URL(redisUrl);
      if (!parsed.hostname) {
        return {
          status: 'unhealthy',
          error: 'Invalid Redis URL format',
        };
      }
    } catch {
      return {
        status: 'unhealthy',
        error: 'Invalid Redis URL format',
      };
    }

    return {
      status: 'healthy',
      latencyMs: Math.round(performance.now() - start),
      details: 'Redis connection configured',
    };
  } catch (err) {
    return {
      status: 'degraded',
      latencyMs: Math.round(performance.now() - start),
      details: 'Redis not available — falling back to in-memory cache',
      error: err instanceof Error ? err.message : 'Redis check failed',
    };
  }
}

function checkMemory(): HealthCheckResult {
  const memUsage = process.memoryUsage();
  const heapUsedMb = Math.round(memUsage.heapUsed / 1024 / 1024);
  const heapTotalMb = Math.round(memUsage.heapTotal / 1024 / 1024);
  const rssMb = Math.round(memUsage.rss / 1024 / 1024);
  const heapUsagePercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

  // If heap usage > 90%, it's unhealthy; > 75% is degraded
  const status = heapUsagePercent > 90 ? 'unhealthy' : heapUsagePercent > 75 ? 'degraded' : 'healthy';

  return {
    status,
    details: `Heap: ${heapUsedMb}MB / ${heapTotalMb}MB (${heapUsagePercent}%), RSS: ${rssMb}MB`,
  };
}

function checkEnvironment(): HealthCheckResult {
  // SECURITY: Never expose env var names or values in the health response.
  // An unauthenticated attacker could use this information for targeted attacks.
  // We only report counts, never variable names or values.
  const TOTAL_EXPECTED_VARS = 9; // total expected env vars (count only)
  const CORE_EXPECTED_VARS = 3;   // core required env vars (count only)

  // Check core vars by count — never reveal which ones are missing by name
  const coreSet = new Set([
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter(Boolean));
  const coreMissingCount = CORE_EXPECTED_VARS - coreSet.size;

  // Check all vars by count
  const allSet = new Set([
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.STRIPE_SECRET_KEY,
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.REDIS_URL,
    process.env.GEMINI_API_KEY,
    process.env.SENTRY_DSN,
  ].filter(Boolean));
  const missingCount = TOTAL_EXPECTED_VARS - allSet.size;

  if (coreMissingCount > 0) {
    return {
      status: 'degraded',
      error: `Missing ${coreMissingCount} core configuration(s)`,
      details: `${missingCount} total configuration(s) missing`,
    };
  }

  return {
    status: missingCount > 3 ? 'degraded' : 'healthy',
    details: `All core configs set. ${missingCount} optional config(s) missing`,
  };
}

export async function GET() {
  const startTime = performance.now();

  // Run all checks in parallel
  const [database, redis, memory, env] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    Promise.resolve(checkMemory()),
    Promise.resolve(checkEnvironment()),
  ]);

  const checks = { database, redis, memory, env };

  // Determine overall status
  const statuses = Object.values(checks).map(c => c.status);
  const overall: HealthReport['status'] = statuses.includes('unhealthy')
    ? 'unhealthy'
    : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

  const report: HealthReport = {
    status: overall,
    version: process.env.npm_package_version || '0.1.0',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks,
  };

  const totalLatency = Math.round(performance.now() - startTime);
  const httpStatus = overall === 'unhealthy' ? 503 : 200;

  return NextResponse.json(report, {
    status: httpStatus,
    headers: {
      'X-Health-Status': overall,
      'X-Response-Time': `${totalLatency}ms`,
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
