/**
 * @fileOverview Performance Middleware
 *
 * Adds performance instrumentation to every request:
 *   - Request timing
 *   - Response compression
 *   - Cache headers
 *   - Request deduplication
 *   - Performance monitoring
 *
 * INTEGRATION: This is applied in the Next.js middleware chain
 * alongside the existing security middleware.
 */

import { NextRequest, NextResponse } from 'next/server';
import { performanceMonitor, startTimer } from '@/lib/performance/monitor';
import { cacheService, CACHE_DURATIONS, getCacheHeaders, getNoCacheHeaders } from '@/lib/cache/redis-client';

// Re-export cache header utilities for convenience
export { getCacheHeaders, getNoCacheHeaders };

// ============================================================
// REQUEST DEDUPLICATION
// ============================================================

const inFlightRequests = new Map<string, Promise<NextResponse>>();

/**
 * Deduplicate concurrent identical requests.
 * If the same request is already in flight, return the same promise.
 * This prevents thundering herd on cache misses.
 */
export function deduplicateRequest(
  key: string,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const existing = inFlightRequests.get(key);
  if (existing) {
    return existing;
  }

  const promise = handler().finally(() => {
    inFlightRequests.delete(key);
  });

  inFlightRequests.set(key, promise);
  return promise;
}

/**
 * Generate a request deduplication key.
 */
export function getDedupeKey(request: NextRequest): string {
  const url = request.url;
  const method = request.method;
  return `${method}:${url}`;
}

// ============================================================
// RESPONSE COMPRESSION
// ============================================================

/**
 * Check if the client accepts gzip/deflate encoding.
 */
function acceptsEncoding(request: NextRequest, encoding: string): boolean {
  const acceptEncoding = request.headers.get('accept-encoding') || '';
  return acceptEncoding.includes(encoding);
}

/**
 * Add compression headers to the response.
 * Note: Next.js handles compression automatically in production.
 * This is a fallback for custom server deployments.
 */
export function addCompressionHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  if (acceptsEncoding(request, 'br')) {
    response.headers.set('Content-Encoding', 'br');
  } else if (acceptsEncoding(request, 'gzip')) {
    response.headers.set('Content-Encoding', 'gzip');
  }

  return response;
}

// ============================================================
// CACHE HEADER STRATEGY
// ============================================================

/**
 * Cache strategies by route pattern.
 */
const ROUTE_CACHE_STRATEGY: Array<{
  pattern: RegExp;
  maxAge: number;
  staleWhileRevalidate?: number;
  isPrivate?: boolean;
}> = [
  // Public product pages — cache aggressively
  { pattern: /^\/products$/, maxAge: 300, staleWhileRevalidate: 60 },
  { pattern: /^\/products\/[^/]+$/, maxAge: 120, staleWhileRevalidate: 30 },

  // API routes
  { pattern: /^\/api\/products\/search/, maxAge: 60, staleWhileRevalidate: 30 },
  { pattern: /^\/api\/payment-health/, maxAge: 30, isPrivate: true },

  // Static pages — cache heavily
  { pattern: /^\/$/, maxAge: 180, staleWhileRevalidate: 60 },
  { pattern: /^\/(help|privacy-policy|terms)/, maxAge: 3600, staleWhileRevalidate: 300 },

  // Dashboard pages — short cache (private)
  { pattern: /^\/(admin|seller|buyer)-dashboard/, maxAge: 0, isPrivate: true },

  // Cart/checkout — no cache
  { pattern: /^\/(cart|checkout)/, maxAge: 0, isPrivate: true },
];

/**
 * Apply appropriate cache headers based on the route.
 */
export function applyCacheHeaders(
  request: NextRequest,
  response: NextResponse
): NextResponse {
  const { pathname } = request.nextUrl;

  for (const strategy of ROUTE_CACHE_STRATEGY) {
    if (strategy.pattern.test(pathname)) {
      if (strategy.maxAge === 0 || strategy.isPrivate) {
        const headers = getNoCacheHeaders();
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
        if (strategy.isPrivate) {
          response.headers.set('Cache-Control', 'private, no-cache, must-revalidate');
        }
      } else {
        const headers = getCacheHeaders(strategy.maxAge, strategy.staleWhileRevalidate);
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      }
      return response;
    }
  }

  // Default: no cache
  return response;
}

// ============================================================
// PERFORMANCE TIMING HEADERS
// ============================================================

/**
 * Add Server-Timing header to the response.
 * This allows the browser to see server-side timing in DevTools.
 */
export function addServerTimingHeader(
  response: NextResponse,
  metricName: string,
  durationMs: number
): void {
  const existing = response.headers.get('Server-Timing') || '';
  const newEntry = `${metricName};dur=${durationMs.toFixed(1)}`;
  response.headers.set(
    'Server-Timing',
    existing ? `${existing}, ${newEntry}` : newEntry
  );
}

// ============================================================
// PERFORMANCE MIDDLEWARE
// ============================================================

/**
 * Performance instrumentation middleware.
 * Wraps the request with timing and monitoring.
 */
export function withPerformanceTracking(
  request: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const timer = startTimer();
  const { pathname } = request.nextUrl;
  const method = request.method;

  return handler().then((response) => {
    const duration = timer();

    // Record metrics
    performanceMonitor.recordApiLatency(duration, pathname, response.status);

    // Add Server-Timing header
    addServerTimingHeader(response, 'total', duration);

    // Add cache headers
    applyCacheHeaders(request, response);

    // Add performance headers
    response.headers.set('X-Response-Time', `${duration.toFixed(1)}ms`);

    return response;
  }).catch((error) => {
    const duration = timer();
    performanceMonitor.recordApiLatency(duration, pathname, 500);
    throw error;
  });
}

// ============================================================
// API RESPONSE HELPERS
// ============================================================

/**
 * Create a paginated response with proper headers.
 */
export function paginatedResponse<T>(
  data: T[],
  options: {
    page: number;
    pageSize: number;
    total?: number;
    hasMore?: boolean;
    cursor?: string | null;
  }
): {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number | undefined;
    hasMore: boolean;
    cursor: string | null;
  };
} {
  return {
    data,
    pagination: {
      page: options.page,
      pageSize: options.pageSize,
      total: options.total,
      hasMore: options.hasMore ?? (data.length >= options.pageSize),
      cursor: options.cursor ?? null,
    },
  };
}

/**
 * Create a minimal API response (removes unnecessary fields).
 */
export function minimalProductResponse(product: Record<string, unknown>): Record<string, unknown> {
  return {
    id: product.id,
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl || product.image_url,
    category: product.category,
    status: product.status,
    stock: product.stock,
    sellerId: product.sellerId || product.seller_id,
  };
}
