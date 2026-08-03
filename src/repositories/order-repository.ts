/**
 * @fileoverview Optimized Order Repository
 *
 * Performance enhancements:
 *   - Cache-aware queries
 *   - Cursor pagination
 *   - Performance monitoring integration
 *   - Batch loading support
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { Order, OrderRow } from '@/domain';
import { orderRowToDomain } from '@/domain';
import { fromDatabaseError, NotFoundError } from '@/lib/errors';
import { measureDbLatency } from '@/lib/performance/monitor';
import { cacheService, CACHE_DURATIONS, CACHE_TAGS } from '@/lib/cache/redis-client';

class OrderRepository {
  /** Find an order by ID */
  async findById(id: string): Promise<Order | null> {
    return measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const { data, error } = await (admin
        .from('orders') as any)
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw fromDatabaseError(error);
      }
      return data ? orderRowToDomain(data as OrderRow) : null;
    }, 'order.findById');
  }

  /** Find orders by buyer ID with cursor pagination */
  async findByBuyerId(buyerId: string, options?: { page?: number; pageSize?: number; cursor?: string }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const page = options?.page ?? 0;
      const pageSize = options?.pageSize ?? 20;

      let query = (admin
        .from('orders') as any)
        .select('*')
        .eq('buyer_id', buyerId);

      // Cursor pagination — O(1) at any depth
      if (options?.cursor) {
        query = query
          .lt('created_at', options.cursor)
          .order('created_at', { ascending: false })
          .limit(pageSize + 1);
      } else {
        query = query
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize);
      }

      const { data, error } = await query;

      if (error) throw fromDatabaseError(error);

      if (options?.cursor) {
        const hasMore = data ? data.length > pageSize : false;
        const orders = (data || []).slice(0, pageSize).map((row: any) => orderRowToDomain(row as OrderRow));
        return { orders, hasMore };
      }

      const hasMore = data ? data.length > pageSize : false;
      const orders = (data || []).slice(0, pageSize).map((row: any) => orderRowToDomain(row as OrderRow));
      return { orders, hasMore };
    }, 'order.findByBuyerId');
  }

  /** Find orders by seller ID with cursor pagination */
  async findBySellerId(sellerId: string, options?: { page?: number; pageSize?: number; cursor?: string }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const page = options?.page ?? 0;
      const pageSize = options?.pageSize ?? 20;

      let query = (admin
        .from('orders') as any)
        .select('*')
        .eq('seller_id', sellerId);

      if (options?.cursor) {
        query = query
          .lt('created_at', options.cursor)
          .order('created_at', { ascending: false })
          .limit(pageSize + 1);
      } else {
        query = query
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize);
      }

      const { data, error } = await query;

      if (error) throw fromDatabaseError(error);

      const hasMore = data ? data.length > pageSize : false;
      const orders = (data || []).slice(0, pageSize).map((row: any) => orderRowToDomain(row as OrderRow));
      return { orders, hasMore };
    }, 'order.findBySellerId');
  }

  /** Find all orders with pagination */
  async findAll(options?: { page?: number; pageSize?: number }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const page = options?.page ?? 0;
      const pageSize = options?.pageSize ?? 20;

      const { data, error } = await (admin
        .from('orders') as any)
        .select('*')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);

      if (error) throw fromDatabaseError(error);

      const hasMore = data ? data.length > pageSize : false;
      const orders = (data || []).slice(0, pageSize).map((row: any) => orderRowToDomain(row as OrderRow));
      return { orders, hasMore };
    }, 'order.findAll');
  }

  /** Find orders with pending refund requests */
  async findPendingRefunds(options?: { page?: number; pageSize?: number }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const page = options?.page ?? 0;
      const pageSize = options?.pageSize ?? 20;

      const { data, error } = await (admin
        .from('orders') as any)
        .select('*')
        .eq('refund_status', 'requested')
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize);

      if (error) throw fromDatabaseError(error);

      const hasMore = data ? data.length > pageSize : false;
      const orders = (data || []).slice(0, pageSize).map((row: any) => orderRowToDomain(row as OrderRow));
      return { orders, hasMore };
    }, 'order.findPendingRefunds');
  }

  /** Update order status */
  async updateStatus(id: string, data: { status: string; tracking_number?: string; carrier?: string }): Promise<void> {
    await measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const { error } = await (admin
        .from('orders') as any)
        .update(data as any)
        .eq('id', id);

      if (error) throw fromDatabaseError(error);
    }, 'order.updateStatus');

    // Invalidate analytics caches
    await cacheService.invalidateTag(CACHE_TAGS.ANALYTICS);
  }

  /** Update refund status */
  async updateRefundStatus(id: string, refundStatus: string, refundReason?: string): Promise<void> {
    await measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const updateData: Record<string, unknown> = { refund_status: refundStatus };
      if (refundReason !== undefined) {
        updateData.refund_reason = refundReason;
      }
      const { error } = await (admin
        .from('orders') as any)
        .update(updateData as any)
        .eq('id', id);

      if (error) throw fromDatabaseError(error);
    }, 'order.updateRefundStatus');

    // Invalidate analytics caches
    await cacheService.invalidateTag(CACHE_TAGS.ANALYTICS);
  }

  /** Fulfill order via RPC */
  async fulfillOrder(sessionId: string, paymentIntentId: string, traceId: string): Promise<void> {
    await measureDbLatency(async () => {
      const admin = getSupabaseAdmin();
      const { error } = await (admin as any).rpc('fulfill_order', {
        p_session_id: sessionId,
        p_payment_intent_id: paymentIntentId,
        p_trace_id: traceId,
      } as any);

      if (error) {
        if (error.message?.includes('INVENTORY_EXHAUSTED')) {
          throw fromDatabaseError(error);
        }
        throw fromDatabaseError(error);
      }
    }, 'order.fulfillOrder');

    // Invalidate caches
    await cacheService.invalidateTag(CACHE_TAGS.ANALYTICS);
    await cacheService.invalidateTag(CACHE_TAGS.DASHBOARD);
  }
}

export const orderRepository = new OrderRepository();
