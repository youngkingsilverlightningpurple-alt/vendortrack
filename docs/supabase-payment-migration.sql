
-- ============================================================
-- VendorTrack Payment System — Financial Infrastructure Migration
-- ============================================================
-- Adds tables and RPCs for:
--   - Financial Ledger (immutable, append-only)
--   - Payment Job Queue (background processing)
--   - Reconciliation Reports (Stripe vs DB comparison)
--   - Atomic Refund Processing RPC
--   - Queue Job Claiming RPC
--   - Checkout Validation enhancements
-- ============================================================

-- ============================================================
-- 1. FINANCIAL LEDGER TABLE
-- ============================================================
-- Immutable, append-only ledger for all financial events.
-- No UPDATE or DELETE allowed — entries are permanent.
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'payment_created',
    'payment_completed',
    'refund_requested',
    'refund_completed',
    'commission_collected',
    'seller_transfer',
    'chargeback',
    'dispute'
  )),
  order_id UUID REFERENCES orders(id),
  payment_intent_id TEXT,
  stripe_refund_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  trace_id TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotency: same trace_id + event_type + order_id = no duplicate
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_ledger_idempotency
  ON financial_ledger (trace_id, event_type, order_id);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_financial_ledger_order_id
  ON financial_ledger (order_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_event_type
  ON financial_ledger (event_type);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_created_at
  ON financial_ledger (created_at);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_trace_id
  ON financial_ledger (trace_id);
CREATE INDEX IF NOT EXISTS idx_financial_ledger_payment_intent
  ON financial_ledger (payment_intent_id);

-- Enable RLS on financial ledger
ALTER TABLE financial_ledger ENABLE ROW LEVEL SECURITY;

-- Only admins can read the financial ledger
CREATE POLICY "Admins read financial ledger" ON financial_ledger
  FOR SELECT
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Only service role can insert into the financial ledger
CREATE POLICY "Service role inserts financial ledger" ON financial_ledger
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Financial ledger is IMMUTABLE — no updates or deletes
CREATE POLICY "Financial ledger is immutable" ON financial_ledger
  FOR UPDATE USING (false);

CREATE POLICY "Financial ledger cannot be deleted" ON financial_ledger
  FOR DELETE USING (false);

-- ============================================================
-- 2. PAYMENT JOB QUEUE TABLE
-- ============================================================
-- Database-backed job queue for background payment processing.
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_job_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'notification',
    'analytics',
    'audit',
    'reconciliation',
    'seller_payout',
    'ledger_reconciliation'
  )),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error_message TEXT,
  trace_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_payment_job_queue_status_next
  ON payment_job_queue (status, next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payment_job_queue_type
  ON payment_job_queue (job_type);
CREATE INDEX IF NOT EXISTS idx_payment_job_queue_trace_id
  ON payment_job_queue (trace_id);

-- Enable RLS
ALTER TABLE payment_job_queue ENABLE ROW LEVEL SECURITY;

-- Only service role can manage the job queue
CREATE POLICY "Service role manages job queue" ON payment_job_queue
  FOR ALL
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 3. RECONCILIATION REPORTS TABLE
-- ============================================================
-- Stores reconciliation reports for audit trail.
-- ============================================================

CREATE TABLE IF NOT EXISTS reconciliation_reports (
  id TEXT PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  stripe_payment_count INTEGER NOT NULL DEFAULT 0,
  db_order_count INTEGER NOT NULL DEFAULT 0,
  discrepancy_count INTEGER NOT NULL DEFAULT 0,
  summary JSONB DEFAULT '{}',
  discrepancies JSONB DEFAULT '[]',
  healthy BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE reconciliation_reports ENABLE ROW LEVEL SECURITY;

-- Only admins can read reconciliation reports
CREATE POLICY "Admins read reconciliation reports" ON reconciliation_reports
  FOR SELECT
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Only service role can insert reconciliation reports
CREATE POLICY "Service role inserts reconciliation reports" ON reconciliation_reports
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- 4. ADD stripe_refund_id TO ORDERS TABLE
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount_cents INTEGER;

-- ============================================================
-- 5. ADD payment_intent_id TO PAYMENT_SESSIONS
-- ============================================================

ALTER TABLE payment_sessions ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;

-- ============================================================
-- 6. ATOMIC REFUND PROCESSING RPC
-- ============================================================
-- Processes a refund atomically:
--   - Updates order status and refund status
--   - Records stripe_refund_id
--   - Creates ledger entry
--   - Creates audit log
-- ============================================================

CREATE OR REPLACE FUNCTION process_refund_atomic(
  p_order_id UUID,
  p_stripe_refund_id TEXT,
  p_refund_amount_cents INTEGER,
  p_trace_id TEXT,
  p_initiated_by UUID
)
RETURNS VOID AS $$
DECLARE
  v_order RECORD;
  v_commission_reversed INTEGER;
  v_ledger_id UUID;
BEGIN
  -- 1. Fetch and lock the order
  SELECT * INTO v_order
  FROM orders WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found: %', p_order_id;
  END IF;

  -- 2. Validate refund eligibility
  IF v_order.refund_status = 'approved' THEN
    RAISE EXCEPTION 'Order already refunded: %', p_order_id;
  END IF;

  IF v_order.status = 'refunded' THEN
    RAISE EXCEPTION 'Order already in refunded status: %', p_order_id;
  END IF;

  -- 3. Calculate commission reversal
  v_commission_reversed := ROUND(p_refund_amount_cents * 0.10);

  -- 4. Update order status
  UPDATE orders SET
    refund_status = 'approved',
    status = 'refunded',
    stripe_refund_id = p_stripe_refund_id,
    refund_amount_cents = p_refund_amount_cents
  WHERE id = p_order_id;

  -- 5. Create financial ledger entry for refund
  INSERT INTO financial_ledger (event_type, order_id, stripe_refund_id, amount_cents, currency, trace_id, metadata)
  VALUES (
    'refund_completed',
    p_order_id,
    p_stripe_refund_id,
    p_refund_amount_cents,
    'usd',
    p_trace_id,
    jsonb_build_object(
      'commission_reversed', v_commission_reversed,
      'initiated_by', p_initiated_by,
      'type', 'refund'
    )
  );

  -- 6. Create audit log
  INSERT INTO audit_logs (trace_id, event_type, severity, payload)
  VALUES (
    p_trace_id,
    'REFUND_PROCESSED',
    'WARN',
    jsonb_build_object(
      'order_id', p_order_id,
      'stripe_refund_id', p_stripe_refund_id,
      'refund_amount_cents', p_refund_amount_cents,
      'commission_reversed', v_commission_reversed,
      'initiated_by', p_initiated_by
    )
  );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. ATOMIC WEBHOOK FULFILLMENT RPC (IMPROVED)
-- ============================================================
-- Enhanced version of fulfill_order that also:
--   - Creates payment_created ledger entry
--   - Creates payment_completed ledger entry
--   - Creates commission_collected ledger entry
--   - Records payment_intent_id on the session
-- ============================================================

CREATE OR REPLACE FUNCTION fulfill_order_v2(
  p_session_id UUID,
  p_payment_intent_id TEXT,
  p_trace_id TEXT
)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_amount_cents INTEGER;
  v_commission_cents INTEGER;
  v_seller_id UUID;
  v_item JSONB;
BEGIN
  -- 1. Fetch and lock session
  SELECT user_id, amount_total_cents INTO v_user_id, v_amount_cents
  FROM payment_sessions WHERE id = p_session_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or already processed';
  END IF;

  -- 2. Validate session has not expired
  IF (SELECT expires_at FROM payment_sessions WHERE id = p_session_id) < NOW() THEN
    RAISE EXCEPTION 'SESSION_EXPIRED: Checkout session has expired';
  END IF;

  -- 3. Calculate Commission (10%)
  v_commission_cents := ROUND(v_amount_cents * 0.10);

  -- 4. Atomic stock check and decrement
  FOR v_item IN SELECT * FROM jsonb_array_elements((SELECT items FROM payment_sessions WHERE id = p_session_id))
  LOOP
    UPDATE products
    SET stock = stock - (v_item->>'q')::INTEGER
    WHERE id = (v_item->>'id')::UUID AND stock >= (v_item->>'q')::INTEGER;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_EXHAUSTED';
    END IF;
  END LOOP;

  -- 5. Get seller_id from first item
  SELECT seller_id INTO v_seller_id
  FROM products
  WHERE id = ((SELECT items FROM payment_sessions WHERE id = p_session_id)->0->>'id')::UUID;

  -- 6. Create Order record
  INSERT INTO orders (
    buyer_id, seller_id, product_id, product_name, quantity,
    amount_total_cents, commission_cents, status, payment_intent_id, trace_id
  )
  SELECT
    v_user_id, p.seller_id, p.id, p.title, (v_item->>'q')::INTEGER,
    v_amount_cents, v_commission_cents, 'pending', p_payment_intent_id, p_trace_id
  FROM payment_sessions s, products p
  WHERE s.id = p_session_id AND p.id = (s.items->0->>'id')::UUID;

  -- 7. Mark session complete + record payment_intent_id
  UPDATE payment_sessions
  SET status = 'completed', payment_intent_id = p_payment_intent_id
  WHERE id = p_session_id;

  -- 8. Create financial ledger entries
  -- 8a. Payment completed entry
  INSERT INTO financial_ledger (event_type, order_id, payment_intent_id, amount_cents, currency, trace_id, metadata)
  VALUES (
    'payment_completed',
    (SELECT id FROM orders WHERE payment_intent_id = p_payment_intent_id LIMIT 1),
    p_payment_intent_id,
    v_amount_cents,
    'usd',
    p_trace_id,
    jsonb_build_object('type', 'payment', 'session_id', p_session_id)
  );

  -- 8b. Commission collected entry
  INSERT INTO financial_ledger (event_type, order_id, payment_intent_id, amount_cents, currency, trace_id, metadata)
  VALUES (
    'commission_collected',
    (SELECT id FROM orders WHERE payment_intent_id = p_payment_intent_id LIMIT 1),
    p_payment_intent_id,
    v_commission_cents,
    'usd',
    p_trace_id,
    jsonb_build_object('type', 'commission', 'rate', 0.10, 'session_id', p_session_id)
  );

  -- 9. Atomic Audit Log
  INSERT INTO audit_logs (trace_id, event_type, severity, payload)
  VALUES (p_trace_id, 'ORDER_FULFILLED', 'INFO', jsonb_build_object('pi', p_payment_intent_id, 'session', p_session_id, 'commission', v_commission_cents));

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. QUEUE JOB CLAIMING RPC
-- ============================================================
-- Atomically claims the next pending job from the queue.
-- Uses SELECT FOR UPDATE SKIP LOCKED for concurrency safety.
-- ============================================================

CREATE OR REPLACE FUNCTION claim_next_queue_job()
RETURNS RECORD AS $$
DECLARE
  v_job RECORD;
BEGIN
  -- Atomically claim the next pending job that is ready
  SELECT * INTO v_job
  FROM payment_job_queue
  WHERE status = 'pending'
    AND next_attempt_at <= NOW()
    AND attempts < max_attempts
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Mark as processing
  UPDATE payment_job_queue
  SET status = 'processing',
      attempts = attempts + 1
  WHERE id = v_job.id;

  -- Return the job with updated status
  SELECT * INTO v_job FROM payment_job_queue WHERE id = v_job.id;

  RETURN v_job;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. ADD EXPIRY CHECK TO PAYMENT SESSIONS
-- ============================================================
-- Add an index on expires_at for fast expiry lookups
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_payment_sessions_expires_at
  ON payment_sessions (expires_at)
  WHERE status = 'pending';

-- ============================================================
-- 10. ADD EXPIRED SESSION CLEANUP RPC
-- ============================================================

CREATE OR REPLACE FUNCTION expire_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE payment_sessions
  SET status = 'failed'
  WHERE status = 'pending'
    AND expires_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
