/**
 * @fileOverview Cache Layer — Unified Export
 *
 * Re-exports the cache service and provides cache-aware wrappers
 * for repository and service methods.
 */

export {
  cacheService,
  CACHE_DURATIONS,
  CACHE_TAGS,
  productListingKey,
  productDetailKey,
  searchKey,
  sellerProfileKey,
  userProfileKey,
  dashboardMetricsKey,
  featuredProductsKey,
  categoriesKey,
  getCacheHeaders,
  getNoCacheHeaders,
  type CacheSetOptions,
  type CacheStats,
} from './redis-client';

/**
 * Cache-aware wrapper for the unstable_cache API from Next.js.
 * This provides SSR-level caching with tag-based invalidation.
 */
import { unstable_cache } from 'next/cache';
import { CACHE_DURATIONS, CACHE_TAGS } from './redis-client';
import type { MarketplaceStats } from '@/services/analytics-service';
import type { TopSellerData, DailyRevenueData } from '@/types';

/**
 * Cached marketplace stats fetcher.
 * Uses Next.js cache() with tag-based invalidation.
 */
export const getCachedMarketplaceStats = unstable_cache(
  async () => {
    const { analyticsService } = await import('@/services/analytics-service');
    return analyticsService.fetchMarketplaceStats();
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
    const { analyticsService } = await import('@/services/analytics-service');
    return analyticsService.fetchTopSellers(limit);
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
    const { analyticsService } = await import('@/services/analytics-service');
    return analyticsService.fetchDailyRevenue(days);
  },
  ['daily-revenue'],
  {
    revalidate: CACHE_DURATIONS.DAILY_REVENUE,
    tags: [CACHE_TAGS.ANALYTICS],
  }
);
