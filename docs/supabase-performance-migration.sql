/**
 * @fileOverview Performance Optimization Migration
 *
 * Creates:
 *   - background_jobs table for the general-purpose job queue
 *   - Indexes for cursor pagination
 *   - Materialized views for dashboard metrics
 *   - Statement timeout function
 *   - Connection pool monitoring
 *
 * Run: Apply this migration to your Supabase project via SQL Editor
 */

-- ============================================================
-- BACKGROUND JOBS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead', 'scheduled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_at TIMESTAMPTZ,
  trace_id TEXT NOT NULL,
  dedup_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT uq_dedup_key UNIQUE (dedup_key)
);

-- Indexes for background_jobs
CREATE INDEX IF NOT EXISTS idx_background_jobs_status_next_attempt
  ON public.background_jobs (status, next_attempt_at)
  WHERE status IN ('pending', 'scheduled');

CREATE INDEX IF NOT EXISTS idx_background_jobs_type_status
  ON public.background_jobs (job_type, status);

CREATE INDEX IF NOT EXISTS idx_background_jobs_priority_created
  ON public.background_jobs (priority, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_background_jobs_dedup
  ON public.background_jobs (dedup_key)
  WHERE dedup_key IS NOT NULL AND status IN ('pending', 'processing', 'scheduled');

-- ============================================================
-- CURSOR PAGINATION INDEXES
-- ============================================================

-- Composite index for cursor pagination on products
-- Supports: WHERE status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_products_cursor_pagination
  ON public.products (status, deleted_at, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- Composite index for category-filtered cursor pagination
CREATE INDEX IF NOT EXISTS idx_products_category_cursor
  ON public.products (category, status, deleted_at, created_at DESC)
  WHERE deleted_at IS NULL AND status = 'active';

-- Composite index for seller's products cursor pagination
CREATE INDEX IF NOT EXISTS idx_products_seller_cursor
  ON public.products (seller_id, status, deleted_at, created_at DESC)
  WHERE deleted_at IS NULL;

-- Composite index for orders cursor pagination (buyer)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_cursor
  ON public.orders (buyer_id, created_at DESC);

-- Composite index for orders cursor pagination (seller)
CREATE INDEX IF NOT EXISTS idx_orders_seller_cursor
  ON public.orders (seller_id, created_at DESC);

-- ============================================================
-- SEARCH OPTIMIZATION
-- ============================================================

-- GIN index for full-text search on products
CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON public.products USING gin (title gin_trgm_ops);

-- ============================================================
-- STATEMENT TIMEOUT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_statement_timeout(timeout_ms INTEGER)
RETURNS VOID AS $$
BEGIN
  EXECUTE format('SET LOCAL statement_timeout = %L', timeout_ms || 'ms');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- CONNECTION POOL STATS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_connection_stats()
RETURNS TABLE(active INTEGER, idle INTEGER, total INTEGER, max_connections INTEGER) AS $$
SELECT
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'active')::INTEGER AS active,
  (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle')::INTEGER AS idle,
  (SELECT count(*) FROM pg_stat_activity)::INTEGER AS total,
  (SELECT setting::INTEGER FROM pg_settings WHERE name = 'max_connections')::INTEGER AS max_connections;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- PERFORMANCE MONITORING VIEWS
-- ============================================================

-- View: Query performance summary
CREATE OR REPLACE VIEW public.v_query_performance AS
SELECT
  datname AS database,
  num_queries,
  total_time_ms,
  avg_time_ms,
  max_time_ms,
  stddev_time_ms
FROM pg_stat_statements
CROSS JOIN LATERAL (
  SELECT
    calls AS num_queries,
    total_exec_time AS total_time_ms,
    mean_exec_time AS avg_time_ms,
    max_exec_time AS max_time_ms,
    stddev_exec_time AS stddev_time_ms
) stats
LIMIT 1;

-- View: Table bloat estimation
CREATE OR REPLACE VIEW public.v_table_bloat AS
SELECT
  schemaname || '.' || tablename AS table_name,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS total_size,
  n_dead_tup AS dead_rows,
  n_live_tup AS live_rows,
  CASE
    WHEN n_live_tup > 0
    THEN ROUND(100.0 * n_dead_tup / (n_live_tup + n_dead_tup), 2)
    ELSE 0
  END AS bloat_percentage,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- ============================================================
-- MATERIALIZED VIEW FOR DASHBOARD METRICS
-- ============================================================

-- Refresh this periodically (e.g., via cron or background job)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_dashboard_metrics AS
SELECT
  (SELECT count(*) FROM public.profiles) AS total_users,
  (SELECT count(*) FROM public.profiles WHERE role = 'seller') AS total_sellers,
  (SELECT count(*) FROM public.profiles WHERE role = 'seller' AND seller_status = 'approved') AS approved_sellers,
  (SELECT count(*) FROM public.products WHERE status = 'active' AND deleted_at IS NULL) AS active_products,
  (SELECT count(*) FROM public.products WHERE deleted_at IS NULL) AS total_products,
  (SELECT count(*) FROM public.orders) AS total_orders,
  (SELECT COALESCE(SUM(amount_total_cents), 0) FROM public.orders WHERE status = 'delivered') AS total_revenue_cents,
  (SELECT COALESCE(SUM(commission_cents), 0) FROM public.orders WHERE status = 'delivered') AS total_commission_cents,
  NOW() AS computed_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_dashboard_metrics_computed
  ON public.mv_dashboard_metrics (computed_at);

-- ============================================================
-- GRANT PERMISSIONS
-- ============================================================

-- Allow service role to access background_jobs
GRANT ALL ON public.background_jobs TO service_role;
GRANT SELECT ON public.background_jobs TO authenticated;

-- Allow service role to access monitoring views
GRANT SELECT ON public.v_query_performance TO service_role;
GRANT SELECT ON public.v_table_bloat TO service_role;
GRANT SELECT ON public.mv_dashboard_metrics TO service_role;
GRANT SELECT ON public.mv_dashboard_metrics TO authenticated;

-- ============================================================
-- COMMENT
-- ============================================================

COMMENT ON TABLE public.background_jobs IS 'General-purpose background job queue for VendorTrack. Supports priority, deduplication, and scheduled execution.';
COMMENT ON INDEX idx_products_cursor_pagination IS 'Composite index for cursor-based pagination on products. Supports keyset pagination (WHERE created_at < cursor).';
COMMENT ON INDEX idx_orders_buyer_cursor IS 'Composite index for cursor-based pagination on orders by buyer.';
COMMENT ON INDEX idx_orders_seller_cursor IS 'Composite index for cursor-based pagination on orders by seller.';
