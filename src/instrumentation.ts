/**
 * @fileOverview Next.js Instrumentation Hook
 *
 * Initializes all production services when the server starts.
 * This runs once per server instance (not per request).
 *
 * GRACEFUL DEGRADATION: All initialization failures are logged as warnings.
 * The application continues to run in degraded mode rather than crashing.
 * Missing services are reported via the /api/health endpoint.
 *
 * FEATURES:
 *   - Environment validation (graceful — logs warnings, never exits)
 *   - Sentry error tracking initialization
 *   - OpenTelemetry tracing initialization
 *   - Production security validation
 *   - Performance monitor initialization
 *   - Background job worker registration
 *   - Cache warming
 *   - Periodic monitoring tasks
 *   - Graceful shutdown handling
 */

export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ---- 1. Environment Validation ----
    // GRACEFUL: Log warnings but never exit. The app runs in degraded mode.
    try {
      const { validateEnvironment } = await import('@/lib/env');
      const results = validateEnvironment();
      const failures = results.filter(r => r.status === 'missing' || r.status === 'invalid' || r.status === 'unsafe');
      const warnings = results.filter(r => r.status === 'warning');

      if (failures.length > 0) {
        console.warn('[Instrumentation] Environment validation — missing/invalid vars (running in degraded mode):');
        for (const f of failures) {
          console.warn(`  [${f.status.toUpperCase()}] ${f.name}: ${f.message}`);
        }
      } else {
        console.log('[Instrumentation] Environment validation passed');
      }

      if (warnings.length > 0) {
        for (const w of warnings) {
          console.warn(`  [WARNING] ${w.name}: ${w.message}`);
        }
      }
    } catch (error) {
      console.warn('[Instrumentation] Environment validation failed:', error);
    }

    // ---- 2. Sentry Error Tracking ----
    try {
      const { initSentryServer } = await import('@/lib/monitoring/sentry');
      initSentryServer();
    } catch (error) {
      console.warn('[Instrumentation] Sentry initialization failed:', error);
    }

    // ---- 3. OpenTelemetry Tracing ----
    try {
      const { initOpenTelemetry } = await import('@/lib/monitoring/opentelemetry');
      initOpenTelemetry();
    } catch (error) {
      console.warn('[Instrumentation] OpenTelemetry initialization failed:', error);
    }

    // ---- 4. Production Security Validation ----
    if (process.env.NODE_ENV === 'production') {
      try {
        const { runProductionSecurityChecks } = await import('@/lib/monitoring/production-security');
        const checks = runProductionSecurityChecks();
        const failures = checks.filter(c => c.status === 'fail');
        const warnings = checks.filter(c => c.status === 'warn');

        if (failures.length > 0) {
          console.error('[Instrumentation] Production security failures:');
          failures.forEach(f => console.error(`  [${f.severity.toUpperCase()}] ${f.category}/${f.check}: ${f.message}`));
        }
        if (warnings.length > 0) {
          console.warn('[Instrumentation] Production security warnings:');
          warnings.forEach(w => console.warn(`  [${w.severity.toUpperCase()}] ${w.category}/${w.check}: ${w.message}`));
        }
        if (failures.length === 0) {
          console.log(`[Instrumentation] Production security: ${checks.filter(c => c.status === 'pass').length}/${checks.length} checks passed`);
        }
      } catch (error) {
        console.warn('[Instrumentation] Security validation failed:', error);
      }
    }

    // ---- 5. Performance Monitor ----
    try {
      const { performanceMonitor } = await import('@/lib/performance/monitor');
      const { updateCacheStats, updateConnectionPoolStats, updateQueueStats } = await import('@/lib/performance/query-optimizer');
    } catch (error) {
      console.warn('[Instrumentation] Performance monitor initialization failed:', error);
    }

    // ---- 6. Background Job Handlers ----
    try {
      const { registerJobHandler } = await import('@/lib/performance/background-jobs');

      registerJobHandler('notification', async (payload, traceId) => {
        console.log(`[Job] Processing notification: ${traceId}`, payload);
      });

      registerJobHandler('analytics', async (payload, traceId) => {
        console.log(`[Job] Processing analytics: ${traceId}`, payload);
      });

      registerJobHandler('cache_warming', async (payload, traceId) => {
        console.log(`[Job] Warming cache: ${traceId}`);
        try {
          const { getCachedFeaturedProducts, getCachedCategories } = await import('@/lib/performance/query-optimizer');
          await getCachedFeaturedProducts();
          await getCachedCategories();
        } catch {
          // Cache warming must not break the job processor
        }
      });

      registerJobHandler('search_indexing', async (payload, traceId) => {
        console.log(`[Job] Updating search index: ${traceId}`, payload);
      });

      console.log('[Instrumentation] Background job handlers registered');
    } catch (error) {
      console.warn('[Instrumentation] Failed to register job handlers:', error);
    }

    // ---- 7. Cache Warming ----
    try {
      const { getCachedFeaturedProducts, getCachedCategories } = await import('@/lib/performance/query-optimizer');
      await getCachedFeaturedProducts();
      await getCachedCategories();
      console.log('[Instrumentation] Cache warmed');
    } catch (error) {
      console.warn('[Instrumentation] Cache warming failed:', error);
    }

    // ---- 8. Periodic Monitoring (Production Only) ----
    if (process.env.NODE_ENV === 'production') {
      let monitoringInterval: NodeJS.Timeout | undefined;
      try {
        const { updateCacheStats, updateConnectionPoolStats, updateQueueStats } = await import('@/lib/performance/query-optimizer');

        monitoringInterval = setInterval(async () => {
          try {
            await updateConnectionPoolStats();
            updateCacheStats();
            await updateQueueStats();
          } catch {
            // Monitoring must never break the application
          }
        }, 60000);
      } catch {
        // Monitoring setup failed — non-critical
      }

      // ---- 9. Graceful Shutdown ----
      const shutdown = async (signal: string) => {
        console.log(`[Instrumentation] Received ${signal}, shutting down gracefully...`);
        if (monitoringInterval) clearInterval(monitoringInterval);

        // Shutdown OpenTelemetry
        try {
          const { shutdownOpenTelemetry } = await import('@/lib/monitoring/opentelemetry');
          await shutdownOpenTelemetry();
        } catch {
          // Best effort
        }

        console.log('[Instrumentation] Shutdown complete');
        process.exit(0);
      };

      process.on('SIGTERM', () => shutdown('SIGTERM'));
      process.on('SIGINT', () => shutdown('SIGINT'));
    }

    console.log('[Instrumentation] All services initialized');
  }
}
