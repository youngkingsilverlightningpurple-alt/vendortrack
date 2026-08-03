/**
 * @fileOverview Monitoring Module Index
 *
 * Central export point for all monitoring integrations.
 * Import from here to use any monitoring capability.
 */

// Sentry Error Tracking
export {
  initSentryServer,
  initSentryClient,
  captureException,
  addBreadcrumb,
  withSentry,
} from './sentry';

// OpenTelemetry Tracing
export {
  initOpenTelemetry,
  shutdownOpenTelemetry,
  getTracer,
  traced,
  tracedQuery,
  tracedApi,
  tracedPayment,
} from './opentelemetry';

// Feature Flags
export {
  isFeatureEnabled,
  getAllFeatureFlags,
  killSwitch,
} from './feature-flags';

// Production Security
export {
  runProductionSecurityChecks,
  requireProductionSecurity,
  getSecuritySummary,
} from './production-security';
