# VENDORTRACK DEMO POLISH — BASELINE (FROZEN)

**Frozen at:** 2026-08-20
**Branch:** `demo/acquisition-polish` (off `remediation/p0-acquisition-fixes` @ `5a7435f`)
**Live deployment:** https://vendortrack-lzmt21e5n-falcon-developer-s-projects.vercel.app (HTTP 200, TTFB 1.38s)

## Frozen State

| Item | Value |
|------|-------|
| Base SHA | `5a7435f17d6703eacba3639c7863c462463c4868` |
| Base commit | "chore: normalize file permissions" |
| TypeScript | ✅ Clean (0 errors) |
| Production build | ✅ Succeeds, 31 routes |
| Tests | ✅ 287/287 pass |
| Lint | ⚠️ 1 pre-existing warning (logger.ts `module` variable) |
| Live deployment | HTTP 200, TTFB 1.38s cold |

## P0 Remediation Already Applied (Load-Bearing — Do Not Break)

- ✅ Checkout `order_id: null` (was `''` UUID failure)
- ✅ Stripe idempotency keys on 3 mutation sites
- ✅ `fulfill_order_v2` called (writes ledger entries)
- ✅ Webhook 72h replay window
- ✅ `cancelStaleSessions` only cancels expired
- ✅ Reconciliation cron calls real `runReconciliation()`
- ✅ Worker has real handlers (not console.log stubs)
- ✅ Queue unified (`enqueueJob` → `enqueueBackgroundJob` → `background_jobs` table)
- ✅ Email module with 8 templates + graceful degradation
- ✅ Stripe Connect onboarding (code-verified)
- ✅ RLS P0 migration written (profiles/products/feature_flags least-privilege, background_jobs RLS)
- ✅ "Purge All Users" button removed
- ✅ "Approve & Refund" requires typed "REFUND" confirmation
- ✅ Seed service: TEST_ prefix on fake Stripe IDs + production guard
- ✅ Legal pages rewritten (no M&A language)

## Critical Gaps Identified by Phase 1 Inventory (Must Fix Before Seeding)

1. **Forbidden wording still present** in 8 files:
   - `buyer-orders/page.tsx`: "Transactional Ledger", "Immutable History", "Ledger Empty", "Ledger fetch error", "Transaction Captured", "trace_id" toast
   - `checkout/page.tsx`: "Ledger is Empty"
   - `seller-dashboard/orders/page.tsx`: "Transactional Ledger", "Audit Ready", "ledger entries"
   - `admin-dashboard/page.tsx`: "Relational Integrity", "immutable audit trail"
   - `admin-dashboard/orders/page.tsx`: "Refresh Ledger", "Transaction Ledger" CardTitle
   - `chat/order-chat.tsx`: "Forensic Support Channel", "Audit-ready support channel initialized"
   - `buyer-orders/refund-request-modal.tsx`: "audit trail"
   - `help/page.tsx`: "asset acquisition"

2. **Hardcoded fake numbers**:
   - `seller-dashboard/page.tsx`: `trend="+12%"` (line 176), `value="98.2"` (line 187)
   - `store/[id]/page.tsx`: "Quality: Excellent", "Response: Under 24h" (lines 99-100)

3. **`buyer_name` column does not exist** in `orders` table. Seed scripts insert it (silently dropped by PostgREST). Seller-orders and admin-refunds "Customer" columns will be blank. Fix: either (a) add the column via migration, OR (b) JOIN `profiles` on `buyer_id` at query time. Option (b) is cleaner — no schema change.

4. **Signup role-update RLS bug**: `profiles` RLS `WITH CHECK (role = (SELECT role FROM profiles WHERE id=auth.uid()))` blocks updating `role` from 'buyer' to 'seller' during signup. New sellers silently remain buyers. Fix: add an RLS policy that allows setting role ONCE during initial profile setup, OR move role assignment to a server action with service_role.

5. **No `financial_ledger` entries seeded**. Reconciliation would flag every order as missing `payment_completed` + `commission_collected` entries. Fix: seed ledger entries alongside orders.

6. **Two parallel seed scripts** with different ID conventions:
   - `src/lib/seed-service.ts` (admin UI button): TEST_ prefix ✓, 62 users / 250 products / 200 orders
   - `scripts/seed-demo.ts` (CLI): `pi_demo_*` prefix ✗, 6 users / 24 products / 30 orders + conversations + reviews (table doesn't exist)
   - Fix: consolidate into one canonical seed script with TEST_ prefix.

7. **No payout history** visible to sellers. The `payouts` table doesn't exist. The seller dashboard shows "Stripe Connected" but no payout records. Fix: either add a `seller_payouts` table OR display ledger entries of type `seller_transfer` as "payout history".

8. **Reviews table referenced but doesn't exist**. `seed-demo.ts` tries to insert 15 reviews. Fix: remove the reviews insert (no UI consumes them anyway).

## Demo Data Shape (Target After Fixes)

| Table | Rows | Notes |
|-------|------|-------|
| `profiles` | 1 admin + 4 sellers + 3 buyers = 8 | All via `auth.admin.createUser` so login works. Sellers: `acct_TEST_*` IDs. |
| `products` | 30 active + 3 drafts | Spread across 4 sellers, 6 categories. Use `/api/placeholder/{cat}/{seed}`. |
| `orders` | 50 | Spread across 30 days. Mix: 30 delivered, 8 shipped, 5 pending, 4 refunded, 3 refund-requested. |
| `financial_ledger` | 2 per order (payment_completed + commission_collected) = 100 | Plus refund entries for refunded orders. |
| `conversations` | 5 | Tied to existing orders. |
| `messages` | 3-5 per conversation | Mixed sender_id. |
| `audit_logs` | 30 | Mix of event types and severities. |
| `cart_items` | 3 for demo buyer | So cart isn't empty. |
| `payment_sessions` | 8 | Mix of statuses. |

## Verification Targets

- 0 new TypeScript errors
- 0 new test failures
- 0 console errors
- 0 hydration errors
- All dashboards render with data (no empty tables on primary demo experience)
