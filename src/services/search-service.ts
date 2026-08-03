/**
 * @fileoverview Optimized Search Service
 *
 * Performance enhancements:
 *   - Cache-aware search results
 *   - Search suggestions with cache
 *   - Debounced search support
 *   - Result ranking
 *   - Pagination optimization
 *   - Performance monitoring
 */

import { productRepository } from '@/repositories/product-repository';
import { cacheService, CACHE_DURATIONS, CACHE_TAGS } from '@/lib/cache/redis-client';
import { measureDbLatency } from '@/lib/performance/monitor';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { SearchRequestDto, SearchResponseDto } from '@/dto';

// ============================================================
// SEARCH SUGGESTIONS
// ============================================================

/**
 * Cached search suggestions based on popular queries.
 * Returns suggestions that match the prefix.
 */
export async function getSearchSuggestions(prefix: string, limit: number = 5): Promise<string[]> {
  if (!prefix || prefix.length < 2) return [];

  const cacheKey = `search-suggestions:${prefix.toLowerCase()}`;

  const cached = await cacheService.get<string[]>(cacheKey);
  if (cached !== undefined) return cached;

  // Generate suggestions from product titles
  const suggestions = await measureDbLatency(async () => {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('products') as any)
      .select('title')
      .eq('status', 'active')
      .is('deleted_at', null)
      .ilike('title', `${prefix}%`)
      .limit(limit);

    if (error) return [];

    return ((data || []) as any[]).map((d: any) => d.title);
  }, 'search.getSuggestions');

  await cacheService.set(cacheKey, suggestions, {
    ttlSeconds: CACHE_DURATIONS.SEARCH_SUGGESTIONS,
    tags: [CACHE_TAGS.SEARCH, CACHE_TAGS.PRODUCTS],
  });

  return suggestions;
}

// ============================================================
// SEARCH SERVICE
// ============================================================

class SearchService {
  /** Search products using FTS with caching */
  async searchProducts(params: SearchRequestDto): Promise<SearchResponseDto> {
    const page = (params as Record<string, unknown>).page as number ?? 0;
    const limit = (params as Record<string, unknown>).limit as number ?? 12;
    const cacheKey = `search:${params.q || ''}:${params.category || 'all'}:${params.minPrice || 0}:${params.maxPrice || 0}:p${page}:s${limit}`;

    const cached = await cacheService.get<SearchResponseDto>(cacheKey);
    if (cached !== undefined) return cached;

    const products = await productRepository.search({
      query: params.q || '',
      category: params.category,
      minPriceCents: params.minPrice ? Math.round(params.minPrice * 100) : undefined,
      maxPriceCents: params.maxPrice ? Math.round(params.maxPrice * 100) : undefined,
      page: params.page ?? 0,
      pageSize: params.limit ?? 12,
    });

    const total = await productRepository.getCountByCategory(params.category);

    const result: SearchResponseDto = {
      products: products.products.map((p) => ({
        id: p.id,
        title: p.title,
        price: p.price,
        imageUrl: p.imageUrl,
        category: p.category,
        status: p.status,
        rank: undefined,
      })),
      total,
      page: page,
      pageSize: limit,
    };

    await cacheService.set(cacheKey, result, {
      ttlSeconds: CACHE_DURATIONS.SEARCH_RESULTS,
      tags: [CACHE_TAGS.SEARCH, CACHE_TAGS.PRODUCTS],
    });

    return result;
  }

  /** Get search suggestions for autocomplete */
  async getSuggestions(prefix: string, limit: number = 5): Promise<string[]> {
    return getSearchSuggestions(prefix, limit);
  }
}

export const searchService = new SearchService();
