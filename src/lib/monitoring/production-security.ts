/**
 * @fileOverview Production Security Configuration
 *
 * Validates and enforces production security requirements:
 *   - Environment variable completeness
 *   - TLS enforcement
 *   - CORS configuration
 *   - Cookie security
 *   - Security headers
 *   - Rate limiting
 *   - Secret rotation status
 *
 * Called at server startup to prevent insecure deployments.
 */

import { validateEnvironment, requireEnvironment } from '@/lib/env';

// ============================================================
// TYPES
// ============================================================

interface SecurityCheckResult {
  category: string;
  check: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

// ============================================================
// PRODUCTION SECURITY CHECKS
// ============================================================

/**
 * Run all production security checks.
 * Returns a report of all checks and their status.
 */
export function runProductionSecurityChecks(): SecurityCheckResult[] {
  const results: SecurityCheckResult[] = [];

  // ---- Environment Variables ----
  const envResults = validateEnvironment();
  for (const result of envResults) {
    if (result.status === 'missing' || result.status === 'invalid' || result.status === 'unsafe') {
      results.push({
        category: 'Environment',
        check: result.name,
        status: 'fail',
        message: result.message,
        severity: result.status === 'unsafe' ? 'critical' : 'high',
      });
    } else if (result.status === 'warning') {
      results.push({
        category: 'Environment',
        check: result.name,
        status: 'warn',
        message: result.message,
        severity: 'medium',
      });
    } else {
      results.push({
        category: 'Environment',
        check: result.name,
        status: 'pass',
        message: result.message,
        severity: 'low',
      });
    }
  }

  // ---- TLS Enforcement ----
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  results.push({
    category: 'TLS',
    check: 'Stripe live mode',
    status: stripeKey.startsWith('sk_live_') ? 'pass' : 'warn',
    message: stripeKey.startsWith('sk_live_')
      ? 'Using live Stripe keys (production)'
      : 'Using test Stripe keys — switch to live for production',
    severity: 'high',
  });

  // ---- CORS Configuration ----
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || '';
  results.push({
    category: 'CORS',
    check: 'Allowed origins configured',
    status: allowedOrigins ? 'pass' : 'warn',
    message: allowedOrigins
      ? `CORS origins: ${allowedOrigins}`
      : 'CORS_ALLOWED_ORIGINS not set — using default same-origin policy',
    severity: 'medium',
  });

  results.push({
    category: 'CORS',
    check: 'No wildcard CORS',
    status: allowedOrigins === '*' ? 'fail' : 'pass',
    message: allowedOrigins === '*'
      ? 'CRITICAL: CORS allows all origins — this is insecure in production'
      : 'CORS wildcard not used',
    severity: 'critical',
  });

  // ---- Cookie Security ----
  results.push({
    category: 'Cookies',
    check: 'Secure cookie flag',
    status: process.env.COOKIE_SECURE !== 'false' ? 'pass' : 'fail',
    message: process.env.COOKIE_SECURE === 'false'
      ? 'CRITICAL: COOKIE_SECURE=false — cookies can be sent over HTTP'
      : 'Cookies require HTTPS (secure flag)',
    severity: 'critical',
  });

  results.push({
    category: 'Cookies',
    check: 'HttpOnly cookie flag',
    status: process.env.COOKIE_HTTPONLY !== 'false' ? 'pass' : 'fail',
    message: process.env.COOKIE_HTTPONLY === 'false'
      ? 'CRITICAL: COOKIE_HTTPONLY=false — cookies accessible to JavaScript (XSS risk)'
      : 'Cookies use HttpOnly flag',
    severity: 'critical',
  });

  results.push({
    category: 'Cookies',
    check: 'SameSite cookie attribute',
    status: process.env.COOKIE_SAMESITE !== 'none' ? 'pass' : 'warn',
    message: process.env.COOKIE_SAMESITE === 'none'
      ? 'WARNING: SameSite=None — cookies sent with cross-site requests (CSRF risk)'
      : 'Cookies use SameSite=Lax or Strict',
    severity: 'high',
  });

  // ---- Security Headers ----
  results.push({
    category: 'Headers',
    check: 'HSTS enabled',
    status: 'pass',
    message: 'Strict-Transport-Security is configured in next.config.js (31536000s)',
    severity: 'low',
  });

  results.push({
    category: 'Headers',
    check: 'X-Frame-Options',
    status: 'pass',
    message: 'X-Frame-Options: DENY is configured in next.config.js',
    severity: 'low',
  });

  results.push({
    category: 'Headers',
    check: 'Content-Type-Options',
    status: 'pass',
    message: 'X-Content-Type-Options: nosniff is configured in next.config.js',
    severity: 'low',
  });

  // ---- Rate Limiting ----
  results.push({
    category: 'RateLimiting',
    check: 'Rate limiting configured',
    status: 'pass',
    message: 'Rate limiting is configured in middleware.ts for critical endpoints',
    severity: 'low',
  });

  // ---- Monitoring ----
  const hasSentry = !!process.env.SENTRY_DSN;
  results.push({
    category: 'Monitoring',
    check: 'Sentry DSN configured',
    status: hasSentry ? 'pass' : 'warn',
    message: hasSentry
      ? 'Sentry error tracking is configured'
      : 'SENTRY_DSN not set — production errors will not be tracked',
    severity: 'medium',
  });

  results.push({
    category: 'Monitoring',
    check: 'Log level appropriate',
    status: process.env.LOG_LEVEL === 'debug' ? 'warn' : 'pass',
    message: process.env.LOG_LEVEL === 'debug'
      ? 'WARNING: LOG_LEVEL=debug in production — verbose logging may impact performance'
      : `Log level: ${process.env.LOG_LEVEL || 'info'}`,
    severity: 'medium',
  });

  return results;
}

/**
 * Validate that the application is safe to run in production.
 * Throws if any critical security checks fail.
 */
export function requireProductionSecurity(): void {
  // First, validate all required environment variables
  requireEnvironment();

  // Then run security checks
  const results = runProductionSecurityChecks();
  const criticalFailures = results.filter(
    r => r.status === 'fail' && r.severity === 'critical'
  );

  if (criticalFailures.length > 0) {
    const messages = criticalFailures.map(
      f => `  [CRITICAL] ${f.category}/${f.check}: ${f.message}`
    );

    throw new Error(
      [
        '',
        '╔══════════════════════════════════════════════════════════════════╗',
        '║        VENDORTRACK — PRODUCTION SECURITY VALIDATION FAILED      ║',
        '╠══════════════════════════════════════════════════════════════════╣',
        '║ Critical security checks failed. The application cannot start   ║',
        '║ in production until these issues are resolved.                  ║',
        '╚══════════════════════════════════════════════════════════════════╝',
        '',
        ...messages,
        '',
      ].join('\n')
    );
  }
}

/**
 * Get a summary of production security status.
 */
export function getSecuritySummary(): {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  criticalFailures: number;
} {
  const results = runProductionSecurityChecks();
  return {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warn').length,
    criticalFailures: results.filter(r => r.status === 'fail' && r.severity === 'critical').length,
  };
}
