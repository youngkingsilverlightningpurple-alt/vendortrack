-- ============================================================
-- VENDORTRACK P0 ORDERS COLUMNS MIGRATION
-- ============================================================
-- Date: 2026-08-20
-- Author: P0 War Room
--
-- P0 FIX: the audit identified that the seller order form's "Shipping
-- Intelligence" panel collects `carrier` + `tracking_number` and calls
-- `supabase.from('orders').update({ tracking_number, carrier })` — but
-- the `orders` table has NO such columns. PostgREST returns HTTP 400
-- ("Column 'tracking_number' could not be found"), which fails the WHOLE
-- UPDATE (including the status change), so sellers can never ship orders.
--
-- This migration adds the missing columns:
--   - tracking_number TEXT (nullable, only set when order is shipped)
--   - carrier TEXT (nullable, only set when order is shipped)
--
-- Also adds `product_image_url` (referenced by orderRowToDomain but missing
-- from schema) so seller-orders columns can display a product thumbnail.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Add tracking_number column to orders
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- ============================================================
-- 2. Add carrier column to orders
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS carrier TEXT;

-- ============================================================
-- 3. Add product_image_url column to orders (for seller-orders thumbnail)
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_image_url TEXT;

-- ============================================================
-- 4. Add refund_reason column if not exists (referenced by code)
-- ============================================================
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- ============================================================
-- 5. Backfill product_image_url from products table for existing orders
-- ============================================================
UPDATE public.orders o
SET product_image_url = p.image_url
FROM public.products p
WHERE o.product_id = p.id
  AND o.product_image_url IS NULL;

COMMIT;

-- ============================================================
-- VERIFICATION
-- ============================================================
-- After running this migration, verify:
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'orders' AND column_name IN
--     ('tracking_number', 'carrier', 'product_image_url', 'refund_reason');
