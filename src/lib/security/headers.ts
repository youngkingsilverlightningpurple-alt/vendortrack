/**
 * @fileoverview Security Headers Configuration
 *
 * Implements OWASP-recommended HTTP security headers for all responses.
 * These headers are applied in Next.js middleware and next.config.js.
 *
 * Covers:
 *   - Content-Security-Policy (CSP) — XSS prevention
 *   - Strict-Transport-Security (HSTS) — TLS enforcement
 *   - X-Frame-Options — clickjacking prevention
 *   - Permissions-Policy — browser feature restriction
 *   - Referrer-Policy — information leakage prevention
 *   - X-Content-Type-Options — MIME sniffing prevention
 *   - Cross-Origin policies — isolation enforcement
 *
 * OWASP: A05:2021 — Security Misconfiguration
 * OWASP: A03:2021 — Injection (CSP mitigates XSS)
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ============================================================
// CONTENT SECURITY POLICY
// ============================================================

/**
 * Content Security Policy directives.
 *
 * STRICT MODE:
 *   - No inline scripts except Next.js hot reload (dev only)
 *   - No eval() in production
 *   - All external resources must be explicitly whitelisted
 *   - Stripe.js loaded from stripe.com only
 *   - Supabase client from supabase.co only
 *   - No data: URIs for scripts/styles
 */
function buildCSP(nonce?: string): string {
  const isDev = process.env.NODE_ENV === 'development';

  const directives: string[] = [
    // Default: deny everything
    `default-src 'none'`,

    // Scripts: only from self, Stripe, and Supabase
    `script-src 'self' https://js.stripe.com https://*.supabase.co${
      isDev ? " 'unsafe-eval' 'unsafe-inline'" : ''
    }${nonce ? ` 'nonce-${nonce}'` : ''}`,

    // Styles: self + inline styles (shadcn/ui requires some)
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,

    // Images: self + whitelisted domains + data URIs for avatars
    `img-src 'self' data: blob: https://lh3.googleusercontent.com https://*.supabase.co`,

    // Fonts: self + Google Fonts
    `font-src 'self' https://fonts.gstatic.com`,

    // Connect: API calls to self, Stripe, Supabase
    `connect-src 'self' https://api.stripe.com https://*.supabase.co wss://*.supabase.co${
      isDev ? ' http://localhost:* ws://localhost:*' : ''
    }`,

    // Frames: Stripe payment frames only
    `frame-src https://js.stripe.com https://hooks.stripe.com`,

    // Worker: self only
    `worker-src 'self' blob:`,

    // Manifest: self
    `manifest-src 'self'`,

    // Base URI: restrict to self
    `base-uri 'self'`,

    // Form actions: self only
    `form-action 'self'`,

    // No framing from other origins (supplement X-Frame-Options)
    `frame-ancestors 'none'`,

    // No plugin content
    `object-src 'none'`,

    // Require SRI for external scripts
    `require-trusted-types-for 'script'`,
  ];

  return directives.join('; ');
}

// ============================================================
// SECURITY HEADERS MAP
// ============================================================

/**
 * All security headers applied to every response.
 * These are the OWASP/ASVS recommended baseline.
 */
export function getSecurityHeaders(nonce?: string): Record<string, string> {
  return {
    // --- Content Security Policy ---
    'Content-Security-Policy': buildCSP(nonce),

    // --- Strict Transport Security ---
    // 1 year max-age, include subdomains, preload
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

    // --- X-Frame-Options ---
    // DENY: page cannot be framed at all (prevents clickjacking)
    'X-Frame-Options': 'DENY',

    // --- X-Content-Type-Options ---
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // --- Referrer-Policy ---
    // Only send origin on cross-origin requests
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // --- Permissions-Policy ---
    // Disable unnecessary browser features
    'Permissions-Policy': [
      'camera=()',
      'microphone=()',
      'geolocation=()',
      'payment=(self https://js.stripe.com)',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'encrypted-media=()',
      'picture-in-picture=()',
      'speaker-selection=()',
      'sync-xhr=()',
      'vr=()',
    ].join(', '),

    // --- Cross-Origin Isolation ---
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',

    // --- X-DNS-Prefetch-Control ---
    // Prevent DNS prefetching (information leakage)
    'X-DNS-Prefetch-Control': 'off',

    // --- X-Permitted-Cross-Domain-Policies ---
    'X-Permitted-Cross-Domain-Policies': 'none',

    // --- X-XSS-Protection ---
    // Deprecated but still useful for older browsers
    'X-XSS-Protection': '0', // Disable buggy XSS filter; CSP is the real defense
  };
}

// ============================================================
// MIDDLEWARE HELPER
// ============================================================

/**
 * Apply security headers to a Next.js response.
 * Use in middleware.ts for every response.
 */
export function applySecurityHeaders(
  response: NextResponse,
  nonce?: string
): NextResponse {
  const headers = getSecurityHeaders(nonce);

  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

/**
 * Generate a CSP nonce for the current request.
 * Use in middleware to allow inline scripts for this specific request.
 */
export function generateCSPNonce(): string {
  const array = new Uint8Array(16);
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    return Buffer.from(array).toString('base64');
  }
  // Fallback for environments without crypto
  return `nonce_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// ============================================================
// REPORT-ONLY MODE (for safe CSP rollout)
// ============================================================

/**
 * Get CSP headers in report-only mode.
 * Use this during initial deployment to identify false positives
 * before switching to enforcement mode.
 */
export function getReportOnlyHeaders(reportEndpoint?: string): Record<string, string> {
  const csp = buildCSP();
  const reportUri = reportEndpoint || '/api/csp-report';

  return {
    'Content-Security-Policy-Report-Only': `${csp}; report-uri ${reportUri}`,
    // Keep all other security headers in enforcement mode
    ...Object.fromEntries(
      Object.entries(getSecurityHeaders()).filter(([k]) => k !== 'Content-Security-Policy')
    ),
  };
}
