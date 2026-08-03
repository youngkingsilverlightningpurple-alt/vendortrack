/**
 * @fileoverview VendorTrack Type Definitions
 *
 * REFACTORED: Types are now defined in the domain layer (@/domain).
 * This file re-exports domain types for backward compatibility.
 *
 * NEW CODE should import from @/domain directly.
 * EXISTING CODE that imports from @/types will continue to work.
 *
 * MIGRATION GUIDE:
 *   - Replace `import type { X } from '@/types'` with `import type { X } from '@/domain'`
 *   - The @/types import will be deprecated in a future version
 */

// Re-export all domain types
export type {
  UserRole,
  SellerStatus,
  ProductStatus,
  OrderStatus,
  RefundStatus,
  PaymentSessionStatus,
  UserProfile,
  Product,
  Order,
  CartItem,
  CombinedCartItem,
  Message,
  Conversation,
  Review,
  PaymentSession,
  SessionItem,
  AuditLog,
  ProfileRow,
  ProductRow,
  OrderRow,
  CartItemRow,
  ReviewRow,
  ConversationRow,
  MessageRow,
  PaymentSessionRow,
  AuditLogRow,
  BadgeVariant,
} from '@/domain';

// Re-export domain functions
export {
  profileRowToDomain,
  productRowToDomain,
  orderRowToDomain,
  cartItemRowToDomain,
  reviewRowToDomain,
  messageRowToDomain,
  conversationRowToDomain,
  paymentSessionRowToDomain,
  calculateCommission,
  calculateSellerTransfer,
  isProductAvailable,
  isSessionExpired,
  generateTraceId,
  getOrderStatusVariant,
  getRefundStatusVariant,
  ORDER_STATUS_VARIANT,
  REFUND_STATUS_VARIANT,
  COMMISSION_RATE,
  SESSION_EXPIRY_MINUTES,
  MIN_ORDER_AMOUNT_CENTS,
  SUPPORTED_CURRENCIES,
} from '@/domain';

// Re-export error utilities
export { getErrorMessage } from '@/lib/errors';
export type { PrimitiveValue, ErrorContext } from '@/lib/errors';

// ============================================================
// PAYMENT-RELATED TYPES (kept here for backward compatibility)
// ============================================================

import type { PrimitiveValue } from '@/lib/errors';

/** Data payload for PaymentLogger methods */
export type LogData = Record<string, PrimitiveValue>;

/** Metadata for financial ledger entries */
export type LedgerMetadata = Record<string, PrimitiveValue>;

/** Payload for payment job queue items */
export type PaymentPayload = Record<string, PrimitiveValue>;

/** Audit log details (replaces Record<string, any> in auth.ts) */
export type AuditLogDetails = Record<string, PrimitiveValue>;

/** Seller profile data from Supabase join */
export interface SellerProfile {
  stripe_account_id?: string;
  stripe_connected?: boolean;
  seller_status?: string;
}

/** Search product result from RPC */
export interface SearchProductResult {
  id: string;
  title: string;
  price_cents: number;
  image_url?: string;
  category?: string;
  status: string;
  rank?: number;
}

/** Cache hit rate metric row from v_cache_hit_rate view */
export interface CacheHitRateRow {
  metric: string;
  percentage: number;
}

/** Table stats metric row from v_table_stats view */
export interface TableStatsRow {
  table_name: string;
  row_count: number;
  dead_rows: number;
  bloat_percentage: string;
  last_vacuum?: string | null;
  last_autovacuum?: string | null;
  last_analyze?: string | null;
  last_autoanalyze?: string | null;
}

/** Index usage metric row from v_index_usage view */
export interface IndexUsageRow {
  table_name: string;
  index_name: string;
  index_scans: number;
  index_size: string;
  usage_status: string;
}

/** Reconciliation order data shape */
export interface ReconciliationOrder {
  id: string;
  payment_intent_id: string;
  amount_total_cents: number;
  commission_cents: number;
  status: string;
  refund_status: string;
  trace_id: string;
  created_at: string;
}

/** Seller revenue data from RPC */
export interface SellerRevenueData {
  total_revenue_cents: number;
  total_orders: number;
  period_start?: string;
  period_end?: string;
  [key: string]: PrimitiveValue;
}

/** Buyer spending data from RPC */
export interface BuyerSpendingData {
  total_spending_cents: number;
  total_orders: number;
  period_start?: string;
  period_end?: string;
  [key: string]: PrimitiveValue;
}

/** Top seller data from RPC */
export interface TopSellerData {
  seller_id: string;
  store_name: string;
  total_revenue_cents: number;
  total_orders: number;
  [key: string]: PrimitiveValue;
}

/** Daily revenue data from RPC */
export interface DailyRevenueData {
  date: string;
  revenue_cents: number;
  order_count: number;
  [key: string]: PrimitiveValue;
}

/** Revenue by category data from RPC */
export interface RevenueByCategoryData {
  category: string;
  revenue_cents: number;
  order_count: number;
  [key: string]: PrimitiveValue;
}

/** Checkout item from request body */
export interface CheckoutItem {
  productId: string;
  quantity: number;
}
