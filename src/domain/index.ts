/**
 * @fileoverview Domain Layer — Business Entities & Rules
 *
 * This module defines the pure business domain of VendorTrack.
 * It has ZERO dependencies on external services (Supabase, Stripe, etc.).
 * All domain types are defined here and imported by other layers.
 *
 * ARCHITECTURE RULES:
 *   - Domain types never import from services, repositories, or infrastructure
 *   - Domain types are the source of truth for business entity shapes
 *   - Domain enums constrain valid values across the entire application
 *   - Domain functions contain pure business logic (no I/O)
 */

// ============================================================
// ENUMS — Constrained value sets
// ============================================================

export type UserRole = 'buyer' | 'seller' | 'admin';
export type SellerStatus = 'pending' | 'approved' | 'rejected';
export type ProductStatus = 'active' | 'draft';
export type OrderStatus = 'pending' | 'shipped' | 'delivered' | 'refunded';
export type RefundStatus = 'none' | 'requested' | 'approved' | 'rejected';
export type PaymentSessionStatus = 'pending' | 'completed' | 'failed' | 'expired';
export type ConversationStatus = 'active' | 'closed';

// ============================================================
// DOMAIN ENTITIES — camelCase business objects
// ============================================================

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  sellerStatus?: SellerStatus;
  createdAt: string;
  storeName?: string;
  storeDescription?: string;
  storeLogoUrl?: string;
  stripeAccountId?: string;
  stripeConnected?: boolean;
  referralCode?: string;
  referrerId?: string;
  isDemo?: boolean;
  isAdmin?: boolean;
}

export interface Product {
  id: string;
  sellerId: string;
  title: string;
  category?: string;
  description: string;
  price: number;
  priceCents: number;
  stock: number;
  imageUrl: string;
  status: ProductStatus;
  createdAt: string;
  deletedAt?: string;
}

export interface Order {
  id: string;
  sellerId: string;
  buyerId: string;
  buyerName: string;
  productId: string;
  productName: string;
  productImageUrl?: string;
  quantity: number;
  amount: number;
  amountCents: number;
  commissionCents: number;
  status: OrderStatus;
  refundStatus?: RefundStatus;
  refundReason?: string;
  createdAt: string;
  paymentIntentId: string;
  involvedUsers: string[];
  trackingNumber?: string;
  carrier?: string;
  traceId?: string;
}

export interface CartItem {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
  createdAt: string;
}

export interface CombinedCartItem extends CartItem {
  product: Product | undefined;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  involvedUsers: string[];
  lastMessage: string;
  updatedAt: string;
  lastReadAt?: Record<string, string>;
}

export interface Review {
  id: string;
  productId: string;
  buyerId: string;
  buyerName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface PaymentSession {
  id: string;
  userId: string;
  items: SessionItem[];
  amountTotalCents: number;
  status: PaymentSessionStatus;
  expiresAt: string;
  createdAt: string;
}

export interface SessionItem {
  id: string;
  title: string;
  q: number;
  p_cents: number;
}

export interface AuditLog {
  id: string;
  traceId: string;
  eventType: string;
  severity: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ============================================================
// DATABASE ROW TYPES — Raw Supabase table shapes (snake_case)
// ============================================================

export interface ProfileRow {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  seller_status?: SellerStatus;
  created_at: string;
  store_name?: string;
  store_description?: string;
  store_logo_url?: string;
  stripe_account_id?: string;
  stripe_connected?: boolean;
  referral_code?: string;
  referrer_id?: string;
  is_demo?: boolean;
  is_admin?: boolean;
}

export interface ProductRow {
  id: string;
  seller_id: string;
  title: string;
  category?: string;
  description: string;
  price_cents: number;
  stock: number;
  image_url: string;
  status: ProductStatus;
  created_at: string;
  deleted_at?: string;
}

export interface OrderRow {
  id: string;
  seller_id: string;
  buyer_id: string;
  buyer_name: string;
  product_id: string;
  product_name: string;
  product_image_url?: string;
  quantity: number;
  amount_cents: number;
  commission_cents: number;
  status: OrderStatus;
  refund_status?: RefundStatus;
  refund_reason?: string;
  created_at: string;
  payment_intent_id: string;
  involved_users: string[];
  tracking_number?: string;
  carrier?: string;
  trace_id?: string;
}

export interface CartItemRow {
  id: string;
  user_id: string;
  product_id: string;
  quantity: number;
  created_at: string;
}

export interface ReviewRow {
  id: string;
  product_id: string;
  buyer_id: string;
  buyer_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

export interface ConversationRow {
  id: string;
  order_id: string;
  buyer_id: string;
  seller_id: string;
  involved_users: string[];
  last_message: string;
  updated_at: string;
  last_read_at?: Record<string, string>;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
}

export interface PaymentSessionRow {
  id: string;
  user_id: string;
  items: SessionItem[];
  amount_total_cents: number;
  status: PaymentSessionStatus;
  expires_at: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  trace_id: string;
  event_type: string;
  severity: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// ============================================================
// ROW-TO-DOMAIN MAPPERS — Pure transformations
// ============================================================

export function profileRowToDomain(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    sellerStatus: row.seller_status,
    createdAt: row.created_at,
    storeName: row.store_name,
    storeDescription: row.store_description,
    storeLogoUrl: row.store_logo_url,
    stripeAccountId: row.stripe_account_id,
    stripeConnected: row.stripe_connected,
    referralCode: row.referral_code,
    referrerId: row.referrer_id,
    isDemo: row.is_demo,
    isAdmin: row.is_admin,
  };
}

export function productRowToDomain(row: ProductRow): Product {
  return {
    id: row.id,
    sellerId: row.seller_id,
    title: row.title,
    category: row.category,
    description: row.description,
    price: row.price_cents / 100,
    priceCents: row.price_cents,
    stock: row.stock,
    imageUrl: row.image_url,
    status: row.status,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  };
}

export function orderRowToDomain(row: OrderRow): Order {
  return {
    id: row.id,
    sellerId: row.seller_id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    productId: row.product_id,
    productName: row.product_name,
    productImageUrl: row.product_image_url,
    quantity: row.quantity,
    amount: row.amount_cents / 100,
    amountCents: row.amount_cents,
    commissionCents: row.commission_cents,
    status: row.status,
    refundStatus: row.refund_status,
    refundReason: row.refund_reason,
    createdAt: row.created_at,
    paymentIntentId: row.payment_intent_id,
    involvedUsers: row.involved_users,
    trackingNumber: row.tracking_number,
    carrier: row.carrier,
    traceId: row.trace_id,
  };
}

export function cartItemRowToDomain(row: CartItemRow): CartItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    quantity: row.quantity,
    createdAt: row.created_at,
  };
}

export function reviewRowToDomain(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export function messageRowToDomain(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    text: row.text,
    createdAt: row.created_at,
  };
}

export function conversationRowToDomain(row: ConversationRow): Conversation {
  return {
    id: row.id,
    orderId: row.order_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    involvedUsers: row.involved_users,
    lastMessage: row.last_message,
    updatedAt: row.updated_at,
    lastReadAt: row.last_read_at,
  };
}

export function paymentSessionRowToDomain(row: PaymentSessionRow): PaymentSession {
  return {
    id: row.id,
    userId: row.user_id,
    items: row.items,
    amountTotalCents: row.amount_total_cents,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

// ============================================================
// BUSINESS RULES — Pure domain logic
// ============================================================

/** Commission rate for the platform — re-exported from commission module */
export { COMMISSION_RATE } from './commission';
export { calculateTotalCommission as calculateCommission, calculateSellerTransfer, distributeCommission, calculateRefundCommission, verifyCommissionIntegrity } from './commission';

/** Session expiry in minutes */
export const SESSION_EXPIRY_MINUTES = 30;

/** Minimum order amount in cents */
export const MIN_ORDER_AMOUNT_CENTS = 50;

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ['usd'] as const;

/** Check if a product is available for purchase */
export function isProductAvailable(product: Pick<Product, 'status' | 'deletedAt' | 'stock'>, requestedQty: number): boolean {
  return product.status === 'active' && !product.deletedAt && product.stock >= requestedQty;
}

/** Check if a payment session is expired */
export function isSessionExpired(session: Pick<PaymentSession, 'expiresAt'>): boolean {
  return new Date(session.expiresAt) < new Date();
}

/** Generate a trace ID */
export function generateTraceId(prefix: string = 'tr'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

/** Checkout item DTO */
export interface CheckoutItemDto {
  productId: string;
  quantity: number;
}

/** Badge variant mapping */
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  pending: 'secondary',
  shipped: 'default',
  delivered: 'outline',
  refunded: 'destructive',
} as const;

export const REFUND_STATUS_VARIANT: Record<Exclude<RefundStatus, 'none'>, BadgeVariant> = {
  requested: 'secondary',
  approved: 'default',
  rejected: 'destructive',
} as const;

export function getOrderStatusVariant(status: string): BadgeVariant {
  if (status in ORDER_STATUS_VARIANT) {
    return ORDER_STATUS_VARIANT[status as OrderStatus];
  }
  return 'default';
}

export function getRefundStatusVariant(status: string): BadgeVariant {
  if (status in REFUND_STATUS_VARIANT) {
    return REFUND_STATUS_VARIANT[status as Exclude<RefundStatus, 'none'>];
  }
  return 'default';
}
