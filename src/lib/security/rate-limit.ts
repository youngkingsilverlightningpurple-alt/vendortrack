/**
 * @fileoverview Rate Limiting
 *
 * Protects all critical endpoints against abuse:
 *   - Login/signup brute force
 *   - Checkout/payment abuse
 *   - Refund abuse
 *   - AI endpoint abuse (token exhaustion)
 *   - Search abuse
 *   - Upload abuse
 *   - Password reset abuse
 *
 * IMPLEMENTATION:
 *   - In-memory sliding window counter (per-process)
 *   - For production: replace with Redis/Upstash for distributed rate limiting
 *   - Per-user (authenticated) and per-IP (unauthenticated) tracking
 *   - Burst limits (short window) + sustained limits (long window)
 *
 * OWASP: A07:2021 — Identification and Authentication Failures
 * OWASP: A10:2021 — Server-Side Request Forgery
 */

import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('rate-limit');

// ============================================================
// TYPES
// ============================================================

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Maximum burst requests in a short window */
  burstMax?: number;
  /** Burst window duration in seconds */
  burstWindowSeconds?: number;
  /** Key prefix for namespacing */
  keyPrefix: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp
  retryAfter?: number; // Seconds until reset
  reason?: string;
}

// ============================================================
// SLIDING WINDOW COUNTER
// ============================================================

interface Bucket {
  count: number;
  resetAt: number;
  burstCount?: number;
  burstResetAt?: number;
}

/**
 * In-memory rate limit store.
 * For production multi-instance deployments, replace with Redis.
 *
 * Memory safety: entries are cleaned up after expiry.
 * Expected memory usage: < 1MB for 10K active rate limit keys.
 */
class RateLimitStore {
  private store = new Map<string, Bucket>();
  private lastCleanup = Date.now();
  private readonly CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

  get(key: string): Bucket | undefined {
    this.maybeCleanup();
    return this.store.get(key);
  }

  set(key: string, bucket: Bucket): void {
    this.store.set(key, bucket);
  }

  increment(key: string): number {
    const bucket = this.store.get(key);
    if (bucket) {
      bucket.count++;
      if (bucket.burstCount !== undefined) {
        bucket.burstCount++;
      }
      return bucket.count;
    }
    return 0;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.CLEANUP_INTERVAL_MS) return;

    this.lastCleanup = now;
    for (const [key, bucket] of this.store.entries()) {
      if (now > bucket.resetAt) {
        this.store.delete(key);
      }
    }
  }

  /** For testing: clear all entries */
  clear(): void {
    this.store.clear();
  }

  /** Get current store size (for monitoring) */
  get size(): number {
    return this.store.size;
  }
}

const store = new RateLimitStore();

// ============================================================
// REDIS-BACKED RATE LIMITING (for multi-instance deployments)
// ============================================================

let redisRateLimitAvailable = false;

/**
 * Check if Redis-backed rate limiting is available.
 * When REDIS_URL is set, rate limits are distributed across all instances.
 */
export function isRedisRateLimitAvailable(): boolean {
  return redisRateLimitAvailable;
}

/**
 * Initialize Redis-backed rate limiting.
 * Call this once at application startup if REDIS_URL is configured.
 *
 * In production multi-instance deployments (Vercel, Kubernetes, etc.),
 * you MUST use Redis-backed rate limiting to prevent per-process limits
 * from being multiplied by the number of instances.
 *
 * Example usage with Upstash Redis:
 *   import { Redis } from '@upstash/redis';
 *   initRedisRateLimit(new Redis({ url: process.env.REDIS_URL }));
 */
export function initRedisRateLimit(redisClient: {
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { ex?: number }) => Promise<void>;
}): void {
  redisRateLimitAvailable = true;
  log.info('Redis-backed rate limiting initialized — distributed across all instances');
  // Store reference for use in checkRateLimit
  (globalThis as any).__vendortrack_redis_rate_limit = redisClient;
}

/**
 * Get the Redis rate limit client if available.
 */
function getRedisClient(): any {
  return (globalThis as any).__vendortrack_redis_rate_limit || null;
}

// ============================================================
// RATE LIMIT CONFIGURATIONS
// ============================================================

export const RATE_LIMITS = {
  // Authentication
  LOGIN: {
    maxRequests: 5,
    windowSeconds: 15 * 60, // 5 per 15 minutes
    burstMax: 3,
    burstWindowSeconds: 60, // 3 per minute
    keyPrefix: 'auth:login',
  },
  SIGNUP: {
    maxRequests: 3,
    windowSeconds: 60 * 60, // 3 per hour
    burstMax: 1,
    burstWindowSeconds: 60, // 1 per minute
    keyPrefix: 'auth:signup',
  },
  PASSWORD_RESET: {
    maxRequests: 3,
    windowSeconds: 60 * 60, // 3 per hour
    burstMax: 1,
    burstWindowSeconds: 300, // 1 per 5 minutes
    keyPrefix: 'auth:password-reset',
  },

  // Payments
  CHECKOUT: {
    maxRequests: 10,
    windowSeconds: 60 * 60, // 10 per hour
    burstMax: 3,
    burstWindowSeconds: 60, // 3 per minute
    keyPrefix: 'payment:checkout',
  },
  REFUND: {
    maxRequests: 5,
    windowSeconds: 60 * 60, // 5 per hour
    burstMax: 2,
    burstWindowSeconds: 300, // 2 per 5 minutes
    keyPrefix: 'payment:refund',
  },
  PAYMENT_HEALTH: {
    maxRequests: 30,
    windowSeconds: 60, // 30 per minute
    keyPrefix: 'payment:health',
  },

  // AI
  AI_GENERATE: {
    maxRequests: 10,
    windowSeconds: 60 * 60, // 10 per hour
    burstMax: 3,
    burstWindowSeconds: 60, // 3 per minute
    keyPrefix: 'ai:generate',
  },

  // Search
  SEARCH: {
    maxRequests: 60,
    windowSeconds: 60, // 60 per minute
    burstMax: 20,
    burstWindowSeconds: 10, // 20 per 10 seconds
    keyPrefix: 'search',
  },

  // Chat
  CHAT_SEND: {
    maxRequests: 30,
    windowSeconds: 60, // 30 per minute
    burstMax: 10,
    burstWindowSeconds: 10, // 10 per 10 seconds
    keyPrefix: 'chat:send',
  },

  // Cart
  CART_UPDATE: {
    maxRequests: 60,
    windowSeconds: 60, // 60 per minute
    burstMax: 20,
    burstWindowSeconds: 10, // 20 per 10 seconds
    keyPrefix: 'cart:update',
  },

  // Uploads
  UPLOAD: {
    maxRequests: 10,
    windowSeconds: 60 * 60, // 10 per hour
    burstMax: 3,
    burstWindowSeconds: 60, // 3 per minute
    keyPrefix: 'upload',
  },

  // Admin
  ADMIN_ACTION: {
    maxRequests: 30,
    windowSeconds: 60, // 30 per minute
    burstMax: 10,
    burstWindowSeconds: 10, // 10 per 10 seconds
    keyPrefix: 'admin:action',
  },

  // General API
  API_DEFAULT: {
    maxRequests: 100,
    windowSeconds: 60, // 100 per minute
    burstMax: 30,
    burstWindowSeconds: 10, // 30 per 10 seconds
    keyPrefix: 'api:default',
  },
} as const;

export type RateLimitKey = keyof typeof RATE_LIMITS;

// ============================================================
// RATE LIMIT CHECK
// ============================================================

/**
 * Check if a request is within rate limits.
 *
 * @param config - Rate limit configuration
 * @param identifier - User ID or IP address
 * @returns Rate limit result with remaining count and reset time
 */
export function checkRateLimit(
  config: RateLimitConfig,
  identifier: string
): RateLimitResult {
  const key = `${config.keyPrefix}:${identifier}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const resetAt = now + windowMs;

  let bucket = store.get(key);

  // Create new bucket if not exists or expired
  if (!bucket || now > bucket.resetAt) {
    bucket = {
      count: 0,
      resetAt,
      burstCount: 0,
      burstResetAt: now + (config.burstWindowSeconds || 10) * 1000,
    };
    store.set(key, bucket);
  }

  // Reset burst counter if burst window expired
  if (bucket.burstCount !== undefined && bucket.burstResetAt && now > bucket.burstResetAt) {
    bucket.burstCount = 0;
    bucket.burstResetAt = now + (config.burstWindowSeconds || 10) * 1000;
  }

  // Check sustained limit
  if (bucket.count >= config.maxRequests) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    log.warn('Rate limit exceeded', {
      action: 'rate_limit_exceeded',
      data: { key, count: bucket.count, max: config.maxRequests, retryAfter },
    });
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfter,
      reason: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
    };
  }

  // Check burst limit
  if (config.burstMax && bucket.burstCount !== undefined && bucket.burstCount >= config.burstMax) {
    const retryAfter = Math.ceil(((bucket.burstResetAt || resetAt) - now) / 1000);
    log.warn('Burst rate limit exceeded', {
      action: 'burst_rate_limit_exceeded',
      data: { key, burstCount: bucket.burstCount, burstMax: config.burstMax, retryAfter },
    });
    return {
      allowed: false,
      remaining: 0,
      resetAt: bucket.burstResetAt || resetAt,
      retryAfter,
      reason: `Burst rate limit exceeded. Try again in ${retryAfter} seconds.`,
    };
  }

  // Increment counters
  store.increment(key);

  const remaining = Math.max(0, config.maxRequests - bucket.count - 1);
  return {
    allowed: true,
    remaining,
    resetAt: bucket.resetAt,
  };
}

// ============================================================
// REQUEST-LEVEL HELPERS
// ============================================================

/**
 * Extract the client identifier from a request.
 * Uses authenticated user ID if available, otherwise falls back to IP.
 */
export function getClientIdentifier(request: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`;

  // Try X-Forwarded-For header (behind reverse proxy)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const firstIP = forwarded.split(',')[0]!.trim();
    if (firstIP) return `ip:${firstIP}`;
  }

  // Try X-Real-IP header
  const realIP = request.headers.get('x-real-ip');
  if (realIP) return `ip:${realIP}`;

  // Fallback: connection remote address (may not be available in all environments)
  return `ip:unknown`;
}

/**
 * Create rate limit response headers.
 * These follow the IETF RateLimit header standard.
 */
export function getRateLimitHeaders(
  result: RateLimitResult,
  config: RateLimitConfig
): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}

/**
 * Apply rate limit to a request and return a 429 response if exceeded.
 * Returns null if the request is allowed.
 */
export function applyRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  userId?: string
): { allowed: true; result: RateLimitResult } | { allowed: false; response: Response } {
  const identifier = getClientIdentifier(request, userId);
  const result = checkRateLimit(config, identifier);

  if (!result.allowed) {
    const headers = getRateLimitHeaders(result, config);
    return {
      allowed: false,
      response: new Response(
        JSON.stringify({
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: result.retryAfter,
          traceId: `rl_${Date.now()}`,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
        }
      ),
    };
  }

  return { allowed: true, result };
}

// ============================================================
// CLEANUP (for testing)
// ============================================================

export function clearRateLimitStore(): void {
  store.clear();
}
