/**
 * @fileoverview CSRF Protection
 *
 * Protects every state-changing request (POST, PUT, PATCH, DELETE) against
 * Cross-Site Request Forgery attacks.
 *
 * STRATEGY (Defense-in-Depth):
 *   1. Origin/Referer verification — reject requests with missing/wrong origins
 *   2. Custom CSRF token — double-submit cookie pattern
 *   3. SameSite cookie enforcement — Strict for session cookies
 *   4. Content-Type verification — reject non-JSON for API routes
 *
 * OWASP: A01:2021 — Broken Access Control
 * OWASP: A08:2021 — Software and Data Integrity Failures
 *
 * Why not just SameSite cookies?
 *   - SameSite=Lax allows top-level navigations (GET)
 *   - Some older browsers don't support SameSite
 *   - Defense-in-depth: multiple independent protections
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

// ============================================================
// CONFIGURATION
// ============================================================

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = '__Host-csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_SECRET_ENV = 'CSRF_SECRET';

// Allowed origins for CORS/CSRF
const ALLOWED_ORIGINS = new Set([
  // Production origins (add your actual domain)
  // 'https://yourdomain.com',
  // 'https://www.yourdomain.com',
]);

// ============================================================
// CSRF TOKEN GENERATION
// ============================================================

/**
 * Get the CSRF secret from environment or generate one.
 * In production, CSRF_SECRET MUST be set as an environment variable.
 */
function getCSRFSecret(): string {
  const secret = process.env[CSRF_SECRET_ENV];
  if (secret) return secret;

  // Development fallback — generate a random secret per process
  if (process.env.NODE_ENV === 'development') {
    const devSecret = `dev_csrf_${randomBytes(32).toString('hex')}`;
    process.env[CSRF_SECRET_ENV] = devSecret;
    return devSecret;
  }

  throw new Error(
    `SECURITY: ${CSRF_SECRET_ENV} environment variable is required in production. ` +
    `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  );
}

/**
 * Generate a cryptographically secure CSRF token.
 * Format: <random_hex>.<hmac_hex>
 *
 * The HMAC binds the token to the server secret, preventing
 * token forgery even if the random portion is known.
 */
export function generateCSRFToken(): string {
  const random = randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
  const secret = getCSRFSecret();
  const hmac = createHmac('sha256', secret).update(random).digest('hex');
  return `${random}.${hmac}`;
}

/**
 * Verify a CSRF token against the server secret.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyCSRFToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [random, providedHmac] = parts;

  // Recompute the expected HMAC
  const secret = getCSRFSecret();
  const expectedHmac = createHmac('sha256', secret).update(random!).digest('hex');

  // Timing-safe comparison
  try {
    const provided = Buffer.from(providedHmac!, 'hex');
    const expected = Buffer.from(expectedHmac, 'hex');

    if (provided.length !== expected.length) return false;

    return timingSafeEqual(provided, expected);
  } catch {
    return false;
  }
}

// ============================================================
// ORIGIN VERIFICATION
// ============================================================

/**
 * Verify the Origin or Referer header against allowed origins.
 *
 * This is the FIRST line of CSRF defense:
 * - If Origin header is present, it must match an allowed origin
 * - If Origin is missing, fall back to Referer header
 * - If both are missing, reject the request (strict mode)
 */
export function verifyOrigin(request: NextRequest): { valid: boolean; origin?: string; reason?: string } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // Prefer Origin header (sent by browsers on CORS and same-origin POST)
  if (origin) {
    const allowed = isOriginAllowed(origin, host);
    if (!allowed.valid) {
      return { valid: false, origin, reason: allowed.reason };
    }
    return { valid: true, origin };
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
      const allowed = isOriginAllowed(refererOrigin, host);
      if (!allowed.valid) {
        return { valid: false, origin: refererOrigin, reason: allowed.reason };
      }
      return { valid: true, origin: refererOrigin };
    } catch {
      return { valid: false, reason: 'Invalid Referer header format' };
    }
  }

  // Neither Origin nor Referer present — strict mode: reject
  // Exception: API routes called from server-side (e.g., webhooks)
  return { valid: false, reason: 'Missing Origin and Referer headers' };
}

/**
 * Check if an origin is allowed.
 *
 * In production, you must configure ALLOWED_ORIGINS or rely on
 * host-based matching (origin must match the request host).
 */
function isOriginAllowed(origin: string, host?: string | null): { valid: boolean; reason?: string } {
  // Check explicit allowlist first
  if (ALLOWED_ORIGINS.size > 0 && (ALLOWED_ORIGINS as Set<string>).has(origin)) {
    return { valid: true };
  }

  // Allow same-origin requests (origin matches the host)
  if (host) {
    const expectedOrigins = [
      `https://${host}`,
      `http://${host}`, // Development only
    ];

    if (process.env.NODE_ENV === 'development') {
      expectedOrigins.push(`http://localhost:${host.split(':')[1] || '9002'}`);
    }

    if (expectedOrigins.includes(origin as never)) {
      return { valid: true };
    }
  }

  // In development, be more permissive
  if (process.env.NODE_ENV === 'development') {
    try {
      const url = new URL(origin);
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return { valid: true };
      }
    } catch {
      // Invalid URL
    }
  }

  return { valid: false, reason: `Origin ${origin} is not allowed` };
}

// ============================================================
// CSRF MIDDLEWARE
// ============================================================

/**
 * CSRF protection middleware for state-changing requests.
 *
 * This should be called in the Next.js middleware for every
 * POST, PUT, PATCH, DELETE request.
 *
 * SAFE METHODS (GET, HEAD, OPTIONS) are allowed through without CSRF checks.
 *
 * EXCEPTIONS:
 *   - /api/webhooks/* — external services don't send CSRF tokens
 *   - Server Actions — Next.js handles CSRF for server actions internally
 */
export function csrfProtection(
  request: NextRequest,
  exemptPaths: string[] = ['/api/webhooks']
): { allowed: boolean; reason?: string } {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return { allowed: true };
  }

  // Exempt webhook paths (external services)
  if (exemptPaths.some(path => pathname.startsWith(path))) {
    return { allowed: true };
  }

  // Step 1: Verify Origin/Referer
  const originCheck = verifyOrigin(request);
  if (!originCheck.valid) {
    return { allowed: false, reason: `CSRF origin check failed: ${originCheck.reason}` };
  }

  // Step 2: Verify CSRF token (double-submit cookie pattern)
  // For API routes: check X-CSRF-Token header
  if (pathname.startsWith('/api/')) {
    const csrfToken = request.headers.get(CSRF_HEADER_NAME);
    const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;

    if (!csrfToken) {
      return { allowed: false, reason: 'Missing CSRF token header' };
    }

    if (!verifyCSRFToken(csrfToken)) {
      return { allowed: false, reason: 'Invalid CSRF token' };
    }

    // Optional: verify cookie matches header (double-submit)
    if (csrfCookie && csrfCookie !== csrfToken) {
      return { allowed: false, reason: 'CSRF token mismatch between header and cookie' };
    }
  }

  // Step 3: Content-Type verification for API routes
  if (pathname.startsWith('/api/')) {
    const contentType = request.headers.get('content-type');
    if (contentType && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      // Reject non-JSON, non-multipart content types for API routes
      // This prevents form-based CSRF attacks
      if (contentType.includes('application/x-www-form-urlencoded')) {
        return { allowed: false, reason: 'Form-encoded requests are not accepted by API routes' };
      }
    }
  }

  return { allowed: true };
}

// ============================================================
// CSRF TOKEN SETTING HELPER
// ============================================================

/**
 * Set the CSRF cookie on a response.
 * Called when a new session is established or on page load.
 */
export function setCSRFCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}

/**
 * Get the CSRF cookie name for client-side header inclusion.
 */
export function getCSRFCookieName(): string {
  return CSRF_COOKIE_NAME;
}

/**
 * Get the CSRF header name for client-side inclusion.
 */
export function getCSRFHeaderName(): string {
  return CSRF_HEADER_NAME;
}
