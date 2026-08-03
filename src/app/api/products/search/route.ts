/**
 * @fileoverview Product Search API Route — Optimized
 *
 * Performance enhancements:
 *   - Cache-aware search results
 *   - Response compression
 *   - Paginated response format
 *   - Request deduplication
 *   - Performance monitoring
 *   - Search suggestions endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { searchService, getSearchSuggestions } from '@/services/search-service';
import { validateDto, SearchRequestSchema } from '@/dto';
import { toAppError } from '@/lib/errors';
import { sanitizeSearchQuery } from '@/lib/security/sanitize';
import { checkRateLimit, RATE_LIMITS, getClientIdentifier } from '@/lib/security/rate-limit';
import { measureApiLatency } from '@/lib/performance/monitor';
import { paginatedResponse, getCacheHeaders } from '@/lib/performance/middleware';
import { CACHE_DURATIONS } from '@/lib/cache/redis-client';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startTime = performance.now();

  // Rate limiting (public endpoint — use IP)
  const identifier = getClientIdentifier(request);
  const rateLimitResult = checkRateLimit(RATE_LIMITS.SEARCH, identifier);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED', retryAfter: rateLimitResult.retryAfter },
      { status: 429 }
    );
  }

  // Check for suggestions endpoint
  const suggestionPrefix = searchParams.get('suggest');
  if (suggestionPrefix) {
    try {
      const suggestions = await getSearchSuggestions(suggestionPrefix);
      const duration = performance.now() - startTime;
      return NextResponse.json(
        { suggestions },
        {
          headers: {
            'Server-Timing': `search;dur=${duration.toFixed(1)}`,
            'X-Response-Time': `${duration.toFixed(1)}ms`,
            ...getCacheHeaders(CACHE_DURATIONS.SEARCH_SUGGESTIONS),
          },
        }
      );
    } catch (error) {
      const appError = toAppError(error);
      return NextResponse.json(
        { error: appError.clientMessage },
        { status: appError.httpStatus }
      );
    }
  }

  try {
    // Sanitize search query before validation
    const rawQuery = searchParams.get('q') || undefined;
    const sanitizedQuery = rawQuery ? sanitizeSearchQuery(rawQuery) : undefined;

    // Parse and validate search parameters
    const params = validateDto(SearchRequestSchema, {
      q: sanitizedQuery || undefined,
      category: searchParams.get('category') || undefined,
      minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
      maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!) : 0,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 12,
    });

    // Delegate to service
    const result = await searchService.searchProducts({
      ...params,
      page: params.page ?? 0,
      limit: params.limit ?? 12,
    });
    const duration = performance.now() - startTime;

    // Return with performance headers
    return NextResponse.json(
      paginatedResponse(result.products, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        hasMore: result.products.length >= result.pageSize,
      }),
      {
        headers: {
          'Server-Timing': `search;dur=${duration.toFixed(1)}`,
          'X-Response-Time': `${duration.toFixed(1)}ms`,
          ...getCacheHeaders(CACHE_DURATIONS.SEARCH_RESULTS),
        },
      }
    );
  } catch (error: unknown) {
    const appError = toAppError(error);
    return NextResponse.json(
      { error: appError.clientMessage },
      { status: appError.httpStatus }
    );
  }
}
