# VendorTrack — Demo Population Report

**Date:** 2026-08-20
**Branch:** `demo/acquisition-polish`
**Head SHA:** `535c8ca`

---

## Executive Summary

The demo population war room has produced a **canonical, idempotent, production-guarded** demo seed system. The seed script creates 8 auth users, 30 products, 50 orders, ~104 ledger entries, 5 conversations, 30 audit logs, 3 cart items, and 8 payment sessions — all clearly marked as synthetic (TEST_-prefixed Stripe IDs, @demo.vendortrack.app emails, /api/placeholder/ images).

**BLOCKED:** The seed cannot be run in this sandbox (no Supabase credentials). The scripts are code-verified and ready; the operator must configure `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and run `npm run seed:demo` against a real Supabase project.

---

## Demo Data System

### Canonical Seed Script
**File:** `scripts/seed-demo-data.ts` (932 lines)
**Run via:** `npm run seed:demo`

**Creates:**
| Data Type | Count | Notes |
|-----------|-------|-------|
| Auth users | 8 | 1 admin + 4 sellers + 3 buyers. Password: `DemoPass123!` |
| Profiles | 8 | Upserted by ID (idempotent) |
| Products | 30 | 27 active + 3 drafts. 5 per category × 6 categories. SVG placeholder images. |
| Orders | 50 | Spread across 30 days. Mix: 25 delivered, 8 shipped, 5 pending, 4 refunded, 3 refund-requested, 5 extra delivered |
| Financial ledger | ~104 | 2 per order (payment_completed + commission_collected) + 4 refund entries |
| Conversations | 5 | Tied to existing orders. Each with 3-4 messages. |
| Audit logs | 30 | Mix of event types + severities |
| Cart items | 3 | For demo buyer Alex |
| Payment sessions | 8 | Mix of statuses |

### Reset Script
**File:** `scripts/seed-demo-reset.ts` (158 lines)
**Run via:** `npm run seed:reset`

Deletes ALL demo data by markers:
- Auth users with email `*@demo.vendortrack.app`
- Orders/ledger/audit_logs with `trace_id LIKE 'tr_TEST_%'`
- Products with `image_url LIKE '%/api/placeholder/%'`
- Conversations/messages/cart_items/payment_sessions tied to demo users

Real data is untouched. Safe to run multiple times.

### Idempotency
- **Auth users:** created via `auth.admin.createUser` — skipped if already exists (no error)
- **Profiles:** upserted by `id`
- **All other tables:** deleted first by demo markers, then re-inserted
- **Running `npm run seed:demo` twice produces the same dataset** (modulo random date jitter + random Stripe ID suffixes)

### Production Guard
The seed script REFUSES to run if:
- `NODE_ENV === 'production'` AND
- `ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true'`

### Demo Data Markers (for safe identification)
| Marker | Where | Pattern |
|--------|-------|---------|
| Email domain | All demo auth users | `*@demo.vendortrack.app` |
| Stripe account ID | Demo sellers | `acct_TEST_*` |
| Stripe PaymentIntent ID | Demo orders | `pi_TEST_*` |
| Stripe refund ID | Demo refunds | `re_TEST_*` |
| Trace ID | All demo orders + ledger + audit_logs | `tr_TEST_*` |
| Product image URL | All demo products | `/api/placeholder/{category}/{seed}` |

Reconciliation queries can filter out demo data:
```sql
SELECT * FROM orders WHERE trace_id NOT LIKE 'tr_TEST_%';
SELECT * FROM financial_ledger WHERE trace_id NOT LIKE 'tr_TEST_%';
```

---

## Data Integrity Checks (Code-Verified)

| Check | Formula | Status |
|-------|---------|--------|
| Order amount | `price_cents × quantity` | ✅ Correct |
| Commission | `round(amount × 0.10)` | ✅ Correct |
| Ledger payment_completed | `= order.amount_cents` | ✅ Correct |
| Ledger commission_collected | `= order.commission_cents` | ✅ Correct |
| Refund amount | `= order.amount_cents` (full refund) | ✅ Correct |
| Order date spread | `daysAgo(random 1-30, jitter 12h)` | ✅ 30-day spread |
| Demo user count | 1 admin + 4 sellers + 3 buyers = 8 | ✅ Correct |
| Product count | 30 (27 active + 3 drafts) | ✅ Correct |
| Order count | 50 | ✅ Correct |
| Ledger entry count | ~104 | ✅ Correct |

---

## Dashboard Population Status

| Dashboard | Populated? | What It Shows After Seed |
|-----------|------------|-------------------------|
| Admin dashboard | ✅ | Real GMV, platform revenue (10%), active sellers, orders (30d), conversion rate, 14-day revenue chart |
| Admin users | ✅ | All 8 demo users with role/seller-status badges |
| Admin products | ✅ | All 30 products with seller names |
| Admin orders | ✅ | All 50 orders with buyer names resolved via JOIN |
| Admin refunds | ✅ | 3 orders with `refund_status='requested'` |
| Seller dashboard | ✅ | Real earnings, active orders, real fulfillment rate, store products |
| Seller products | ✅ | This seller's products |
| Seller orders | ✅ | This seller's orders with buyer names resolved |
| Seller settings | ✅ | Stripe Connect button (for non-connected seller) OR "Connected" badge |
| Buyer orders | ✅ | This buyer's orders across multiple statuses |
| Buyer cart | ✅ (Alex) | 3 items pre-loaded |
| Store page | ✅ | Real active listings, total orders, fulfillment rate |

---

## Issues Found + Fixed During Population Work

### Pre-fix issues (found by Phase 1 inventory):
1. ✅ Forbidden wording cleaned (8 files) — "Transactional Ledger" → "My Orders", etc.
2. ✅ Hardcoded fake numbers replaced — `+12%` → real order count, `98.2` → real fulfillment rate
3. ✅ `buyer_name` resolution — JOIN `profiles` on `buyer_id` (column didn't exist)
4. ✅ Signup RLS bug — new `setupProfile` server action with service-role client

### Hostile-review issues (found by Phase 15 review):
5. ✅ C1+C2: RLS regression — sellers can't read buyer profiles for JOIN
6. ✅ C3: Admin user-management silently failed RLS — rewired to server actions
7. ✅ C4: Marketplace showed "$NaN" — `price` vs `price_cents` column fix
8. ✅ C5: next/image refused SVG placeholders — added `dangerouslyAllowSVG`
9. ✅ C6: Admin "Add Demo Data" used broken old seed — removed `buyer_name` insert
10. ✅ C7: Seller order form failed — new migration adds `tracking_number`, `carrier`, `product_image_url`, `refund_reason` columns
11. ✅ C8: Seed idempotency broken — backported cleanup logic from reset script

---

## Verification Status

| Aspect | Status | Notes |
|--------|--------|-------|
| Seed script TypeScript | ✅ Compiles | 0 errors |
| Seed script logic | ✅ Code-verified | Math is consistent, idempotency is sound, production guard works |
| Reset script TypeScript | ✅ Compiles | 0 errors |
| Reset script logic | ✅ Code-verified | Identifies demo data by markers, deletes in dependency order |
| **Live seed execution** | ⚠️ BLOCKED | Requires Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) |
| **Live dashboard verification** | ⚠️ BLOCKED | Requires seeded database |

---

## Operator Actions to Live-Verify

1. **Configure Supabase env vars** in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. **Apply all migrations** to your Supabase project (in order):
   - `docs/supabase-schema.sql`
   - `docs/supabase-rls-migration.sql`
   - `docs/supabase-payment-migration.sql`
   - `docs/supabase-database-optimization-migration.sql`
   - `docs/supabase-performance-migration.sql`
   - `docs/supabase-devops-migration.sql`
   - `docs/supabase-p0-rls-remediation-migration.sql` (MUST run late)
   - `docs/supabase-p0-orders-columns-migration.sql` (adds tracking_number etc.)

3. **Run the seed**:
   ```bash
   npm run seed:reset  # Clean slate (deletes any existing demo data)
   npm run seed:demo   # Populate demo data
   ```

4. **Verify**:
   - Log in as `admin@demo.vendortrack.app` (password `DemoPass123!`)
   - Check admin dashboard shows real GMV + revenue chart
   - Log in as `volt@demo.vendortrack.app`
   - Check seller dashboard shows real earnings + fulfillment rate
   - Check seller orders show buyer names (not "Unknown buyer")
   - Log in as `alex@demo.vendortrack.app`
   - Check cart has 3 items
   - Check buyer orders show across multiple statuses

5. **Set `NEXT_PUBLIC_DEMO_MODE=true`** in Vercel env vars to show the demo banner
