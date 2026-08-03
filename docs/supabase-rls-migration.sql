
-- ============================================================
-- VendorTrack RLS Migration — Enterprise Access Control
-- ============================================================
-- This migration adds Row Level Security to ALL tables that
-- previously lacked it, and improves existing policies.
--
-- OWASP A01:2021 — Broken Access Control
-- Defense-in-depth: Even if the application layer is bypassed,
-- the database enforces access control.
-- ============================================================

-- ============================================================
-- 1. ENABLE RLS ON ALL TABLES THAT LACKED IT
-- ============================================================

ALTER TABLE payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;

-- Create cart_items table if it doesn't exist (with RLS)
CREATE TABLE IF NOT EXISTS cart_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) NOT NULL,
  product_id UUID REFERENCES products(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cart_items ENABLE ROW LEVEL SECURITY;

-- Create conversations table if it doesn't exist (with RLS)
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES orders(id),
  buyer_id UUID REFERENCES profiles(id),
  seller_id UUID REFERENCES profiles(id),
  involved_users UUID[] DEFAULT '{}',
  last_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at JSONB DEFAULT '{}'
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Create messages table if it doesn't exist (with RLS)
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) NOT NULL,
  sender_id UUID REFERENCES profiles(id) NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. UPDATE PROFILES POLICIES
-- ============================================================

-- Drop existing policies to recreate with improvements
DROP POLICY IF EXISTS "Profiles are readable by everyone" ON profiles;
DROP POLICY IF EXISTS "Users can update non-privileged fields" ON profiles;

-- Anyone can read basic profile info (needed for storefronts)
CREATE POLICY "Profiles are readable by everyone" ON profiles
  FOR SELECT USING (true);

-- Users can only update their own non-privileged fields
-- CRITICAL: Cannot change role or is_admin through this policy
CREATE POLICY "Users can update own non-privileged fields" ON profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND is_admin = (SELECT is_admin FROM profiles WHERE id = auth.uid())
  );

-- Only admins can insert/delete profiles (user creation handled by auth trigger)
-- This prevents the purgeAllUsers exploit from RLS
CREATE POLICY "Only admins can delete profiles" ON profiles
  FOR DELETE
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 3. IMPROVE PRODUCTS POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Products are readable by everyone" ON products;
DROP POLICY IF EXISTS "Sellers manage own products" ON products;

-- Anyone can read active products
CREATE POLICY "Products are readable by everyone" ON products
  FOR SELECT USING (true);

-- Sellers can only manage their own products
CREATE POLICY "Sellers manage own products" ON products
  FOR ALL
  USING (
    auth.uid() = seller_id
    AND (SELECT role FROM profiles WHERE id = auth.uid()) = 'seller'
    AND (SELECT seller_status FROM profiles WHERE id = auth.uid()) = 'approved'
  );

-- Admins can manage all products
CREATE POLICY "Admins manage all products" ON products
  FOR ALL
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 4. IMPROVE ORDERS POLICIES
-- ============================================================

DROP POLICY IF EXISTS "Users see involved orders" ON orders;

-- Users can see orders they are involved in (buyer, seller, or admin)
CREATE POLICY "Users see involved orders" ON orders
  FOR SELECT
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Only the seller of an order can update its status (fulfillment)
CREATE POLICY "Sellers update own orders" ON orders
  FOR UPDATE
  USING (
    auth.uid() = seller_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Only the buyer of an order can request a refund
CREATE POLICY "Buyers request refunds" ON orders
  FOR UPDATE
  USING (
    auth.uid() = buyer_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 5. PAYMENT SESSIONS POLICIES (NEW)
-- ============================================================

-- Users can only see their own payment sessions
CREATE POLICY "Users see own payment sessions" ON payment_sessions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Users can create payment sessions for themselves
CREATE POLICY "Users create own payment sessions" ON payment_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only the system (service role) can update payment sessions
-- Regular users cannot change payment session status
CREATE POLICY "Only service role updates payment sessions" ON payment_sessions
  FOR UPDATE
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 6. AUDIT LOGS POLICIES (NEW)
-- ============================================================

-- Only admins can read audit logs
CREATE POLICY "Admins read audit logs" ON audit_logs
  FOR SELECT
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Any authenticated user can insert audit logs (for auth events)
-- But they cannot read or update them
CREATE POLICY "Authenticated users insert audit logs" ON audit_logs
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- No one can update or delete audit logs (immutable)
CREATE POLICY "Audit logs are immutable" ON audit_logs
  FOR UPDATE USING (false);

CREATE POLICY "Audit logs cannot be deleted" ON audit_logs
  FOR DELETE USING (false);

-- ============================================================
-- 7. PROCESSED EVENTS POLICIES (NEW)
-- ============================================================

-- Only service role can read/insert processed events
-- (used by webhook handler)
CREATE POLICY "Service role manages processed events" ON processed_events
  FOR ALL
  USING (
    (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 8. CART ITEMS POLICIES (NEW)
-- ============================================================

-- Users can only see their own cart items
CREATE POLICY "Users see own cart items" ON cart_items
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only create cart items for themselves
CREATE POLICY "Users create own cart items" ON cart_items
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own cart items
CREATE POLICY "Users update own cart items" ON cart_items
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can only delete their own cart items
CREATE POLICY "Users delete own cart items" ON cart_items
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================
-- 9. CONVERSATIONS POLICIES (NEW)
-- ============================================================

-- Users can only see conversations they are involved in
CREATE POLICY "Users see own conversations" ON conversations
  FOR SELECT
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- Users can only create conversations for orders they are involved in
CREATE POLICY "Users create involved conversations" ON conversations
  FOR INSERT
  WITH CHECK (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
  );

-- Users can update conversations they are involved in (for last_read_at)
CREATE POLICY "Users update involved conversations" ON conversations
  FOR UPDATE
  USING (
    auth.uid() = buyer_id
    OR auth.uid() = seller_id
    OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 10. MESSAGES POLICIES (NEW)
-- ============================================================

-- Users can only see messages in conversations they are involved in
CREATE POLICY "Users see messages in own conversations" ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.buyer_id = auth.uid()
        OR c.seller_id = auth.uid()
        OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true
      )
    )
  );

-- Users can only send messages in conversations they are involved in
CREATE POLICY "Users send messages in own conversations" ON messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = messages.conversation_id
      AND (
        c.buyer_id = auth.uid()
        OR c.seller_id = auth.uid()
      )
    )
  );

-- ============================================================
-- 11. ADD ROLE CONSTRAINT FOR FUTURE ROLES
-- ============================================================

-- Update the role constraint to support new roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('buyer', 'seller', 'admin', 'super_admin'));

-- ============================================================
-- 12. ADD SELLER STATUS CHECK TO PRODUCTS
-- ============================================================

-- Add a trigger to prevent unapproved sellers from creating products
CREATE OR REPLACE FUNCTION prevent_unapproved_seller_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.seller_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM profiles
      WHERE id = NEW.seller_id
      AND role = 'seller'
      AND seller_status = 'approved'
    ) THEN
      RAISE EXCEPTION 'Only approved sellers can create products';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS verify_seller_before_insert ON products;
CREATE TRIGGER verify_seller_before_insert
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION prevent_unapproved_seller_insert();
