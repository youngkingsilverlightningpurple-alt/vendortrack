/**
 * @fileoverview Analytics Service
 *
 * Business logic for marketplace analytics.
 * Delegates to the existing analytics-service module and repository layer.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { PaymentLogger } from '@/lib/payment/errors';
import type {
  SellerRevenueData,
  BuyerSpendingData,
  TopSellerData,
  DailyRevenueData,
  RevenueByCategoryData,
} from '@/types';

export interface MarketplaceStats {
  totalUsers: number;
  totalSellers: number;
  totalApprovedSellers: number;
  totalProducts: number;
  totalActiveProducts: number;
  totalOrders: number;
  totalOrders30d: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
  totalRefundedCents: number;
  revenue30dCents: number;
  commission30dCents: number;
  refundRate30d: number;
  conversionRate: number;
  avgOrderValueCents: number;
  computedAt: string;
}

type RpcResult = { data: Record<string, unknown> | null; error: { message?: string } | null };

class AnalyticsService {
  /** Fetch real-time marketplace metrics from PostgreSQL */
  async fetchMarketplaceStats(): Promise<MarketplaceStats> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_marketplace_stats') as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'marketplace_stats_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }

    const d = data || {};
    return {
      totalUsers: (d.total_users as number) || 0,
      totalSellers: (d.total_sellers as number) || 0,
      totalApprovedSellers: (d.total_approved_sellers as number) || 0,
      totalProducts: (d.total_products as number) || 0,
      totalActiveProducts: (d.total_active_products as number) || 0,
      totalOrders: (d.total_orders as number) || 0,
      totalOrders30d: (d.total_orders_30d as number) || 0,
      totalRevenueCents: (d.total_revenue_cents as number) || 0,
      totalCommissionCents: (d.total_commission_cents as number) || 0,
      totalRefundedCents: (d.total_refunded_cents as number) || 0,
      revenue30dCents: (d.revenue_30d_cents as number) || 0,
      commission30dCents: (d.commission_30d_cents as number) || 0,
      refundRate30d: (d.refund_rate_30d as number) || 0,
      conversionRate: (d.conversion_rate as number) || 0,
      avgOrderValueCents: (d.avg_order_value_cents as number) || 0,
      computedAt: (d.computed_at as string) || new Date().toISOString(),
    };
  }

  /** Fetch seller revenue metrics */
  async fetchSellerRevenue(sellerId: string, startDate?: string, endDate?: string): Promise<SellerRevenueData> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_seller_revenue', {
      p_seller_id: sellerId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    } as any) as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'seller_revenue_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    return data as unknown as SellerRevenueData;
  }

  /** Fetch buyer spending metrics */
  async fetchBuyerSpending(buyerId: string, startDate?: string, endDate?: string): Promise<BuyerSpendingData> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_buyer_spending', {
      p_buyer_id: buyerId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    } as any) as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'buyer_spending_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    return data as unknown as BuyerSpendingData;
  }

  /** Fetch top sellers leaderboard */
  async fetchTopSellers(limit: number = 10, startDate?: string): Promise<TopSellerData[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_top_sellers', {
      p_limit: limit,
      p_start_date: startDate || null,
    } as any) as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'top_sellers_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    return (data || []) as unknown as TopSellerData[];
  }

  /** Fetch daily revenue for charts */
  async fetchDailyRevenue(days: number = 30): Promise<DailyRevenueData[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_daily_revenue', { p_days: days } as any) as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'daily_revenue_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    return (data || []) as unknown as DailyRevenueData[];
  }

  /** Fetch revenue by category */
  async fetchRevenueByCategory(startDate?: string, endDate?: string): Promise<RevenueByCategoryData[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin as any).rpc('get_revenue_by_category', {
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    } as any) as unknown as RpcResult;

    if (error) {
      PaymentLogger.error('analytics', 'revenue_by_category_failed', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    return (data || []) as unknown as RevenueByCategoryData[];
  }
}

export const analyticsService = new AnalyticsService();
