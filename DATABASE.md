# DATABASE.md — VendorTrack Enterprise Database Architecture

> **Phase 5: Database Architecture Redesign**
> Previous Phases: Secret Management, RBAC, Payment Hardening

---

## Table of Contents

1. [Schema Overview](#schema-overview)
2. [ER Diagram](#er-diagram)
3. [Tables](#tables)
4. [Indexes](#indexes)
5. [RPCs (PostgreSQL Functions)](#rpcs)
6. [Materialized Views](#materialized-views)
7. [Performance Strategy](#performance-strategy)
8. [Caching Strategy](#caching-strategy)
9. [Migration Strategy](#migration-strategy)
10. [Backup Strategy](#backup-strategy)
11. [Scaling Recommendations](#scaling-recommendations)
12. [Connection Pooling](#connection-pooling)
13. [Monitoring](#monitoring)

---

## Schema Overview

VendorTrack uses **Supabase (PostgreSQL 15+)** as its sole database. All data access is via the Supabase JS client — no ORM (Prisma, Drizzle, etc.) is used.

**Database statistics:**
- **12 tables** (profiles, products, payment_sessions, orders, audit_logs, processed_events, cart_items, conversations, messages, financial_ledger, payment_job_queue, reconciliation_reports)
- **30+ indexes** (btree, GIN, partial, composite, expression)
- **12+ RPCs** (PostgreSQL functions)
- **2 materialized views** (pre-computed analytics)
- **4 monitoring views** (index usage, table stats, cache hit rate, query performance)
- **30+ RLS policies** (role-based access control)
- **6 triggers** (search vector, updated_at, seller verification)

---

## ER Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        auth.users (Supabase)                     │
│                    id UUID PK ←─────┐                             │
└─────────────────────────────────────┼────────────────────────────┘
                                      │ 1:1
                                      ▼
┌──────────────────────────────────────────────────────────────────┐
│                           profiles                                │
│  id UUID PK → auth.users                                          │
│  email TEXT UNIQUE                                                 │
│  full_name TEXT                                                    │
│  role TEXT CHECK(buyer,seller,admin,super_admin)                  │
│  is_admin BOOLEAN                                                  │
│  seller_status TEXT CHECK(pending,approved,rejected)              │
│  store_name TEXT                                                   │
│  store_description TEXT                                            │
│  store_logo_url TEXT                                               │
│  stripe_account_id TEXT                                            │
│  stripe_connected BOOLEAN                                          │
│  referral_code TEXT UNIQUE                                         │
│  created_at TIMESTAMPTZ                                            │
└────────┬──────────────────────┬──────────────────────┬───────────┘
         │ 1:N                  │ 1:N                  │ 1:N
         ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────────┐
│   products       │  │    orders        │  │   payment_sessions       │
│ id UUID PK       │  │ id UUID PK       │  │ id UUID PK               │
│ seller_id → prof │  │ buyer_id → prof  │  │ user_id → profiles       │
│ title TEXT       │  │ seller_id → prof │  │ items JSONB               │
│ category TEXT    │  │ product_id → prod│  │ amount_total_cents INT    │
│ description TEXT │  │ product_name TEXT│  │ status TEXT               │
│ price_cents INT  │  │ quantity INT      │  │ expires_at TIMESTAMPTZ   │
│ stock INT        │  │ amount_total INT  │  │ payment_intent_id TEXT   │
│ image_url TEXT   │  │ commission_cents  │  │ created_at TIMESTAMPTZ   │
│ status TEXT       │  │ status TEXT       │  └──────────────────────────┘
│ search_vector TS │  │ refund_status TEXT│
│ created_at TSTZ  │  │ refund_reason TEXT│  ┌──────────────────────────┐
│ updated_at TSTZ  │  │ payment_intent_id │  │   financial_ledger       │
│ deleted_at TSTZ  │  │ trace_id TEXT      │  │ id UUID PK               │
└──────────────────┘  │ stripe_refund_id   │  │ event_type TEXT CHECK    │
                      │ refund_amount_cents│  │ order_id → orders        │
┌──────────────────┐  │ created_at TSTZ    │  │ payment_intent_id TEXT   │
│  cart_items       │  │ updated_at TSTZ    │  │ stripe_refund_id TEXT   │
│ id UUID PK       │  └────────────────────┘  │ amount_cents INT         │
│ user_id → prof   │                          │ currency TEXT             │
│ product_id → prod│  ┌────────────────────┐  │ trace_id TEXT             │
│ quantity INT      │  │   audit_logs        │  │ metadata JSONB           │
│ created_at TSTZ  │  │ id UUID PK          │  │ created_at TIMESTAMPTZ   │
└──────────────────┘  │ trace_id TEXT        │  └──────────────────────────┘
                      │ event_type TEXT      │
┌──────────────────┐  │ severity TEXT CHECK │  ┌──────────────────────────┐
│ conversations     │  │ payload JSONB       │  │  payment_job_queue       │
│ id UUID PK       │  │ created_at TSTZ     │  │ id UUID PK               │
│ order_id → orders│  └────────────────────┘  │ job_type TEXT CHECK      │
│ buyer_id → prof  │                          │ payload JSONB             │
│ seller_id → prof │  ┌────────────────────┐  │ status TEXT CHECK        │
│ involved_users   │  │  processed_events   │  │ attempts INT              │
│ last_message TEXT│  │ id TEXT PK          │  │ max_attempts INT          │
│ updated_at TSTZ  │  │ created_at TSTZ     │  │ next_attempt_at TSTZ     │
│ last_read_at JSON│  └────────────────────┘  │ error_message TEXT       │
└──────┬───────────┘                          │ trace_id TEXT             │
       │ 1:N                                   │ created_at TSTZ           │
       ▼                                       │ completed_at TSTZ        │
┌──────────────────┐  ┌────────────────────────────┐                    │
│   messages        │  │  reconciliation_reports     │  └──────────────────┘
│ id UUID PK       │  │ id TEXT PK                   │
│ conversation_id  │  │ started_at TSTZ              │
│   → conversations│  │ completed_at TSTZ            │
│ sender_id → prof │  │ status TEXT CHECK            │
│ text TEXT         │  │ stripe_payment_count INT     │
│ created_at TSTZ  │  │ db_order_count INT           │
└──────────────────┘  │ discrepancy_count INT        │
                      │ summary JSONB                │
                      │ discrepancies JSONB          │
                      │ healthy BOOLEAN              │
                      │ created_at TSTZ              │
                      └──────────────────────────────┘
```

---

## Tables

### 1. profiles
User accounts extending Supabase auth.users. Stores role, seller status, and Stripe Connect information.

| Column | Type | Constraints | Index |
|--------|------|-------------|-------|
| id | UUID PK | → auth.users ON DELETE CASCADE | btree (PK) |
| email | TEXT | UNIQUE | btree (UNIQUE) |
| full_name | TEXT | — | — |
| role | TEXT | CHECK IN (buyer,seller,admin,super_admin) | btree, composite(role,created_at) |
| is_admin | BOOLEAN | DEFAULT false | — |
| seller_status | TEXT | CHECK IN (pending,approved,rejected) | partial WHERE role='seller' |
| store_name | TEXT | — | — |
| store_description | TEXT | — | — |
| store_logo_url | TEXT | — | — |
| stripe_account_id | TEXT | — | partial WHERE NOT NULL |
| stripe_connected | BOOLEAN | DEFAULT false | — |
| referral_code | TEXT | UNIQUE | partial WHERE NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | — |

### 2. products
Marketplace product listings with soft-delete and Full Text Search.

| Column | Type | Constraints | Index |
|--------|------|-------------|-------|
| id | UUID PK | DEFAULT gen_random_uuid() | btree (PK) |
| seller_id | UUID | → profiles(id) | btree |
| title | TEXT | NOT NULL | GIN trigram, FTS weight A |
| category | TEXT | — | composite(category,created_at) partial |
| description | TEXT | — | GIN trigram, FTS weight B |
| price_cents | INTEGER | NOT NULL, CHECK > 0 | btree partial |
| stock | INTEGER | NOT NULL, DEFAULT 0, CHECK >= 0 | partial low_stock |
| image_url | TEXT | — | — |
| status | TEXT | CHECK IN (active,draft), DEFAULT 'draft' | btree partial |
| search_vector | TSVECTOR | — | GIN |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | composite partial |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | — |
| deleted_at | TIMESTAMPTZ | — | btree partial WHERE NOT NULL |

### 3. orders
Order records with payment and refund tracking.

| Column | Type | Constraints | Index |
|--------|------|-------------|-------|
| id | UUID PK | DEFAULT gen_random_uuid() | btree (PK) |
| buyer_id | UUID | → profiles(id) ON DELETE CASCADE | composite(buyer_id,created_at) |
| seller_id | UUID | → profiles(id) ON DELETE CASCADE | composite(seller_id,created_at), composite(seller_id,status,created_at) |
| product_id | UUID | → products(id) ON DELETE SET NULL | — |
| product_name | TEXT | — | — |
| quantity | INTEGER | CHECK > 0 | — |
| amount_total_cents | INTEGER | CHECK > 0 | — |
| commission_cents | INTEGER | CHECK >= 0 | — |
| status | TEXT | CHECK IN (pending,shipped,delivered,refunded) | composite(status,created_at) |
| refund_status | TEXT | CHECK IN (none,requested,approved,rejected) | partial WHERE != 'none' |
| refund_reason | TEXT | — | — |
| payment_intent_id | TEXT | UNIQUE | btree partial WHERE NOT NULL |
| trace_id | TEXT | UNIQUE | btree partial WHERE NOT NULL |
| stripe_refund_id | TEXT | — | — |
| refund_amount_cents | INTEGER | — | — |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | btree DESC |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | — |

*(Remaining tables follow similar patterns — see migration SQL for full details)*

---

## Indexes

### Index Strategy

Every index is designed for a specific query pattern. No index exists without a purpose.

| Index | Type | Table | Purpose |
|-------|------|-------|---------|
| idx_profiles_role | btree | profiles | Admin dashboard user filtering |
| idx_profiles_seller_status | partial btree | profiles | Seller approval checks |
| idx_profiles_stripe_account | partial btree | profiles | Checkout Stripe validation |
| idx_profiles_referral_code | partial btree | profiles | Signup referral validation |
| idx_profiles_role_created | composite btree | profiles | Admin listing sorted by date |
| idx_products_seller_id | btree | products | Seller dashboard |
| idx_products_status_active | partial btree | products | Marketplace listing |
| idx_products_category | composite partial btree | products | Category browsing |
| idx_products_price | partial btree | products | Price range filtering |
| idx_products_low_stock | partial btree | products | Inventory alerts |
| idx_products_search_vector | GIN | products | Full Text Search |
| idx_products_title_trgm | GIN trgm | products | Typo-tolerant search |
| idx_products_description_trgm | GIN trgm | products | Description search |
| idx_orders_buyer_id | composite btree | orders | Buyer dashboard |
| idx_orders_seller_id | composite btree | orders | Seller dashboard |
| idx_orders_status | composite btree | orders | Admin dashboard |
| idx_orders_refund_status | partial btree | orders | Refund management |
| idx_orders_created_at | btree DESC | orders | Time-range queries |
| idx_audit_logs_trace_id | btree | audit_logs | Trace correlation |
| idx_audit_logs_event_type | composite btree | audit_logs | Event filtering |
| idx_audit_logs_severity | partial btree | audit_logs | Critical alerts |
| idx_conversations_buyer_id | composite btree | conversations | Buyer chat |
| idx_conversations_seller_id | composite btree | conversations | Seller chat |
| idx_messages_conversation_id | composite btree | messages | Chat message loading |
| idx_cart_items_user_product_unique | unique | cart_items | Duplicate prevention |

**Total: 30+ indexes** (up from ~10 in the original schema)

---

## RPCs

### Search RPCs

| Function | Purpose | Performance |
|----------|---------|-------------|
| `search_products(query, category, min_price, max_price, page, page_size)` | Full Text Search with trigram fallback | O(log n) vs O(n) ILIKE |
| `get_product_count(category, status)` | Fast count for pagination | O(1) |

### Analytics RPCs

| Function | Purpose | Replaces |
|----------|---------|----------|
| `get_marketplace_stats()` | All platform metrics in one call | 6 separate queries + client reduce() |
| `get_seller_revenue(seller_id, start, end)` | Seller dashboard metrics | N+1 queries |
| `get_buyer_spending(buyer_id, start, end)` | Buyer dashboard metrics | N+1 queries |
| `get_top_sellers(limit, start)` | Top sellers leaderboard | Client-side sort |
| `get_daily_revenue(days)` | Revenue chart data | Client-side aggregation |
| `get_revenue_by_category(start, end)` | Category breakdown | Client-side aggregation |

### Dashboard RPCs

| Function | Purpose | Eliminates |
|----------|---------|-----------|
| `get_seller_orders(seller_id, status, limit, offset)` | Seller orders with buyer info | N+1 (order → buyer) |
| `get_buyer_orders(buyer_id, limit, offset)` | Buyer orders | N+1 queries |

### Payment RPCs

| Function | Purpose |
|----------|---------|
| `get_payment_health()` | All payment metrics in one call (replaces 9+ queries) |
| `fulfill_order_v2(session, pi, trace)` | Atomic order fulfillment |
| `process_refund_atomic(order, refund, amount, trace, initiator)` | Atomic refund |
| `claim_next_queue_job()` | Atomic job claiming (SKIP LOCKED) |
| `expire_stale_sessions()` | Expired session cleanup |

### Maintenance RPCs

| Function | Purpose |
|----------|---------|
| `refresh_analytics_views()` | Refresh materialized views |

---

## Materialized Views

| View | Purpose | Refresh Frequency |
|------|---------|-------------------|
| `mv_product_sales_summary` | Product-level sales aggregation | Every 5 minutes |
| `mv_seller_performance` | Seller performance metrics | Every 5 minutes |

---

## Performance Strategy

### Before vs After

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Search query | ILIKE '%keyword%' → Full table scan | FTS + GIN index → O(log n) | **100x** at scale |
| Analytics | 6 queries + client reduce() | 1 RPC call | **6x fewer round-trips** |
| Payment health | 9+ separate queries | 1 RPC call | **9x fewer round-trips** |
| Seller dashboard | N+1 queries (order → buyer) | Single JOIN RPC | **N+1 → 1** |
| Product listing | No index on status + created_at | Partial composite index | **Index-only scan** |
| Category filter | Full table scan | Partial composite index | **Index scan** |
| Cart duplicates | No prevention | Unique constraint | **0 duplicates** |
| Orphan records | No cleanup | Cascade deletes + cleanup | **0 orphans** |
| Stale statistics | Never analyzed | Monitoring + alerts | **Fresh plans** |

### Query Optimization Rules

1. **Never use ILIKE for search** — Use Full Text Search with GIN indexes
2. **Never aggregate on the client** — Use PostgreSQL RPCs
3. **Never use SELECT * in production** — Specify needed columns
4. **Never fetch all rows and filter in JS** — Use database WHERE clauses
5. **Always use pagination** — Never load more than 50 rows at once
6. **Always use JOINs instead of N+1** — Use RPCs with JOINs
7. **Always use indexes for sorting** — Composite indexes covering ORDER BY
8. **Always use partial indexes** — For status/flag columns with low cardinality

---

## Caching Strategy

### Multi-Layer Cache Architecture

```
┌─────────────────────────────────────────────┐
│  Layer 1: Next.js cache()                    │  Server-side request dedup
│  - Marketplace stats: 5 min                  │
│  - Product listings: 5 min                   │
│  - Seller analytics: 3 min                   │
├─────────────────────────────────────────────┤
│  Layer 2: revalidateTag()                    │  Targeted invalidation
│  - On product update → invalidate 'products' │
│  - On order create → invalidate 'analytics'  │
│  - On refund → invalidate 'payment-health'   │
├─────────────────────────────────────────────┤
│  Layer 3: revalidatePath()                   │  Full page invalidation
│  - On profile update → invalidate dashboard  │
│  - On role change → invalidate all           │
├─────────────────────────────────────────────┤
│  Layer 4: HTTP Cache Headers                 │  Client-side caching
│  - Products: s-maxage=300, stale-while-revalidate=150
│  - Analytics: s-maxage=300, stale-while-revalidate=150
│  - Payments: no-store (NEVER cache)          │
├─────────────────────────────────────────────┤
│  Layer 5: In-Memory LRU Cache                │  Hot data (server-side)
│  - Products: 200 entries, 5 min TTL          │
│  - Analytics: 50 entries, 5 min TTL          │
│  - Users: 500 entries, 2 min TTL             │
└─────────────────────────────────────────────┘
```

### What NOT to Cache

- **Payment intent data** — Must always be fresh
- **Order status** — Changes frequently, must be real-time
- **Financial ledger entries** — Immutable but must be real-time
- **Webhook processing results** — Must be real-time
- **Cart items** — Must reflect current state

---

## Migration Strategy

### Production-Safe Migration Rules

1. **All indexes use `IF NOT EXISTS`** — Safe to re-run
2. **All column additions use `IF NOT EXISTS`** — Safe to re-run
3. **New columns have DEFAULT values** — No backfill needed
4. **Constraint changes are validated before enforcement** — No data loss
5. **Foreign key changes use explicit DROP + ADD** — Clear semantics
6. **No destructive operations without backup** — Always backup first

### Migration Order

1. **Extensions** (pg_trgm, unaccent) — No data changes
2. **Schema cleanup** (cascades, constraints) — DDL only
3. **Index creation** — Non-blocking (IF NOT EXISTS)
4. **FTS columns + triggers** — Background population
5. **New RPCs** — No data changes
6. **Materialized views** — Read-only
7. **Monitoring views** — Read-only

### Rollback Plan

Each migration section is independent. If a section fails:
1. Extensions: `DROP EXTENSION IF EXISTS`
2. Schema: Reverse the ALTER TABLE statements
3. Indexes: `DROP INDEX IF EXISTS`
4. FTS: `ALTER TABLE products DROP COLUMN IF EXISTS search_vector`
5. RPCs: `DROP FUNCTION IF EXISTS`
6. Views: `DROP MATERIALIZED VIEW IF EXISTS`

---

## Backup Strategy

### Supabase Built-in Backups

- **Daily automated backups** (Supabase Pro plan)
- **Point-in-time recovery** (PITR) available
- **7-day retention** (Pro plan)

### Recommended Backup Schedule

| Backup Type | Frequency | Retention | Tool |
|-------------|-----------|-----------|------|
| Full database | Daily | 30 days | Supabase automated |
| Financial ledger | Hourly | 90 days | Custom pg_dump |
| Schema only | On migration | Forever | Git (migration files) |
| RLS policies | On change | Forever | Git (migration files) |

### Critical Backup Commands

```bash
# Full database backup
pg_dump "postgresql://..." > backup_$(date +%Y%m%d).sql

# Financial ledger only (for compliance)
pg_dump -t financial_ledger -t audit_logs "postgresql://..." > financial_backup.sql

# Schema only
pg_dump --schema-only "postgresql://..." > schema_backup.sql
```

---

## Scaling Recommendations

### Current Architecture (supports up to 100K users)

- Single Supabase instance
- PostgreSQL 15+ with RLS
- Connection pooling via PgBouncer

### Growth to 1M users

- **Read replicas** for analytics queries
- **Materialized views** for dashboard data
- **Partitioning** on orders table by created_at (monthly)
- **Connection pooler** (PgBouncer in transaction mode)

### Growth to 10M+ users

- **Horizontal sharding** on orders by seller_id
- **Citus** for distributed PostgreSQL
- **Redis** for session caching
- **ClickHouse** for analytics
- **Elasticsearch** for product search

---

## Connection Pooling

### Supabase Configuration

Supabase provides built-in connection pooling via PgBouncer:

| Setting | Recommended Value | Notes |
|---------|-------------------|-------|
| Pooler Mode | Transaction | For serverless/Next.js |
| Pool Size | 15-20 | Per compute instance |
| Max Client Connections | 200 | Total across all clients |
| Connection Timeout | 30s | Prevent hung connections |
| Idle Timeout | 300s | Reclaim idle connections |

### Connection String

```env
# Use port 6543 for pooled connections (all application queries)
DATABASE_URL=postgresql://postgres:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Use port 5432 for direct connections (RPCs needing session features)
DIRECT_URL=postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres
```

---

## Monitoring

### Performance Monitoring Views

| View | Purpose | Query Frequency |
|------|---------|-----------------|
| `v_index_usage` | Detect unused indexes | Daily |
| `v_table_stats` | Table bloat and statistics | Daily |
| `v_cache_hit_rate` | Buffer cache efficiency | Hourly |
| `v_query_performance` | Slow query detection | Hourly |

### Key Metrics to Monitor

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Index cache hit rate | > 99% | 95-99% | < 95% |
| Table cache hit rate | > 99% | 95-99% | < 95% |
| Table bloat | < 10% | 10-20% | > 20% |
| Active connections | < 50% max | 50-80% | > 80% |
| Dead rows | < 5% | 5-10% | > 10% |
| Query time (p95) | < 100ms | 100-500ms | > 500ms |

### Alert Rules

1. **Index cache hit rate < 95%** → Increase shared_buffers or add indexes
2. **Table bloat > 20%** → Run VACUUM ANALYZE
3. **Unused indexes > 10** → Review and drop unused indexes
4. **Stale statistics > 7 days** → Run ANALYZE on affected tables
5. **Connection count > 80%** → Scale up or add connection pooling
