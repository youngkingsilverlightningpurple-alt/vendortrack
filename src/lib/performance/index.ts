/**
 * @fileOverview Performance Module — Unified Export
 */

export { performanceMonitor, measureApiLatency, measureDbLatency, startTimer } from './monitor';
export type { PerformanceSnapshot, LatencyHistogram, PerformanceMetric } from './monitor';

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
} from '@/lib/cache/redis-client';

export {
  getCachedProduct,
  getCachedSellerProfile,
  getCachedUserProfile,
  getCachedFeaturedProducts,
  getCachedCategories,
  invalidateProductCaches,
  invalidateAnalyticsCaches,
  invalidateUserProfileCache,
  getProductsCursorPaginated,
  getOrdersCursorPaginated,
  createProductLoader,
  createUserProfileLoader,
  DataLoader,
  setStatementTimeout,
  updateConnectionPoolStats,
  updateCacheStats,
  updateQueueStats,
  type CursorPageOptions,
  type CursorPageResult,
} from './query-optimizer';

export {
  enqueueBackgroundJob,
  enqueueBatchJobs,
  registerJobHandler,
  runBackgroundWorker,
  getBackgroundJobQueueStatus,
  cleanupOldBackgroundJobs,
  retryDeadJobs,
  type JobType,
  type JobPriority,
  type JobStatus,
  type BackgroundJob,
  type EnqueueJobOptions,
  type WorkerConfig,
} from './background-jobs';

export {
  withPerformanceTracking,
  applyCacheHeaders,
  addServerTimingHeader,
  paginatedResponse,
  minimalProductResponse,
  deduplicateRequest,
  getDedupeKey,
} from './middleware';
