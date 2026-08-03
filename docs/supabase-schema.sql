
-- VendorTrack Hardened PostgreSQL Schema
-- Enforces financial integrity and security at the database layer.

-- 1. Tables
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'buyer' CHECK (role IN ('buyer', 'seller')),
  is_admin BOOLEAN DEFAULT FALSE,
  seller_status TEXT DEFAULT 'pending' CHECK (seller_status IN ('pending', 'approved', 'rejected')),
  store_name TEXT,
  store_description TEXT,
  store_logo_url TEXT,
  stripe_account_id TEXT,
  stripe_connected BOOLEAN DEFAULT FALSE,
  referral_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID REFERENCES profiles(id),
  title TEXT NOT NULL,
  category TEXT,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('active', 'draft')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  items JSONB NOT NULL,
  amount_total_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  quantity INTEGER,
  amount_total_cents INTEGER,
  commission_cents INTEGER,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'shipped', 'delivered', 'refunded')),
  refund_status TEXT DEFAULT 'none' CHECK (refund_status IN ('none', 'requested', 'approved', 'rejected')),
  refund_reason TEXT,
  payment_intent_id TEXT UNIQUE,
  trace_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trace_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS processed_events (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Atomic Fulfillment RPC
-- Uses Largest Remainder Method (Hamilton) for deterministic commission distribution.
-- Guarantees: SUM(per-item commission) == ROUND(total * 0.10) — no cent drift.
CREATE OR REPLACE FUNCTION fulfill_order(p_session_id UUID, p_payment_intent_id TEXT, p_trace_id TEXT)
RETURNS VOID AS $$
DECLARE
  v_user_id UUID;
  v_amount_cents INTEGER;
  v_total_commission INTEGER;
  v_item JSONB;
  v_item_cents INTEGER;
  v_item_commission INTEGER;
  v_items_arr JSONB[];
  v_item_amounts INTEGER[];
  v_floored_commissions INTEGER[];
  v_remainders NUMERIC[];
  v_distributed_so_far INTEGER;
  v_remaining_cents INTEGER;
  v_idx INTEGER;
  v_sorted_indices INTEGER[];
  v_i INTEGER;
BEGIN
  -- 1. Fetch and lock session
  SELECT user_id, amount_total_cents INTO v_user_id, v_amount_cents
  FROM payment_sessions WHERE id = p_session_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or already processed';
  END IF;

  -- 2. Calculate TOTAL Commission (10%) — single source of truth
  v_total_commission := ROUND(v_amount_cents * 0.10);

  -- 3. Collect items into arrays for commission distribution
  v_items_arr := ARRAY(SELECT jsonb_array_elements((SELECT items FROM payment_sessions WHERE id = p_session_id)));
  v_item_amounts := ARRAY();
  v_floored_commissions := ARRAY();
  v_remainders := ARRAY();

  FOR v_idx IN 1..array_length(v_items_arr, 1)
  LOOP
    v_item := v_items_arr[v_idx];
    v_item_cents := ((v_item->>'p_cents')::INTEGER) * ((v_item->>'q')::INTEGER);
    v_item_amounts := array_append(v_item_amounts, v_item_cents);
    v_floored_commissions := array_append(v_floored_commissions, FLOOR(v_item_cents * 0.10)::INTEGER);
    v_remainders := array_append(v_remainders, (v_item_cents * 0.10) - FLOOR(v_item_cents * 0.10));
  END LOOP;

  -- 4. Distribute remaining cents using Largest Remainder Method
  v_distributed_so_far := 0;
  FOR v_idx IN 1..array_length(v_floored_commissions, 1)
  LOOP
    v_distributed_so_far := v_distributed_so_far + v_floored_commissions[v_idx];
  END LOOP;
  v_remaining_cents := v_total_commission - v_distributed_so_far;

  -- Sort indices by remainder descending (deterministic tie-break: larger amount first)
  v_sorted_indices := ARRAY(
    SELECT idx FROM generate_series(1, array_length(v_remainders, 1)) AS idx
    ORDER BY v_remainders[idx] DESC, v_item_amounts[idx] DESC
  );

  -- Add 1 cent to items with largest remainders
  FOR v_i IN 1..v_remaining_cents
  LOOP
    v_idx := v_sorted_indices[v_i];
    v_floored_commissions[v_idx] := v_floored_commissions[v_idx] + 1;
  END LOOP;

  -- 5. Atomic stock check, decrement, and order creation for ALL items
  FOR v_idx IN 1..array_length(v_items_arr, 1)
  LOOP
    v_item := v_items_arr[v_idx];
    v_item_cents := v_item_amounts[v_idx];
    v_item_commission := v_floored_commissions[v_idx];

    -- 5a. Check and decrement stock atomically
    UPDATE products 
    SET stock = stock - (v_item->>'q')::INTEGER
    WHERE id = (v_item->>'id')::UUID AND stock >= (v_item->>'q')::INTEGER;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVENTORY_EXHAUSTED';
    END IF;

    -- 5b. Create an order record for EACH cart item with distributed commission
    INSERT INTO orders (
      buyer_id, seller_id, product_id, product_name, quantity, 
      amount_total_cents, commission_cents, status, payment_intent_id, trace_id
    )
    SELECT 
      v_user_id, p.seller_id, p.id, p.title, (v_item->>'q')::INTEGER,
      v_item_cents, v_item_commission, 'pending', p_payment_intent_id, p_trace_id
    FROM products p
    WHERE p.id = (v_item->>'id')::UUID;
  END LOOP;

  -- 6. Mark session complete
  UPDATE payment_sessions SET status = 'completed' WHERE id = p_session_id;

  -- 7. Atomic Audit Log
  INSERT INTO audit_logs (trace_id, event_type, severity, payload)
  VALUES (p_trace_id, 'ORDER_FULFILLED', 'INFO', jsonb_build_object(
    'pi', p_payment_intent_id,
    'session', p_session_id,
    'total_commission', v_total_commission
  ));

END;
$$ LANGUAGE plpgsql;

-- 3. Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- User Profile Policy: Users can't change their role or admin status
CREATE POLICY "Profiles are readable by everyone" ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update non-privileged fields" ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id 
    AND role = (SELECT role FROM profiles WHERE id = auth.uid()) 
    AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Product Policy: Sellers only manage their own
CREATE POLICY "Products are readable by everyone" ON products FOR SELECT USING (true);
CREATE POLICY "Sellers manage own products" ON products FOR ALL
  USING (auth.uid() = seller_id AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'seller');

-- Order Policy: Involvement based
CREATE POLICY "Users see involved orders" ON orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()));
