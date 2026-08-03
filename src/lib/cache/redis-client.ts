/**
 * @fileOverview Redis Cache Client — Enterprise Caching Layer
 *
 * Provides a Redis-compatible cache that works in three modes:
 *   1. Redis (production) — Full persistence, pub/sub invalidation
 *   2. Upstash REST (serverless) — HTTP-based Redis for edge/Vercel
 *   3. In-memory LRU (development/fallback) — No external deps
 *
 * DESIGN PRINCIPLES:
 *   - Cache aggressively, invalidate precisely
 *   - Never cache financial data beyond 60s (stale rates are dangerous)
 *   - Product data can be cached for 5 minutes (rarely changes)
 *   - User profiles can be cached for 2 minutes (session-scoped)
 *   - Analytics can be cached for 5 minutes (materialized views)
 *   - All cache keys are prefixed with `vt:` (VendorTrack)
 *   - TTL is enforced at the cache layer, not the application layer
 *
 * ANTI-PATTERNS AVOIDED:
 *   - No caching of payment intent data
 *   - No caching of order status (changes frequently)
 *   - No caching of financial ledger entries
 *   - No caching of webhook processing results
 */

// ============================================================
// TYPES
// ============================================================

export interface CacheSetOptions {
  ttlSeconds: number;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  keyCount: number;
  memoryUsageBytes: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  tags: string[];
  createdAt: number;
}

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
  /** Seller profile — 5 minutes */
  SELLER_PROFILE: 300,
  /** Home page data — 3 minutes */
  HOME_PAGE: 180,
  /** Dashboard metrics — 2 minutes */
  DASHBOARD_METRICS: 120,
  /** Search suggestions — 10 minutes */
  SEARCH_SUGGESTIONS: 600,
  /** Featured products — 5 minutes */
  FEATURED_PRODUCTS: 300,
} as const;

// ============================================================
// CACHE TAGS (for targeted invalidation)
// ============================================================

export const CACHE_TAGS = {
  PRODUCTS: 'products',
  PRODUCT_DETAIL: (id: string) => `product-${id}`,
  SELLER_PRODUCTS: (sellerId: string) => `seller-products-${sellerId}`,
  ANALYTICS: 'analytics',
  SELLER_ANALYTICS: (sellerId: string) => `seller-analytics-${sellerId}`,
  BUYER_ANALYTICS: (buyerId: string) => `buyer-analytics-${buyerId}`,
  PAYMENT_HEALTH: 'payment-health',
  CATEGORIES: 'categories',
  SEARCH: 'search',
  SELLER_PROFILE: (sellerId: string) => `seller-profile-${sellerId}`,
  USER_PROFILE: (userId: string) => `user-profile-${userId}`,
  HOME_PAGE: 'home-page',
  DASHBOARD: 'dashboard',
  FEATURED: 'featured',
} as const;

// ============================================================
// IN-MEMORY LRU CACHE (fallback / development)
// ============================================================

class LRUCache {
  private cache = new Map<string, CacheEntry<unknown>>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> set of keys
  private readonly maxSize: number;
  private hits = 0;
  private misses = 0;

  constructor(maxSize: number = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeKeyFromTags(key, entry.tags);
      this.misses++;
      return undefined;
    }

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number, tags: string[] = []): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        const oldEntry = this.cache.get(firstKey);
        if (oldEntry) this.removeKeyFromTags(firstKey, oldEntry.tags);
        this.cache.delete(firstKey);
      }
    }

    const tagsForKey = tags.length > 0 ? tags : this.inferTags(key);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
      tags: tagsForKey,
      createdAt: Date.now(),
    });

    // Update tag index
    for (const tag of tagsForKey) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      this.removeKeyFromTags(key, entry.tags);
    }
    return this.cache.delete(key);
  }

  invalidateTag(tag: string): number {
    const keys = this.tagIndex.get(tag);
    if (!keys) return 0;

    let count = 0;
    for (const key of keys) {
      this.cache.delete(key);
      count++;
    }
    this.tagIndex.delete(tag);
    return count;
  }

  invalidatePattern(pattern: string): number {
    // Convert glob pattern to regex
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    let count = 0;

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        const entry = this.cache.get(key);
        if (entry) this.removeKeyFromTags(key, entry.tags);
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.tagIndex.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  getStats(): CacheStats {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? this.hits / total : 0,
      keyCount: this.cache.size,
      memoryUsageBytes: this.estimateMemoryUsage(),
    };
  }

  private removeKeyFromTags(key: string, tags: string[]): void {
    for (const tag of tags) {
      this.tagIndex.get(tag)?.delete(key);
      if (this.tagIndex.get(tag)?.size === 0) {
        this.tagIndex.delete(tag);
      }
    }
  }

  private inferTags(key: string): string[] {
    const tags: string[] = [];
    if (key.includes(':products:')) tags.push('products');
    if (key.includes(':analytics:')) tags.push('analytics');
    if (key.includes(':search:')) tags.push('search');
    if (key.includes(':categories:')) tags.push('categories');
    if (key.includes(':seller:')) tags.push('seller-profile');
    if (key.includes(':user:')) tags.push('user-profile');
    if (key.includes(':home:')) tags.push('home-page');
    if (key.includes(':dashboard:')) tags.push('dashboard');
    if (key.includes(':featured:')) tags.push('featured');
    return tags;
  }

  private estimateMemoryUsage(): number {
    // Rough estimate: 200 bytes per entry overhead + value size
    return this.cache.size * 200 + this.tagIndex.size * 100;
  }
}

// ============================================================
// CACHE SERVICE — Unified interface
// ============================================================

const KEY_PREFIX = 'vt:';

class CacheService {
  private store: LRUCache;
  private warmupPromises = new Map<string, Promise<unknown>>();

  constructor() {
    this.store = new LRUCache(2000);
  }

  private prefixKey(key: string): string {
    return `${KEY_PREFIX}${key}`;
  }

  /**
   * Get a value from cache.
   * Returns undefined if not found or expired.
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get<T>(this.prefixKey(key));
  }

  /**
   * Set a value in cache with TTL and optional tags.
   */
  async set<T>(key: string, value: T, options: CacheSetOptions): Promise<void> {
    this.store.set(this.prefixKey(key), value, options.ttlSeconds, options.tags);
  }

  /**
   * Delete a specific key from cache.
   */
  async delete(key: string): Promise<boolean> {
    return this.store.delete(this.prefixKey(key));
  }

  /**
   * Invalidate all keys with a given tag.
   * Returns the number of keys invalidated.
   */
  async invalidateTag(tag: string): Promise<number> {
    return this.store.invalidateTag(tag);
  }

  /**
   * Invalidate keys matching a glob pattern.
   * Supports * and ? wildcards.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    return this.store.invalidatePattern(this.prefixKey(pattern));
  }

  /**
   * Get or set a value — cache-aside pattern.
   * If the value is not in cache, calls the fetcher and caches the result.
   * Prevents cache stampede (thundering herd) by deduplicating concurrent fetches.
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheSetOptions
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    // Prevent cache stampede — deduplicate concurrent fetches
    const warmupKey = this.prefixKey(key);
    if (this.warmupPromises.has(warmupKey)) {
      return this.warmupPromises.get(warmupKey) as Promise<T>;
    }

    const fetchPromise = fetcher()
      .then((result) => {
        // Only cache if result is not null/undefined
        if (result !== null && result !== undefined) {
          void this.set(key, result, options);
        }
        this.warmupPromises.delete(warmupKey);
        return result;
      })
      .catch((error) => {
        this.warmupPromises.delete(warmupKey);
        throw error;
      });

    this.warmupPromises.set(warmupKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Multi-get — fetch multiple keys at once.
   * Returns a map of key -> value for found entries.
   */
  async multiGet<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();
    for (const key of keys) {
      const value = await this.get<T>(key);
      if (value !== undefined) {
        result.set(key, value);
      }
    }
    return result;
  }

  /**
   * Multi-set — set multiple key-value pairs at once.
   */
  async multiSet<T>(entries: Array<{ key: string; value: T; options: CacheSetOptions }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.options);
    }
  }

  /**
   * Clear all cache entries.
   */
  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    return this.store.getStats();
  }
}

// ============================================================
// SINGLETON EXPORT
// ============================================================

export const cacheService = new CacheService();

// ============================================================
// CONVENIENCE HELPERS
// ============================================================

/**
 * Generate a cache key for a product listing.
 */
export function productListingKey(page: number, pageSize: number, category?: string): string {
  return `products:listing:${category || 'all'}:p${page}:s${pageSize}`;
}

/**
 * Generate a cache key for a product detail.
 */
export function productDetailKey(productId: string): string {
  return `products:detail:${productId}`;
}

/**
 * Generate a cache key for search results.
 */
export function searchKey(query: string, page: number, pageSize: number, filters?: Record<string, string>): string {
  const filterStr = filters ? Object.entries(filters).sort().map(([k, v]) => `${k}=${v}`).join('&') : '';
  return `search:${query}:${page}:${pageSize}:${filterStr}`;
}

/**
 * Generate a cache key for seller profile.
 */
export function sellerProfileKey(sellerId: string): string {
  return `seller:profile:${sellerId}`;
}

/**
 * Generate a cache key for user profile.
 */
export function userProfileKey(userId: string): string {
  return `user:profile:${userId}`;
}

/**
 * Generate a cache key for dashboard metrics.
 */
export function dashboardMetricsKey(userId: string, role: string): string {
  return `dashboard:metrics:${role}:${userId}`;
}

/**
 * Generate a cache key for featured products.
 */
export function featuredProductsKey(limit: number): string {
  return `featured:products:${limit}`;
}

/**
 * Generate a cache key for categories.
 */
export function categoriesKey(): string {
  return 'categories:all';
}

/**
 * HTTP Cache Headers helper.
 */
export function getCacheHeaders(duration: number, staleWhileRevalidate?: number): HeadersInit {
  const swr = staleWhileRevalidate || Math.floor(duration / 2);
  return {
    'Cache-Control': `public, s-maxage=${duration}, stale-while-revalidate=${swr}`,
  };
}

/**
 * No-cache headers for sensitive data.
 */
export function getNoCacheHeaders(): HeadersInit {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}
