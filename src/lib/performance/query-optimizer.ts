/**
 * @fileOverview Database Query Optimization Layer
 *
 * Wraps all database operations with:
 *   - Automatic query timing
 *   - Cursor-based pagination (keyset pagination)
 *   - Batch loading (DataLoader pattern)
 *   - N+1 query prevention
 *   - Statement timeout enforcement
 *   - Connection pool monitoring
 *
 * PERFORMANCE TARGETS:
 *   - p95 query latency < 50ms
 *   - p99 query latency < 100ms
 *   - Zero N+1 queries
 *   - Statement timeout at 5s
 *   - Connection pool utilization < 80%
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { performanceMonitor, measureDbLatency } from '@/lib/performance/monitor';
import { cacheService, CACHE_DURATIONS, CACHE_TAGS, categoriesKey } from '@/lib/cache/redis-client';
import { productListingKey, productDetailKey, searchKey, sellerProfileKey, userProfileKey } from '@/lib/cache/redis-client';
import { fromDatabaseError } from '@/lib/errors';
import type { Product, ProductRow, Order, OrderRow, CartItem, CartItemRow } from '@/domain';
import { productRowToDomain, orderRowToDomain, cartItemRowToDomain } from '@/domain';

// ============================================================
// STATEMENT TIMEOUT
// ============================================================

const STATEMENT_TIMEOUT_MS = 5000; // 5 seconds

/**
 * Set statement timeout for the current session.
 * Prevents runaway queries from consuming resources.
 */
export async function setStatementTimeout(timeoutMs: number = STATEMENT_TIMEOUT_MS): Promise<void> {
  const admin = getSupabaseAdmin();
  await (admin as any).rpc('set_statement_timeout', { timeout_ms: timeoutMs }).catch(() => {
    // Graceful fallback — not all environments support this
  });
}

// ============================================================
// CURSOR PAGINATION (Keyset Pagination)
// ============================================================

export interface CursorPageOptions {
  /** Cursor value (created_at timestamp of the last item) */
  cursor?: string;
  /** ID of the last item (for tie-breaking) */
  cursorId?: string;
  /** Page size */
  limit: number;
  /** Sort direction */
  direction?: 'asc' | 'desc';
}

export interface CursorPageResult<T> {
  items: T[];
  /** Cursor for the next page */
  nextCursor: string | null;
  /** ID of the last item for the next cursor */
  nextCursorId: string | null;
  /** Whether there are more results */
  hasMore: boolean;
}

/**
 * Cursor-based pagination for products.
 * Uses keyset pagination (WHERE created_at < cursor) instead of OFFSET.
 * This is O(1) regardless of page depth, unlike OFFSET which is O(n).
 */
export async function getProductsCursorPaginated(
  options: CursorPageOptions & { category?: string; status?: string }
): Promise<CursorPageResult<Product>> {
  return measureDbLatency(async () => {
    const admin = getSupabaseAdmin();
    const { cursor, cursorId, limit, direction = 'desc', category, status = 'active' } = options;

    let query = (admin
      .from('products') as any)
      .select('*')
      .eq('status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: direction === 'asc' })
      .order('id', { ascending: direction === 'asc' })
      .limit(limit + 1); // Fetch one extra to detect hasMore

    if (cursor) {
      // Keyset pagination: WHERE (created_at, id) < (cursor, cursorId)
      if (direction === 'desc') {
        query = query.lt('created_at', cursor);
        if (cursorId) {
          query = query.or(`created_at.lt.${cursor},and(created_at.eq.${cursor},id.lt.${cursorId})`);
        }
      } else {
        query = query.gt('created_at', cursor);
        if (cursorId) {
          query = query.or(`created_at.gt.${cursor},and(created_at.eq.${cursor},id.gt.${cursorId})`);
        }
      }
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) throw fromDatabaseError(error);

    const rows = (data || []) as ProductRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(productRowToDomain);

    const lastItem = items[items.length - 1];
    return {
      items,
      nextCursor: lastItem?.createdAt || null,
      nextCursorId: lastItem?.id || null,
      hasMore,
    };
  }, 'getProductsCursorPaginated');
}

/**
 * Cursor-based pagination for orders.
 */
export async function getOrdersCursorPaginated(
  userId: string,
  role: 'buyer' | 'seller',
  options: CursorPageOptions
): Promise<CursorPageResult<Order>> {
  return measureDbLatency(async () => {
    const admin = getSupabaseAdmin();
    const { cursor, cursorId, limit, direction = 'desc' } = options;

    const filterField = role === 'buyer' ? 'buyer_id' : 'seller_id';

    let query = (admin
      .from('orders') as any)
      .select('*')
      .eq(filterField, userId)
      .order('created_at', { ascending: direction === 'asc' })
      .order('id', { ascending: direction === 'asc' })
      .limit(limit + 1);

    if (cursor) {
      if (direction === 'desc') {
        query = query.lt('created_at', cursor);
      } else {
        query = query.gt('created_at', cursor);
      }
    }

    const { data, error } = await query;

    if (error) throw fromDatabaseError(error);

    const rows = (data || []) as OrderRow[];
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(orderRowToDomain);

    const lastItem = items[items.length - 1];
    return {
      items,
      nextCursor: lastItem?.createdAt || null,
      nextCursorId: lastItem?.id || null,
      hasMore,
    };
  }, 'getOrdersCursorPaginated');
}

// ============================================================
// DATA LOADER (Batch Loading / N+1 Prevention)
// ============================================================

interface DataLoaderOptions {
  maxBatchSize: number;
  maxWaitMs: number;
}

/**
 * DataLoader implementation for batch loading.
 * Collects individual loads within a single tick and dispatches them as a batch.
 * This eliminates N+1 queries.
 */
export class DataLoader<K, V> {
  private batch: Array<{ key: K; resolve: (value: V | null) => void; reject: (error: Error) => void }> = [];
  private batchLoader: (keys: K[]) => Promise<Array<V | null>>;
  private keyExtractor: (value: V) => K;
  private options: DataLoaderOptions;
  private scheduledDispatch: NodeJS.Timeout | null = null;

  constructor(
    batchLoader: (keys: K[]) => Promise<Array<V | null>>,
    keyExtractor: (value: V) => K,
    options?: Partial<DataLoaderOptions>
  ) {
    this.batchLoader = batchLoader;
    this.keyExtractor = keyExtractor;
    this.options = {
      maxBatchSize: options?.maxBatchSize || 50,
      maxWaitMs: options?.maxWaitMs || 10,
    };
  }

  /**
   * Load a single item. Batches with other loads in the same tick.
   */
  load(key: K): Promise<V | null> {
    return new Promise((resolve, reject) => {
      this.batch.push({ key, resolve, reject });

      if (this.batch.length >= this.options.maxBatchSize) {
        this.dispatch();
      } else if (!this.scheduledDispatch) {
        this.scheduledDispatch = setTimeout(() => this.dispatch(), this.options.maxWaitMs);
      }
    });
  }

  /**
   * Load multiple items at once.
   */
  loadMany(keys: K[]): Promise<Array<V | null>> {
    return Promise.all(keys.map((key) => this.load(key)));
  }

  /**
   * Dispatch the current batch.
   */
  private dispatch(): void {
    if (this.scheduledDispatch) {
      clearTimeout(this.scheduledDispatch);
      this.scheduledDispatch = null;
    }

    const batch = this.batch.splice(0);
    if (batch.length === 0) return;

    const keys = batch.map((item) => item.key);

    // Deduplicate keys
    const uniqueKeys = [...new Set(keys)];
    const keyToIndex = new Map(uniqueKeys.map((key, i) => [key, i]));

    this.batchLoader(uniqueKeys)
      .then((results) => {
        for (const item of batch) {
          const index = keyToIndex.get(item.key);
          if (index !== undefined && results[index]) {
            item.resolve(results[index]);
          } else {
            item.resolve(null);
          }
        }
      })
      .catch((error) => {
        for (const item of batch) {
          item.reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
  }
}

// ============================================================
// PRE-CONFIGURED DATA LOADERS
// ============================================================

/**
 * Product DataLoader — batch loads products by ID.
 * Prevents N+1 queries when loading products in lists.
 */
export function createProductLoader(): DataLoader<string, Product> {
  return new DataLoader(
    async (ids: string[]) => {
      return measureDbLatency(async () => {
        const admin = getSupabaseAdmin();
        const { data, error } = await (admin
          .from('products') as any)
          .select('*')
          .in('id', ids);

        if (error) throw fromDatabaseError(error);

        const productMap = new Map<string, Product>();
        for (const row of (data || []) as any[]) {
          const product = productRowToDomain(row as ProductRow);
          productMap.set(product.id, product);
        }

        return ids.map((id) => productMap.get(id) || null);
      }, 'productLoader.batchLoad');
    },
    (product) => product.id,
    { maxBatchSize: 50, maxWaitMs: 10 }
  );
}

/**
 * User Profile DataLoader — batch loads profiles by ID.
 */
export function createUserProfileLoader(): DataLoader<string, Record<string, unknown>> {
  return new DataLoader(
    async (ids: string[]) => {
      return measureDbLatency(async () => {
        const admin = getSupabaseAdmin();
        const { data, error } = await (admin
          .from('profiles') as any)
          .select('*')
          .in('id', ids);

        if (error) throw fromDatabaseError(error);

        const profileMap = new Map<string, Record<string, unknown>>();
        for (const row of (data || []) as any[]) {
          profileMap.set(row.id as string, row as Record<string, unknown>);
        }

        return ids.map((id) => profileMap.get(id) || null);
      }, 'userProfileLoader.batchLoad');
    },
    (profile) => profile.id as string,
    { maxBatchSize: 50, maxWaitMs: 10 }
  );
}

// ============================================================
// CACHE-AWARE QUERY HELPERS
// ============================================================

/**
 * Get a product by ID with cache.
 * Uses the getOrSet pattern to avoid cache stampede.
 */
export async function getCachedProduct(productId: string): Promise<Product | null> {
  return cacheService.getOrSet<Product | null>(
    productDetailKey(productId),
    async () => {
      const admin = getSupabaseAdmin();
      const { data, error } = await (admin
        .from('products') as any)
        .select('*')
        .eq('id', productId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw fromDatabaseError(error);
      }

      return data ? productRowToDomain(data as ProductRow) : null;
    },
    {
      ttlSeconds: CACHE_DURATIONS.PRODUCT_DETAIL,
      tags: [CACHE_TAGS.PRODUCTS, CACHE_TAGS.PRODUCT_DETAIL(productId)],
    }
  );
}

/**
 * Get a seller profile with cache.
 */
export async function getCachedSellerProfile(sellerId: string): Promise<Record<string, unknown> | null> {
  return cacheService.getOrSet<Record<string, unknown> | null>(
    sellerProfileKey(sellerId),
    async () => {
      const admin = getSupabaseAdmin();
      const { data, error } = await (admin
        .from('profiles') as any)
        .select('*')
        .eq('id', sellerId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw fromDatabaseError(error);
      }

      return data ? (data as Record<string, unknown>) : null;
    },
    {
      ttlSeconds: CACHE_DURATIONS.SELLER_PROFILE,
      tags: [CACHE_TAGS.SELLER_PROFILE(sellerId)],
    }
  );
}

/**
 * Get user profile with cache.
 */
export async function getCachedUserProfile(userId: string): Promise<Record<string, unknown> | null> {
  return cacheService.getOrSet<Record<string, unknown> | null>(
    userProfileKey(userId),
    async () => {
      const admin = getSupabaseAdmin();
      const { data, error } = await (admin
        .from('profiles') as any)
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw fromDatabaseError(error);
      }

      return data ? (data as Record<string, unknown>) : null;
    },
    {
      ttlSeconds: CACHE_DURATIONS.USER_PROFILE,
      tags: [CACHE_TAGS.USER_PROFILE(userId)],
    }
  );
}

/**
 * Get featured products with cache.
 */
export async function getCachedFeaturedProducts(limit: number = 12): Promise<Product[]> {
  return cacheService.getOrSet<Product[]>(
    productListingKey(0, limit, 'featured'),
    async () => {
      return measureDbLatency(async () => {
        const admin = getSupabaseAdmin();
        const { data, error } = await (admin
          .from('products') as any)
          .select('*')
          .eq('status', 'active')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (error) throw fromDatabaseError(error);
        return ((data || []) as any[]).map((row: any) => productRowToDomain(row as ProductRow));
      }, 'getCachedFeaturedProducts');
    },
    {
      ttlSeconds: CACHE_DURATIONS.FEATURED_PRODUCTS,
      tags: [CACHE_TAGS.PRODUCTS, CACHE_TAGS.FEATURED],
    }
  );
}

/**
 * Get categories with cache.
 */
export async function getCachedCategories(): Promise<string[]> {
  return cacheService.getOrSet<string[]>(
    categoriesKey(),
    async () => {
      return measureDbLatency(async () => {
        const admin = getSupabaseAdmin();
        const { data, error } = await (admin
          .from('products') as any)
          .select('category')
          .eq('status', 'active')
          .is('deleted_at', null)
          .not('category', 'is', null);

        if (error) throw fromDatabaseError(error);

        const categories = [...new Set(((data || []) as any[]).map((d: any) => d.category).filter(Boolean))] as string[];
        return categories.sort();
      }, 'getCachedCategories');
    },
    {
      ttlSeconds: CACHE_DURATIONS.CATEGORIES,
      tags: [CACHE_TAGS.CATEGORIES, CACHE_TAGS.PRODUCTS],
    }
  );
}

// ============================================================
// CACHE INVALIDATION HELPERS
// ============================================================

/**
 * Invalidate all product-related caches after a product change.
 */
export async function invalidateProductCaches(productId: string, sellerId?: string): Promise<void> {
  const invalidations = [
    cacheService.delete(productDetailKey(productId)),
    cacheService.invalidateTag(CACHE_TAGS.PRODUCTS),
    cacheService.invalidateTag(CACHE_TAGS.FEATURED),
    cacheService.invalidateTag(CACHE_TAGS.HOME_PAGE),
    cacheService.invalidateTag(CACHE_TAGS.SEARCH),
  ];

  if (sellerId) {
    invalidations.push(cacheService.invalidateTag(CACHE_TAGS.SELLER_PRODUCTS(sellerId)));
  }

  await Promise.all(invalidations);
}

/**
 * Invalidate all analytics caches after a financial event.
 */
export async function invalidateAnalyticsCaches(): Promise<void> {
  await Promise.all([
    cacheService.invalidateTag(CACHE_TAGS.ANALYTICS),
    cacheService.invalidateTag(CACHE_TAGS.DASHBOARD),
  ]);
}

/**
 * Invalidate user profile cache after a profile change.
 */
export async function invalidateUserProfileCache(userId: string): Promise<void> {
  await cacheService.delete(userProfileKey(userId));
  await cacheService.invalidateTag(CACHE_TAGS.USER_PROFILE(userId));
}

// ============================================================
// CONNECTION POOL MONITORING
// ============================================================

/**
 * Update connection pool stats in the performance monitor.
 */
export async function updateConnectionPoolStats(): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await (admin as any).rpc('get_connection_stats').catch(() => ({ data: null }));

    if (data) {
      performanceMonitor.setGauge('db.active_connections', data.active || 0);
    }
  } catch {
    // Monitoring must never break the application
  }
}

/**
 * Update cache stats in the performance monitor.
 */
export function updateCacheStats(): void {
  const stats = cacheService.getStats();
  performanceMonitor.setGauge('cache.hit_rate', stats.hitRate);
  performanceMonitor.setGauge('cache.key_count', stats.keyCount);
  performanceMonitor.setGauge('cache.memory_bytes', stats.memoryUsageBytes);
}

/**
 * Update queue stats in the performance monitor.
 */
export async function updateQueueStats(): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await (admin
      .from('payment_job_queue') as any)
      .select('status')
      .in('status', ['pending', 'processing', 'dead']);

    const counts = { pending: 0, processing: 0, dead: 0 };
    for (const row of (data || []) as any[]) {
      const status = row.status as string;
      if (status in counts) {
        (counts as Record<string, number>)[status]!++;
      }
    }

    performanceMonitor.setGauge('queue.pending', counts.pending);
    performanceMonitor.setGauge('queue.processing', counts.processing);
    performanceMonitor.setGauge('queue.dead', counts.dead);
  } catch {
    // Monitoring must never break the application
  }
}
