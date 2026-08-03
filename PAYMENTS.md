# VendorTrack Payment System — Enterprise Architecture

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Payment Flow](#payment-flow)
3. [Stripe Integration](#stripe-integration)
4. [Webhook Lifecycle](#webhook-lifecycle)
5. [Refund Lifecycle](#refund-lifecycle)
6. [Financial Ledger](#financial-ledger)
7. [Reconciliation](#reconciliation)
8. [Failure Recovery](#failure-recovery)
9. [Queue System](#queue-system)
10. [Monitoring](#monitoring)
11. [Error Handling](#error-handling)
12. [Security](#security)
13. [Testing](#testing)

---

## Architecture Overview

### System Components

```
┌──────────────────────────────────────────────────────────────────┐
│                    VendorTrack Payment System                     │
│                                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐  │
│  │   Checkout    │   │   Webhook     │   │   Refund Service     │  │
│  │   Validation  │──▶│   Handler     │──▶│   (Stripe API)       │  │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘  │
│         │                  │                      │               │
│         ▼                  ▼                      ▼               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 Financial Ledger (Immutable)              │    │
│  │  payment_created | payment_completed | refund_completed   │    │
│  │  commission_collected | seller_transfer | chargeback      │    │
│  └────────────────────────┬─────────────────────────────────┘    │
│                           │                                       │
│         ┌─────────────────┼─────────────────┐                    │
│         ▼                 ▼                 ▼                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐          │
│  │   Job Queue  │  │ Reconciliation│  │   Monitoring   │          │
│  │   (BG Jobs)  │  │   Service     │  │   Dashboard    │          │
│  └─────────────┘  └──────────────┘  └───────────────┘          │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 PostgreSQL (Atomic Transactions)           │    │
│  │  orders | payment_sessions | financial_ledger | audit_logs│    │
│  │  processed_events | payment_job_queue | reconciliation    │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
  ┌──────────────┐                    ┌──────────────┐
  │    Stripe     │                    │   Supabase   │
  │    Connect    │                    │   (RLS)      │
  └──────────────┘                    └──────────────┘
```

### Design Principles

| Principle | Implementation |
|-----------|---------------|
| **Atomicity** | All financial operations wrapped in PostgreSQL transactions (RPCs) |
| **Idempotency** | Every operation is safe to retry; duplicate detection via `processed_events` and `trace_id` |
| **Auditability** | Every financial event recorded in immutable `financial_ledger` + `audit_logs` |
| **Recoverability** | Failed operations are auto-refunded; reconciliation detects any inconsistency |
| **Consistency** | Database is the source of truth; Stripe is verified against it |
| **Security** | No refund without Stripe confirmation; no double-processing; no client-set prices |

### Key Files

| File | Purpose |
|------|---------|
| `src/lib/payment/errors.ts` | Error classification, structured logging |
| `src/lib/payment/retry.ts` | Exponential backoff, circuit breaker |
| `src/lib/payment/refund-service.ts` | Stripe refund API integration |
| `src/lib/payment/ledger-service.ts` | Immutable financial ledger |
| `src/lib/payment/queue.ts` | Background job processing |
| `src/lib/payment/reconciliation-service.ts` | Stripe vs DB reconciliation |
| `src/app/api/checkout/create-session/route.ts` | Checkout with validation |
| `src/app/api/webhooks/stripe/route.ts` | Webhook handler (exactly-once) |
| `src/app/api/payment-health/route.ts` | Payment health metrics |
| `docs/supabase-payment-migration.sql` | Database schema + RPCs |

---

## Payment Flow

### Checkout Flow (Happy Path)

```
1. Buyer adds items to cart
2. Buyer clicks "Checkout"
3. Frontend calls POST /api/checkout/create-session
   ├── Authenticate user (requireAuth)
   ├── Validate cart ownership
   ├── Validate seller Stripe Connect status
   ├── Validate product availability (stock, status)
   ├── Calculate server-side prices (NEVER trust client)
   ├── Validate commission calculation
   ├── Create payment_sessions record (pending, expires_at)
   ├── Create Stripe PaymentIntent (with destination charge)
   ├── Create financial_ledger entry (payment_created)
   └── Return clientSecret
4. Frontend calls stripe.confirmPayment()
5. Stripe processes payment
6. Stripe sends webhook: payment_intent.succeeded
7. Webhook handler processes event:
   ├── Verify webhook signature
   ├── Check for replay (timestamp < 5 min)
   ├── Atomic idempotency (INSERT processed_events)
   ├── Verify session amount matches PaymentIntent
   ├── Verify session not expired
   ├── Call fulfill_order_v2() RPC:
   │   ├── Lock session (SELECT FOR UPDATE)
   │   ├── Validate session status = pending
   │   ├── Validate session not expired
   │   ├── Decrement stock (atomic)
   │   ├── Create order record
   │   ├── Mark session completed
   │   ├── Create ledger entries (payment_completed, commission_collected)
   │   └── Create audit log
   └── Queue background jobs (notifications, analytics)
8. Buyer redirected to /buyer-orders?payment_success=true
```

### Pricing Integrity

**CRITICAL**: The server NEVER trusts client-submitted prices.

```typescript
// Server-side price calculation
for (const item of items) {
  const p = products.find(p => p.id === item.productId);
  totalCents += p.price_cents * item.quantity;  // DB price, not client price
}
```

### Commission Model

```
Total Amount:     $10.00  (1000 cents)
Commission (10%):  $1.00  (100 cents)
Seller Transfer:   $9.00  (900 cents)
```

Commission is calculated in two places and MUST match:
1. `src/app/api/checkout/create-session/route.ts` — `COMMISSION_RATE = 0.10`
2. `docs/supabase-payment-migration.sql` — `fulfill_order_v2` RPC — `ROUND(v_amount_cents * 0.10)`

---

## Stripe Integration

### Stripe Connect Architecture

VendorTrack uses **Destination Charges** with Stripe Connect:

```
Buyer → Stripe PaymentIntent (1000 cents)
         ├── application_fee_amount: 100 cents (platform commission)
         └── transfer_data.destination: acct_seller123 (seller's connected account)
```

When the payment succeeds:
- The full amount is charged to the buyer
- The platform fee (10%) is retained
- The remaining amount is automatically transferred to the seller's connected account

### Required Stripe Configuration

| Setting | Value |
|---------|-------|
| `STRIPE_SECRET_KEY` | `sk_test_...` or `sk_live_...` (server-only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` or `pk_live_...` (client-safe) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (server-only) |
| Stripe Connect | Sellers must onboard via Stripe Connect |
| Webhook endpoint | `POST /api/webhooks/stripe` |

### Supported Webhook Events

| Event | Handler | Action |
|-------|---------|--------|
| `payment_intent.succeeded` | `handlePaymentIntentSucceeded` | Fulfill order, create ledger entries |
| `charge.refunded` | `handleChargeRefunded` | Record refund in ledger |
| `payment_intent.payment_failed` | `handlePaymentIntentFailed` | Mark session failed, create ledger entry |
| `charge.dispute.created` | `handleDisputeCreated` | Create dispute ledger entry, CRITICAL alert |

---

## Webhook Lifecycle

### Exactly-Once Processing

The webhook handler implements exactly-once processing through:

1. **Signature Verification**: `stripe.webhooks.constructEvent()` verifies the payload
2. **Replay Protection**: Events older than 5 minutes are rejected
3. **Atomic Idempotency**: `INSERT INTO processed_events (id) VALUES (event.id)` — if this succeeds, we are the first processor; if it fails (unique constraint), the event was already processed
4. **Session Locking**: `SELECT FOR UPDATE` in the fulfillment RPC prevents concurrent processing
5. **Status Check**: Session status must be `pending` before processing

```
Webhook Event
    │
    ▼
Verify Signature ──── Invalid ──▶ 400 Bad Request
    │
    ▼ Valid
Check Event Age ──── Too Old ──▶ 200 OK (skip)
    │
    ▼ Fresh
Atomic INSERT processed_events ──── Duplicate ──▶ 200 OK (already processed)
    │
    ▼ First time
Verify Session Amount ──── Mismatch ──▶ Auto-refund
    │
    ▼ Match
Check Session Status ──── Not Pending ──▶ 200 OK (already processed)
    │
    ▼ Pending
fulfill_order_v2() RPC ──── Failure ──▶ Auto-refund
    │
    ▼ Success
Queue Background Jobs ──▶ 200 OK
```

### Auto-Refund Safety Net

If fulfillment fails for ANY reason, the webhook handler automatically:
1. Calls `stripe.refunds.create()` to reverse the payment
2. Creates a `SYSTEM_FAILURE_REFUND` audit log
3. Creates a `refund_completed` ledger entry
4. If the auto-refund also fails, logs a `CRITICAL` alert requiring manual intervention

---

## Refund Lifecycle

### Enterprise Refund Flow

```
1. Buyer requests refund
   └── requestRefund() server action
       ├── Verify buyer owns the order
       ├── Update refund_status = 'requested'
       └── Create audit log

2. Admin reviews refund
   └── processRefundDecision() server action
       ├── Verify admin authorization
       └── If APPROVED:
           ├── Call Stripe Refund API (with retry)
           ├── Verify Stripe confirmation
           ├── Update database (atomic RPC)
           │   ├── Update order status
           │   ├── Create financial ledger entry
           │   └── Create audit log
           ├── Queue buyer notification
           └── Queue seller notification
       └── If REJECTED:
           ├── Update refund_status = 'rejected'
           └── Create audit log
```

### Critical Rule

> **No refund may exist in the database unless Stripe confirms it.**

The refund service calls `stripe.refunds.create()` BEFORE updating the database. If the Stripe call fails, the database is NOT updated. If the database update fails AFTER the Stripe call, a CRITICAL alert is logged for manual reconciliation.

### Partial Refunds

Partial refunds are supported by passing an `amount` parameter:
- If omitted: full refund (entire order amount)
- If provided: partial refund (must be > 0 and <= order total)

---

## Financial Ledger

### Design

The `financial_ledger` table is **immutable and append-only**:
- No UPDATE operations allowed (RLS policy: `FOR UPDATE USING (false)`)
- No DELETE operations allowed (RLS policy: `FOR DELETE USING (false)`)
- Only INSERT and SELECT are permitted

### Event Types

| Event Type | Description | Amount |
|------------|-------------|--------|
| `payment_created` | PaymentIntent created | Full amount |
| `payment_completed` | Payment confirmed via webhook | Full amount |
| `refund_requested` | Refund requested by buyer/admin | 0 |
| `refund_completed` | Stripe refund confirmed | Refund amount |
| `commission_collected` | Platform commission recorded | Commission amount |
| `seller_transfer` | Funds transferred to seller | Transfer amount |
| `chargeback` | Chargeback initiated | Chargeback amount |
| `dispute` | Dispute opened | Disputed amount |

### Idempotency

Ledger entries are idempotent by `(trace_id, event_type, order_id)`. If the same entry is created twice, the duplicate is silently ignored.

---

## Reconciliation

### Purpose

Reconciliation is the **last line of defense**. It compares Stripe data against the database to detect:

| Discrepancy | Severity | Description |
|-------------|----------|-------------|
| `missing_order` | CRITICAL | Stripe has a successful payment with no matching order |
| `duplicate_payment` | CRITICAL | Same PaymentIntent ID in multiple orders |
| `orphan_refund` | CRITICAL | Refund in DB but not in Stripe |
| `amount_mismatch` | HIGH | Stripe amount != DB amount |
| `failed_transfer` | HIGH | Payment succeeded but no transfer to seller |
| `commission_mismatch` | MEDIUM | Commission doesn't match 10% rate |

### Running Reconciliation

- **On-demand**: `POST /api/reconciliation/run` (admin-only)
- **Scheduled**: Daily via cron job
- **After failures**: Automatic reconciliation triggered by critical errors

### Reconciliation Report

Each reconciliation run produces a `reconciliation_reports` record with:
- Counts of Stripe payments vs DB orders
- All discrepancies found
- Health assessment (healthy if no critical discrepancies)

---

## Failure Recovery

### Failure Scenarios & Recovery

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Fulfillment fails after payment | Webhook handler catches error | Auto-refund via Stripe |
| Webhook delivery fails | Stripe retries (up to 3 days) | Idempotency ensures safe reprocessing |
| Database update fails after Stripe refund | Refund service logs CRITICAL | Manual reconciliation required |
| Network timeout during checkout | PaymentError with retry | Exponential backoff retry |
| Inventory exhausted during fulfillment | `INVENTORY_EXHAUSTED` exception | Auto-refund |
| Session expired | `SESSION_EXPIRED` check | Auto-refund |
| Duplicate webhook | `processed_events` table | Return 200 OK (already processed) |
| Auto-refund fails | Webhook handler catches | CRITICAL alert for manual intervention |

### Circuit Breaker

The retry system includes a circuit breaker:
- Opens after 5 consecutive failures for an operation
- Rejects new requests for 60 seconds
- Half-open state allows one attempt after cooldown
- Prevents cascading failures

---

## Queue System

### Architecture

The payment job queue is database-backed (no Redis/RabbitMQ required):

```
Enqueue Job → payment_job_queue (status: pending)
                    │
                    ▼
Worker polls: claim_next_queue_job() RPC
    ├── SELECT FOR UPDATE SKIP LOCKED
    ├── Mark as processing
    └── Return job
                    │
                    ▼
Execute handler ──── Success ──▶ Mark completed
                    │
                    ▼ Failure
                Increment attempts
                    │
                    ├── attempts < max ──▶ Mark pending (retry later)
                    └── attempts >= max ──▶ Mark dead (no more retries)
```

### Job Types

| Type | Purpose | Max Attempts |
|------|---------|-------------|
| `notification` | Email/push notifications | 3 |
| `analytics` | Analytics event processing | 3 |
| `audit` | Audit log enrichment | 3 |
| `reconciliation` | Reconciliation jobs | 3 |
| `seller_payout` | Seller payout processing | 5 |
| `ledger_reconciliation` | Ledger integrity checks | 3 |

---

## Monitoring

### Payment Health Dashboard

The `/api/payment-health` endpoint returns real-time metrics:

| Metric | Source | Alert Threshold |
|--------|--------|----------------|
| Successful payments (24h) | `orders` table | — |
| Failed sessions (24h) | `payment_sessions` table | > 10% failure rate |
| Refund rate (7d) | `orders` table | > 15% |
| Pending refunds | `orders` table | > 50 |
| Critical events (24h) | `audit_logs` table | > 5 |
| Queue status | `payment_job_queue` table | Dead jobs > 0 |
| Circuit breaker status | In-memory | Any open circuit |

### Health Assessment

The system is considered **healthy** if:
- Refund rate < 15%
- Critical events < 5 in 24 hours
- Pending refunds < 50
- No open circuit breakers
- No dead jobs in the queue

---

## Error Handling

### Error Categories

| Category | Prefix | Retryable | Example |
|----------|--------|-----------|---------|
| Stripe | `STRIPE_*` | Depends | `STRIPE_REFUND_FAILED` |
| Network | `NETWORK_*` | Yes | `NETWORK_TIMEOUT` |
| Validation | `VALIDATION_*` | No | `VALIDATION_SESSION_EXPIRED` |
| Database | `DATABASE_*` | Depends | `DATABASE_RPC_FAILED` |
| Webhook | `WEBHOOK_*` | No | `WEBHOOK_SIGNATURE_INVALID` |
| Internal | `INTERNAL_*` | Depends | `INTERNAL_LEDGER_ERROR` |

### Client-Safe Responses

Errors are never exposed to the client in detail. The `PaymentError.toClientResponse()` method returns only:
- `error`: Human-readable message (safe for display)
- `code`: Error code (for debugging)
- `traceId`: Correlation ID (for support)

### Structured Logging

All payment events are logged as structured JSON:
```json
{
  "traceId": "tr_1234567890_abc",
  "event": "refund_completed",
  "category": "stripe",
  "severity": "INFO",
  "message": "Refund completed for order abc-123",
  "data": { "stripeRefundId": "re_123", "amount": 1000 },
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

---

## Security

### Financial Security Guarantees

1. **No money disappears**: Every payment is tracked from creation to completion
2. **No double fulfillment**: `SELECT FOR UPDATE` + `processed_events` table
3. **No refund without Stripe**: Refund service calls Stripe API before DB update
4. **No price manipulation**: Server calculates all prices (never trusts client)
5. **No privilege escalation**: RBAC + ownership verification on all operations
6. **No secret exposure**: All Stripe keys server-only; RLS on financial tables

### Row Level Security

| Table | Admin | Service Role | User |
|-------|-------|-------------|------|
| `financial_ledger` | Read | Insert | None |
| `payment_job_queue` | Manage | Manage | None |
| `reconciliation_reports` | Read | Insert | None |
| `processed_events` | Read | Insert | None |
| `payment_sessions` | Read/Update | Full | Own sessions only |
| `audit_logs` | Read | Insert | None |

---

## Testing

### Test Coverage

| Scenario | Test File | Validates |
|----------|-----------|-----------|
| Error classification | `payment-system.test.ts` | PaymentError, fromStripeError, fromDatabaseError |
| Retry strategy | `payment-system.test.ts` | Exponential backoff, circuit breaker, non-retryable |
| Ledger entries | `payment-system.test.ts` | Event types, immutability |
| Webhook idempotency | `payment-system.test.ts` | Signature verification, replay protection |
| Checkout validation | `payment-system.test.ts` | Expiry, pricing, stock, seller, commission |
| Refund processing | `payment-system.test.ts` | Eligibility, partial amounts |
| Queue system | `payment-system.test.ts` | Job types, status transitions |
| Reconciliation | `payment-system.test.ts` | Missing orders, mismatches, duplicates, orphans |
| Integrity invariants | `payment-system.test.ts` | Double fulfillment, refund-without-Stripe, ledger immutability |

### Running Tests

```bash
npm test -- src/__tests__/payment/payment-system.test.ts
```

---

## Migration Checklist

When deploying the payment system upgrade:

1. **Run the SQL migration**: `docs/supabase-payment-migration.sql`
2. **Verify new tables exist**: `financial_ledger`, `payment_job_queue`, `reconciliation_reports`
3. **Verify new RPCs**: `process_refund_atomic`, `fulfill_order_v2`, `claim_next_queue_job`, `expire_stale_sessions`
4. **Verify new columns**: `orders.stripe_refund_id`, `orders.refund_amount_cents`, `payment_sessions.payment_intent_id`
5. **Deploy the new code**: All files in `src/lib/payment/`, updated routes, updated admin actions
6. **Configure Stripe webhook**: Ensure all 4 event types are registered
7. **Test with Stripe test mode**: Verify checkout, webhook, refund flows
8. **Run reconciliation**: Compare Stripe test data against DB
9. **Switch to live mode**: Update Stripe keys, verify production flows
10. **Set up monitoring**: Configure alerts for the payment health dashboard

---

## Glossary

| Term | Definition |
|------|-----------|
| **PaymentIntent** | Stripe object representing a payment attempt |
| **Destination Charge** | Stripe Connect pattern where funds flow to a connected account |
| **Application Fee** | Platform commission retained from each payment |
| **Trace ID** | Unique identifier for end-to-end correlation of a payment flow |
| **Idempotency Key** | Ensures an operation can be safely retried without duplicate effects |
| **Circuit Breaker** | Prevents cascading failures by temporarily stopping requests to a failing service |
| **Reconciliation** | Process of comparing two data sources to detect inconsistencies |
| **Ledger** | Immutable, append-only record of all financial events |
