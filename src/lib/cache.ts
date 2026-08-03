/**
 * @fileOverview Enterprise Caching Strategy
 *
 * Implements a multi-layer caching approach for the VendorTrack marketplace:
 *
 *   Layer 1: Next.js cache() — Server-side request deduplication
 *   Layer 2: revalidateTag() — Targeted cache invalidation
 *   Layer 3: revalidatePath() — Full page cache invalidation
 *   Layer 4: HTTP Cache Headers — stale-while-revalidate
 *   Layer 5: In-memory LRU cache — Fast application-level cache
 *
 * DESIGN PRINCIPLES:
 *   - Cache aggressively, invalidate precisely
 *   - Never cache financial data beyond 60s (stale rates are dangerous)
 *   - Product data can be cached for 5 minutes (rarely changes)
 *   - User profiles can be cached for 2 minutes (session-scoped)
 *   - Analytics can be cached for 5 minutes (materialized views)
 *
 * ANTI-PATTERNS AVOIDED:
 *   - No caching of payment intent data
 *   - No caching of order status (changes frequently)
 *   - No caching of financial ledger entries
 *   - No caching of webhook processing results
 */

import { unstable_cache } from 'next/cache';
import type { MarketplaceStats } from './analytics-service';
import type { TopSellerData, DailyRevenueData } from '@/types';

// ============================================================
// CACHE DURATIONS (in seconds)
// ============================================================

export const CACHE_DURATIONS = {
  /** Product listings — 5 minutes (products rarely change) */
  PRODUCTS: 300,
  /** Product detail — 2 minutes (might update stock) */
  PRODUCT_DETAIL: 120,
  /** User profile — 2 minutes (session-scoped) */
  USER_PROFILE: 120,
  /** Marketplace stats — 5 minutes (materialized views) */
  MARKETPLACE_STATS: 300,
  /** Seller revenue — 3 minutes (dashboard data) */
  SELLER_REVENUE: 180,
  /** Buyer spending — 3 minutes (dashboard data) */
  BUYER_SPENDING: 180,
  /** Top sellers — 5 minutes (materialized views) */
  TOP_SELLERS: 300,
  /** Daily revenue — 5 minutes (materialized views) */
  DAILY_REVENUE: 300,
  /** Revenue by category — 5 minutes (materialized views) */
  REVENUE_BY_CATEGORY: 300,
  /** Search results — 1 minute (search consistency) */
  SEARCH_RESULTS: 60,
  /** Payment health — 30 seconds (critical monitoring) */
  PAYMENT_HEALTH: 30,
  /** Category list — 10 minutes (rarely changes) */
  CATEGORIES: 600,
} as const;

// ============================================================
// CACHE TAGS (for targeted invalidation)
// ============================================================

export const CACHE_TAGS = {
  /** All product-related caches */
  PRODUCTS: 'products',
  /** Specific product cache */
  PRODUCT_DETAIL: (id: string) => `product-${id}`,
  /** Seller's products cache */
  SELLER_PRODUCTS: (sellerId: string) => `seller-products-${sellerId}`,
  /** All marketplace analytics */
  ANALYTICS: 'analytics',
  /** Seller-specific analytics */
  SELLER_ANALYTICS: (sellerId: string) => `seller-analytics-${sellerId}`,
  /** Buyer-specific analytics */
  BUYER_ANALYTICS: (buyerId: string) => `buyer-analytics-${buyerId}`,
  /** Payment health data */
  PAYMENT_HEALTH: 'payment-health',
  /** Category list */
  CATEGORIES: 'categories',
  /** Search index */
  SEARCH: 'search',
} as const;

// ============================================================
// IN-MEMORY LRU CACHE
// ============================================================
// For hot data that doesn't need persistence.
// Suitable for server-side rendering contexts.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LRUCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  set(key: string, value: T, ttlMs: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Singleton caches with proper typing
export const productCache = new LRUCache<Record<string, string | number | boolean | undefined>>(200);
export const analyticsCache = new LRUCache<MarketplaceStats>(50);
export const userCache = new LRUCache<Record<string, string | number | boolean | undefined>>(500);

// ============================================================
// CACHED FETCH FUNCTIONS
// ============================================================
// These use Next.js unstable_cache for server-side caching
// with automatic revalidation.

/**
 * Cached marketplace stats fetcher.
 * Uses Next.js cache() with tag-based invalidation.
 */
export const getCachedMarketplaceStats = unstable_cache(
  async () => {
    const { fetchMarketplaceStats } = await import('./analytics-service');
    return fetchMarketplaceStats();
  },
  ['marketplace-stats'],
  {
    revalidate: CACHE_DURATIONS.MARKETPLACE_STATS,
    tags: [CACHE_TAGS.ANALYTICS, CACHE_TAGS.PRODUCTS],
  }
);

/**
 * Cached top sellers fetcher.
 */
export const getCachedTopSellers = unstable_cache(
  async (limit: number = 10): Promise<TopSellerData[]> => {
    const { fetchTopSellers } = await import('./analytics-service');
    return fetchTopSellers(limit);
  },
  ['top-sellers'],
  {
    revalidate: CACHE_DURATIONS.TOP_SELLERS,
    tags: [CACHE_TAGS.ANALYTICS],
  }
);

/**
 * Cached daily revenue fetcher.
 */
export const getCachedDailyRevenue = unstable_cache(
  async (days: number = 30): Promise<DailyRevenueData[]> => {
    const { fetchDailyRevenue } = await import('./analytics-service');
    return fetchDailyRevenue(days);
  },
  ['daily-revenue'],
  {
    revalidate: CACHE_DURATIONS.DAILY_REVENUE,
    tags: [CACHE_TAGS.ANALYTICS],
  }
);

// ============================================================
// HTTP CACHE HEADERS
// ============================================================

/**
 * Generate HTTP cache headers for API responses.
 * Uses stale-while-revalidate for optimal UX.
 */
export function getCacheHeaders(duration: number, staleWhileRevalidate?: number): HeadersInit {
  const swr = staleWhileRevalidate || Math.floor(duration / 2);
  return {
    'Cache-Control': `public, s-maxage=${duration}, stale-while-revalidate=${swr}`,
  };
}

/**
 * Generate no-cache headers for sensitive data.
 * Used for payment-related API responses.
 */
export function getNoCacheHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}
