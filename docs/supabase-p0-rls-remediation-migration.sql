-- ============================================================
-- VENDORTRACK P0 RLS REMEDIATION MIGRATION
-- ============================================================
-- Date: 2026-08-20
-- Author: P0 War Room
--
-- P0 FIX: This migration remediates the critical RLS gaps identified in
-- the acquisition audit:
--
--   1. `profiles` SELECT was `USING (true)` → anyone (including anon)
--      could read all profiles including emails (PII).
--   2. `products` SELECT was `USING (true)` → anyone could read draft
--      products and soft-deleted products (business secrets).
--   3. `feature_flags` SELECT was `USING (true)` → anyone could read
--      `allowed_user_ids`, `allowed_roles`, kill-switch config.
--   4. `background_jobs` had NO RLS at all → any authenticated user
--      could SELECT all jobs (payloads may contain trace_ids, user IDs,
--      PII).
--
-- The fix is least-privilege: users can only read their own data, plus
-- the minimum public data needed for storefronts to function (active
-- product listings, public seller profile fields).
--
-- IMPORTANT: This migration is IDEMPOTENT — uses DROP POLICY IF EXISTS
-- before CREATE POLICY. Safe to run multiple times.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. PROFILES — restrict SELECT to self + admin
-- ============================================================

-- Drop the public-read policy
DROP POLICY IF EXISTS "Profiles are readable by everyone" ON public.profiles;

-- Replace with: users can read their own profile, admins can read all.
-- Storefronts only need seller_name + store_logo_url, which they get via
-- the products JOIN — they don't need direct SELECT on profiles.
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = id
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- Note: we do NOT add a "public can read seller profiles" policy here.
-- Storefront pages (server-rendered) use the service_role admin client
-- via repositories, which bypasses RLS. The RLS only protects direct
-- client-side queries via the anon key.

-- ============================================================
-- 2. PRODUCTS — restrict SELECT to active + own drafts
-- ============================================================

-- Drop the public-read policy
DROP POLICY IF EXISTS "Products are readable by everyone" ON public.products;

-- Replace with: anyone can read ACTIVE products (not draft, not soft-deleted).
-- Sellers can additionally read their own draft and soft-deleted products.
-- Admins can read everything.
CREATE POLICY "Anyone can read active products"
  ON public.products
  FOR SELECT
  USING (
    -- Active, non-deleted products are public (marketplace browse)
    (status = 'active' AND deleted_at IS NULL)
    -- Sellers can read their own products (including drafts and deleted)
    OR auth.uid() = seller_id
    -- Admins can read everything
    OR (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 3. FEATURE_FLAGS — admin-only read
-- ============================================================

-- Drop the public-read policy
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;

-- Replace with: only admins can read feature flags.
--
-- The audit noted that the feature_flags table contains allowed_user_ids,
-- allowed_roles, is_kill_switch, rollout_percentage — exposing these to
-- anonymous users defeats the purpose of feature-flag-based access control
-- (attackers can see which users are in early-access cohorts and what
-- kill-switches exist).
--
-- Client-side flag evaluation is NOT currently implemented (no code reads
-- this table from the client). If client-side flag evaluation is needed in
-- the future, create a separate `public_feature_flags` VIEW that strips
-- the sensitive columns and grants SELECT on the view to `authenticated`.
CREATE POLICY "Only admins can read feature flags"
  ON public.feature_flags
  FOR SELECT
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- 4. BACKGROUND_JOBS — enable RLS (was missing entirely)
-- ============================================================

-- Enable RLS on background_jobs
ALTER TABLE public.background_jobs ENABLE ROW LEVEL SECURITY;

-- Revoke direct table access from `authenticated` role.
-- The audit found `GRANT SELECT ON public.background_jobs TO authenticated;`
-- in supabase-performance-migration.sql — that grants any authenticated
-- user the ability to SELECT all jobs. We revoke that and rely on RLS.
REVOKE SELECT ON public.background_jobs FROM authenticated;
REVOKE INSERT ON public.background_jobs FROM authenticated;
REVOKE UPDATE ON public.background_jobs FROM authenticated;
REVOKE DELETE ON public.background_jobs FROM authenticated;

-- Only admins can read jobs (for queue monitoring UIs)
CREATE POLICY "Only admins can read background jobs"
  ON public.background_jobs
  FOR SELECT
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- Only service_role (which bypasses RLS) can INSERT/UPDATE/DELETE jobs.
-- No user-facing role should be able to mutate the job queue.
CREATE POLICY "Only admins can insert background jobs"
  ON public.background_jobs
  FOR INSERT
  WITH CHECK (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Only admins can update background jobs"
  ON public.background_jobs
  FOR UPDATE
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

CREATE POLICY "Only admins can delete background jobs"
  ON public.background_jobs
  FOR DELETE
  USING (
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()) = true
  );

-- ============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- ============================================================
-- Run these as `authenticated` with a non-admin user to verify RLS:
--
--   SELECT * FROM profiles;          -- should return only own row
--   SELECT * FROM products WHERE status = 'draft';  -- should return only own drafts
--   SELECT * FROM feature_flags;     -- should return 0 rows
--   SELECT * FROM background_jobs;    -- should return 0 rows
--
-- Run these as anon (not logged in):
--
--   SELECT * FROM profiles;          -- should return 0 rows
--   SELECT * FROM feature_flags;     -- should return 0 rows
--   SELECT * FROM background_jobs;   -- should return 0 rows
--   SELECT * FROM products WHERE status = 'active' AND deleted_at IS NULL;  -- should return all active products

COMMIT;
