import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { applySecurityHeaders, generateCSPNonce } from '@/lib/security/headers';
import { csrfProtection } from '@/lib/security/csrf';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier } from '@/lib/security/rate-limit';
import { logSecurityEvent, SecurityEventType, SecuritySeverity, generateCorrelationId } from '@/lib/security/security-logger';
import { performanceMonitor, startTimer } from '@/lib/performance/monitor';

/**
 * VendorTrack Middleware — Server-Side Route Protection & Security
 *
 * LAYER 1: Security Headers (CSP, HSTS, X-Frame-Options, etc.)
 * LAYER 2: CSRF Protection (Origin verification, CSRF tokens)
 * LAYER 3: Rate Limiting (per-user, per-IP, burst limits)
 * LAYER 4: Authentication & Authorization (RBAC) — skipped if Supabase not configured
 *
 * GRACEFUL DEGRADATION: If Supabase is not configured, Layers 1-3 still apply.
 * Auth-protected routes redirect to login. Public pages render normally.
 *
 * SECURITY: This is the FIRST line of defense. Even if client-side
 * checks are bypassed, the middleware will redirect unauthorized users.
 *
 * OWASP Coverage:
 *   - A01:2021 — Broken Access Control
 *   - A03:2021 — Injection (CSP mitigates XSS)
 *   - A05:2021 — Security Misconfiguration
 *   - A07:2021 — Authentication Failures
 *   - A08:2021 — Software and Data Integrity Failures
 */

// Route protection rules: path prefix → required roles
const PROTECTED_ROUTES: Record<string, string[]> = {
  '/admin-dashboard': ['super_admin', 'admin'],
  '/seller-dashboard': ['super_admin', 'admin', 'seller'],
  '/buyer-orders': ['super_admin', 'admin', 'buyer'],
  '/cart': ['super_admin', 'admin', 'buyer'],
  '/checkout': ['super_admin', 'admin', 'buyer'],
  '/buyer-dashboard': ['super_admin', 'admin', 'buyer'],
};

// Routes that authenticated users should NOT access (login, signup)
const UNAUTHENTICATED_ONLY_ROUTES = ['/login', '/signup'];

// Rate limit configuration per path
const RATE_LIMIT_MAP: Record<string, keyof typeof RATE_LIMITS> = {
  '/api/checkout': 'CHECKOUT',
  '/api/products/search': 'SEARCH',
  '/api/payment-health': 'PAYMENT_HEALTH',
};

// Check if Supabase is configured
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const timer = startTimer();

  // Generate correlation ID for request tracing
  const correlationId = generateCorrelationId();

  // Create a Supabase server client for session validation
  let supabaseResponse = NextResponse.next({
    request,
  });

  // ============================================================
  // LAYER 1: SECURITY HEADERS
  // ============================================================
  const nonce = generateCSPNonce();
  supabaseResponse = applySecurityHeaders(supabaseResponse, nonce);

  // Add correlation ID to response headers for debugging
  supabaseResponse.headers.set('X-Correlation-ID', correlationId);

  // ============================================================
  // LAYER 2: CSRF PROTECTION
  // ============================================================
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfResult = csrfProtection(request);

    if (!csrfResult.allowed) {
      // Log CSRF failure
      void logSecurityEvent({
        eventType: csrfResult.reason?.includes('origin')
          ? SecurityEventType.CSRF_ORIGIN_MISMATCH
          : SecurityEventType.CSRF_TOKEN_INVALID,
        severity: SecuritySeverity.HIGH,
        correlationId,
        path: pathname,
        method,
        description: `CSRF protection blocked: ${csrfResult.reason}`,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      });

      return NextResponse.json(
        {
          error: 'Request blocked by CSRF protection',
          code: 'CSRF_PROTECTION_VIOLATION',
          traceId: correlationId,
        },
        { status: 403 }
      );
    }
  }

  // ============================================================
  // LAYER 3: RATE LIMITING
  // ============================================================
  const rateLimitKey = RATE_LIMIT_MAP[pathname];
  if (rateLimitKey) {
    const rateLimitConfig = RATE_LIMITS[rateLimitKey];
    const identifier = getClientIdentifier(request);

    const rateLimitResult = checkRateLimit(rateLimitConfig, identifier);

    if (!rateLimitResult.allowed) {
      // Log rate limit event
      void logSecurityEvent({
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        severity: SecuritySeverity.LOW,
        correlationId,
        path: pathname,
        method,
        description: `Rate limit exceeded for ${identifier} on ${pathname}`,
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        metadata: { retryAfter: rateLimitResult.retryAfter },
      });

      const response = NextResponse.json(
        {
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: rateLimitResult.retryAfter,
          traceId: correlationId,
        },
        { status: 429 }
      );

      // Apply security headers to error response too
      applySecurityHeaders(response, nonce);
      response.headers.set('X-Correlation-ID', correlationId);
      response.headers.set('Retry-After', (rateLimitResult.retryAfter || 60).toString());
      response.headers.set('X-RateLimit-Limit', rateLimitConfig.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      response.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000).toString());

      return response;
    }

    // Add rate limit headers to successful responses
    supabaseResponse.headers.set('X-RateLimit-Limit', rateLimitConfig.maxRequests.toString());
    supabaseResponse.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
    supabaseResponse.headers.set('X-RateLimit-Reset', Math.ceil(rateLimitResult.resetAt / 1000).toString());
  }

  // ============================================================
  // LAYER 4: AUTHENTICATION & AUTHORIZATION
  // ============================================================
  // GRACEFUL: If Supabase is not configured, skip auth layer.
  // Protected routes redirect to login. Public pages pass through.

  if (!isSupabaseConfigured) {
    // Supabase not configured — protected routes redirect to login,
    // public pages pass through with security headers.
    const matchingRoute = Object.keys(PROTECTED_ROUTES).find(route =>
      pathname === route || pathname.startsWith(route + '/')
    );

    if (matchingRoute) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      const redirect = NextResponse.redirect(loginUrl);
      applySecurityHeaders(redirect, nonce);
      return redirect;
    }

    return supabaseResponse;
  }

  // Supabase is configured — proceed with full auth
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Validate the user's session
  const { data: { user } } = await supabase.auth.getUser();

  // ---- Check: Unauthenticated-only routes (login, signup) ----
  if (UNAUTHENTICATED_ONLY_ROUTES.some(route => pathname.startsWith(route))) {
    if (user) {
      // Already authenticated — redirect to appropriate dashboard
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_admin')
        .eq('id', user.id)
        .single();

      const redirectUrl = getDashboardUrl(profile?.is_admin, profile?.role);
      const redirect = NextResponse.redirect(new URL(redirectUrl, request.url));
      applySecurityHeaders(redirect, nonce);
      return redirect;
    }
    return supabaseResponse;
  }

  // ---- Check: Protected routes ----
  const matchingRoute = Object.keys(PROTECTED_ROUTES).find(route =>
    pathname === route || pathname.startsWith(route + '/')
  );

  if (!matchingRoute) {
    // Not a protected route — allow through
    return supabaseResponse;
  }

  // ---- Unauthenticated user trying to access protected route ----
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);

    // Log unauthorized access attempt
    void logSecurityEvent({
      eventType: SecurityEventType.ACCESS_DENIED,
      severity: SecuritySeverity.MEDIUM,
      correlationId,
      path: pathname,
      method,
      description: `Unauthenticated access attempt to protected route: ${pathname}`,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const redirect = NextResponse.redirect(loginUrl);
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  // ---- Fetch user's role for authorization ----
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_admin, seller_status')
    .eq('id', user.id)
    .single();

  // Resolve the user's effective role
  const effectiveRole = resolveEffectiveRole(profile?.is_admin, profile?.role);
  const allowedRoles = PROTECTED_ROUTES[matchingRoute];

  // ---- Check: User's role is allowed for this route ----
  if (!allowedRoles || !allowedRoles.includes(effectiveRole)) {
    // Log role escalation attempt
    void logSecurityEvent({
      eventType: SecurityEventType.ROLE_ESCALATION_ATTEMPT,
      severity: SecuritySeverity.HIGH,
      correlationId,
      userId: user.id,
      userRole: effectiveRole,
      path: pathname,
      method,
      description: `User with role "${effectiveRole}" attempted to access route requiring [${allowedRoles ? allowedRoles.join(', ') : ''}]: ${pathname}`,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
    });

    const redirectUrl = getDashboardUrl(profile?.is_admin, profile?.role);
    const redirect = NextResponse.redirect(new URL(redirectUrl, request.url));
    applySecurityHeaders(redirect, nonce);
    return redirect;
  }

  // ---- Special check: Seller must be approved to access seller dashboard ----
  if (matchingRoute === '/seller-dashboard' && effectiveRole === 'seller') {
    if (profile?.seller_status !== 'approved') {
      // Seller not yet approved — redirect to a waiting page or home
      const redirect = NextResponse.redirect(new URL('/products', request.url));
      applySecurityHeaders(redirect, nonce);
      return redirect;
    }
  }

  // Access granted — continue to the page
  // Record middleware timing
  const elapsed = timer();
  performanceMonitor.recordApiLatency(elapsed, pathname, 200);
  supabaseResponse.headers.set('X-Response-Time', `${elapsed.toFixed(1)}ms`);
  supabaseResponse.headers.set('Server-Timing', `middleware;dur=${elapsed.toFixed(1)}`);

  return supabaseResponse;
}

/**
 * Resolve the effective role from profile data.
 */
function resolveEffectiveRole(isAdmin: boolean | null | undefined, dbRole: string | null | undefined): string {
  if (isAdmin) return 'super_admin';
  if (dbRole === 'seller') return 'seller';
  if (dbRole === 'buyer') return 'buyer';
  return 'guest';
}

/**
 * Get the appropriate dashboard URL for a user based on their role.
 */
function getDashboardUrl(isAdmin: boolean | null | undefined, role: string | null | undefined): string {
  if (isAdmin) return '/admin-dashboard';
  if (role === 'seller') return '/seller-dashboard';
  return '/products';
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - api/webhooks (external webhooks — no user session, no CSRF)
     * - public files (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
