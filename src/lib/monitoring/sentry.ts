/**
 * @fileOverview Sentry Error Tracking Integration
 *
 * Initializes Sentry for production error monitoring with:
 *   - Automatic performance tracing
 *   - Source map upload for readable stack traces546 traces
 *   - Custom context (user, tags, breadcrumbs)
 *   - Privacy filtering (strips PII)
 *   - Per-request error grouping
<parameter name="CONFIGURATION">
 *   SENTRY_DSN          — Required for Sentry integration
 *   SENTRY_ENVIRONMENT  — production / staging / development
 *   SENTRY_RELEASE      — Git SHA or version tag
 *   SENTRY_TRACES_SAMPLE_RATE — 0.0 to 1.0 (default: 0.1)
 */

// Sentry is an optional dependency — gracefully degrade if not installed
// P0 FIX: removed @ts-expect-error because @sentry/nextjs IS installed
// (the directive was causing "Unused '@ts-expect-error' directive" errors)
let Sentry: typeof import('@sentry/nextjs') | null = null;
try {
  Sentry = require('@sentry/nextjs');
} catch {
  // @sentry/nextjs not installed — Sentry features disabled
}

const SENTRY_DSN = process.env.SENTRY_DSN;
const SENTRY_ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
const SENTRY_RELEASE = process.env.SENTRY_RELEASE || process.env.npm_package_version || '0.1.0';
const TRACES_SAMPLE_RATE = parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1');
const PROFILES_SAMPLE_RATE = parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1');

/**
 * Initialize Sentry for server-side error tracking.
 * Call this in instrumentation.ts or at app startup.
 */
export function initSentryServer(): void {
  if (!Sentry) {
    console.warn('[Sentry] @sentry/nextjs not installed — error tracking disabled');
    return;
  }

  if (!SENTRY_DSN) {
    console.warn('[Sentry] SENTRY_DSN not configured — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,

    // Performance monitoring
    tracesSampleRate: TRACES_SAMPLE_RATE,
    profilesSampleRate: PROFILES_SAMPLE_RATE,

    // Filter sensitive data
    beforeSend(event: any) {
      // Strip PII from error events
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers?.['authorization'];
        delete event.request.headers?.['cookie'];
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.username;
        delete event.user.ip_address;
      }
      return event;
    },

    // Ignore noisy errors
    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'Network request failed',
      'Failed to fetch',
      'Load failed',
      'Non-Error promise rejection captured',
      'cancelled',
      'AbortError',
    ],

    // Deny URLs that shouldn't be tracked
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
      /googletagmanager\.com/i,
    ],
  });

  console.log(`[Sentry] Initialized — env=${SENTRY_ENVIRONMENT} release=${SENTRY_RELEASE}`);
}

/**
 * Initialize Sentry for client-side error tracking.
 * Call this in the Next.js layout or client provider.
 */
export function initSentryClient(): void {
  if (!Sentry || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: SENTRY_ENVIRONMENT,
    release: SENTRY_RELEASE,
    tracesSampleRate: TRACES_SAMPLE_RATE,

    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.1,

    beforeSend(event: any) {
      if (event.request?.url) {
        try {
          const url = new URL(event.request.url);
          url.searchParams.delete('token');
          url.searchParams.delete('key');
          url.searchParams.delete('secret');
          event.request.url = url.toString();
        } catch {
          // Invalid URL, leave as-is
        }
      }
      return event;
    },
  });
}

/**
 * Capture an exception with additional context.
 */
export function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
    user?: { id: string };
  }
): void {
  if (!Sentry) return;

  Sentry!.withScope((scope: any) => {
    if (context?.tags) {
      for (const [key, value] of Object.entries(context.tags)) {
        scope.setTag(key, value);
      }
    }
    if (context?.extra) {
      for (const [key, value] of Object.entries(context.extra)) {
        scope.setExtra(key, value);
      }
    }
    if (context?.user) {
      scope.setUser({ id: context.user.id });
    }
    Sentry!.captureException(error);
  });
}

/**
 * Add a breadcrumb for error tracing.
 */
export function addBreadcrumb(
  message: string,
  category: string,
  data?: Record<string, unknown>
): void {
  if (!Sentry) return;

  Sentry.addBreadcrumb({
    message,
    category,
    data,
    level: 'info',
    timestamp: Date.now() / 1000,
  });
}

/**
 * Wrap an async function with Sentry error tracking.
 * P0 FIX: updated from deprecated `startTransaction` (removed in Sentry v8)
 * to the new `startSpan` API.
 */
export function withSentry<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  operation: string
): T {
  if (!Sentry) return fn;

  return (async (...args: unknown[]) => {
    return Sentry!.startSpan({ name: operation, op: operation }, async () => {
      try {
        const result = await fn(...args);
        return result;
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { operation },
        });
        throw error;
      }
    });
  }) as T;
}
