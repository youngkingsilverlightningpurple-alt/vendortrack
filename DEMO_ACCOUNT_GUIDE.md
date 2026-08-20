# Demo Account Guide

## Demo Credentials

All demo accounts use the same password: **`DemoPass123!`**

| Role | Email | Purpose |
|------|-------|---------|
| Admin | `admin@demo.vendortrack.app` | Full platform access — users, products, orders, refunds, analytics |
| Seller (approved, Stripe connected) | `volt@demo.vendortrack.app` | "Volt Systems" — shows the full seller experience with Stripe payouts enabled |
| Seller (approved, Stripe NOT connected) | `circuit@demo.vendortrack.app` | "Circuit Master" — shows the seller onboarding state (Stripe Connect button visible) |
| Seller (approved, Stripe connected) | `nexus@demo.vendortrack.app` | "Nexus Gear" — second seller with orders |
| Seller (approved, Stripe connected) | `silicon@demo.vendortrack.app` | "Silicon Valley Direct" — third seller with orders |
| Buyer (with cart + order history) | `alex@demo.vendortrack.app` | "Alex Chen" — has 3 items in cart + multiple orders across statuses |
| Buyer (with order history) | `sarah@demo.vendortrack.app` | "Sarah Miller" — has orders |
| Buyer (with order history) | `james@demo.vendortrack.app` | "James Wilson" — has orders |

## How to Seed the Demo Data

### Prerequisites
- A Supabase project with all migrations applied (see `docs/supabase-*.sql`)
- Environment variables configured (see `.env.example`):
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  ```

### Run the seed
```bash
npm run seed:demo
```

This creates:
- 8 auth users (1 admin, 4 sellers, 3 buyers)
- 33 products (30 active + 3 drafts) across 6 categories
- 50 orders spread across 30 days
- 100+ financial_ledger entries
- 5 conversations with messages
- 30 audit_logs
- 3 cart_items (for the demo buyer)
- 8 payment_sessions

### Reset the demo
```bash
npm run seed:reset
```

This deletes ALL demo data (identified by `*@demo.vendortrack.app` emails + `tr_TEST_*` trace IDs + `/api/placeholder/` image URLs). Real data is untouched.

## What Each Account Demonstrates

### Admin (`admin@demo.vendortrack.app`)
- **Dashboard** (`/admin-dashboard`): Shows real GMV, platform revenue (10% commission), active sellers, orders (30d), conversion rate, plus a 14-day revenue chart
- **Users** (`/admin-dashboard/users`): Shows all 8 demo users with role/seller-status badges. The "Purge All Users" button has been REMOVED (P0 fix — was a mis-click risk)
- **Products** (`/admin-dashboard/products`): Shows all 33 products with seller names
- **Orders** (`/admin-dashboard/orders`): Shows all 50 orders with buyer names (resolved via JOIN)
- **Refunds** (`/admin-dashboard/refunds`): Shows 3 orders with `refund_status='requested'`. The "Approve & Refund" button now requires typing "REFUND" to confirm (P0 fix)

### Seller — Stripe Connected (`volt@demo.vendortrack.app`)
- **Dashboard** (`/seller-dashboard`): Shows real earnings (computed from delivered orders), active orders, real fulfillment rate (computed from orders), store products
- **Products** (`/seller-dashboard/products`): Shows this seller's products
- **Orders** (`/seller-dashboard/orders`): Shows this seller's orders with buyer names resolved via JOIN
- **Settings** (`/seller-dashboard/settings`): Shows Stripe Connect as "Connected" (green badge)

### Seller — Stripe NOT Connected (`circuit@demo.vendortrack.app`)
- **Settings** (`/seller-dashboard/settings`): Shows the "Connect Stripe" button (P0 fix — was previously missing entirely). Clicking it would call `/api/stripe/connect/onboard` which creates a real Stripe Express Connect account + redirects to Stripe-hosted onboarding

### Buyer (`alex@demo.vendortrack.app`)
- **Cart** (`/cart`): Has 3 items pre-loaded
- **Orders** (`/buyer-orders`): Shows this buyer's orders across multiple statuses (pending, shipped, delivered, refunded)
- **Refund flow**: At least one order has `refund_status='requested'` — the buyer can click "Request Refund" to see the modal

## Demo Data Markers (for safe identification)

All demo data is clearly marked so it can never be confused with real customer data:

| Marker | Where | Pattern |
|--------|-------|---------|
| Email domain | All demo auth users | `*@demo.vendortrack.app` |
| Stripe account ID | Demo sellers | `acct_TEST_*` |
| Stripe PaymentIntent ID | Demo orders | `pi_TEST_*` |
| Stripe refund ID | Demo refunds | `re_TEST_*` |
| Trace ID | All demo orders + ledger + audit_logs | `tr_TEST_*` |
| Product image URL | All demo products | `/api/placeholder/{category}/{seed}` |

## Verification Status

- ✅ **CODE-VERIFIED**: Seed script compiles, types are correct, idempotency logic is sound
- ⚠️ **LIVE-VERIFIED**: BLOCKED — requires real Supabase credentials (`NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) to actually run the seed against a live database. These are not available in the current sandbox environment.

To live-verify:
1. Configure Supabase env vars in `.env.local`
2. Apply all migrations to your Supabase project
3. Run `npm run seed:demo`
4. Log in as each demo account and verify the dashboards render with data
