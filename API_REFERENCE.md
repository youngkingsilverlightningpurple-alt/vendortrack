# VendorTrack API Reference

Version: 1.0.0 | Last Updated: 2025-03-04

This document provides the complete API reference for the VendorTrack multi-vendor
marketplace platform. VendorTrack is built on Next.js with Supabase (PostgreSQL),
Stripe, Redis, and Gemini AI. Every endpoint and server action is documented here.

---

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
3. [Authorization (RBAC)](#authorization-rbac)
4. [Rate Limiting](#rate-limiting)
5. [CSRF Protection](#csrf-protection)
6. [Error Handling](#error-handling)
7. [API Endpoints](#api-endpoints)
   - [POST /api/checkout/create-session](#post-apicheckoutcreate-session)
   - [POST /api/webhooks/stripe](#post-apiwebhooksstripe)
   - [GET /api/products/search](#get-apiproductssearch)
   - [GET /api/payment-health](#get-apipayment-health)
   - [GET /api/performance](#get-apiperformance)
   - [GET /api/health](#get-apihealth)
   - [GET /api/cron/cache-warming](#get-apicroncache-warming)
   - [GET /api/cron/reconciliation](#get-apicronreconciliation)
   - [GET /api/cron/health-check](#get-apicronhealth-check)
8. [Server Actions](#server-actions)
   - [Admin Actions](#admin-actions)
   - [Buyer Actions](#buyer-actions)
   - [Seller Actions](#seller-actions)
9. [Appendix: Error Codes](#appendix-error-codes)
10. [Appendix: Rate Limit Configurations](#appendix-rate-limit-configurations)

---

## Overview

VendorTrack exposes two categories of server-side operations:

| Category        | Protocol          | Transport       | Use Case                              |
|-----------------|-------------------|-----------------|---------------------------------------|
| API Endpoints   | REST (HTTP)       | `/api/*` routes | External integrations, webhooks, cron |
| Server Actions  | RPC (Next.js)     | Form actions    | Client-side mutations (no API key)    |

All responses use `application/json` unless otherwise noted. Date fields are
ISO 8601 strings. Monetary values are always in cents (integer).

### Base URL

```
Production:  https://yourdomain.com
Development: http://localhost:9002
```

### Common Request Headers

| Header            | Required | Description                              |
|-------------------|----------|------------------------------------------|
| `Content-Type`    | Yes*     | `application/json` for all POST endpoints |
| `Authorization`   | Varies   | Bearer token for cron endpoints           |
| `x-csrf-token`    | Yes**    | CSRF token for state-changing API routes  |
| `Cookie`          | Auto     | Supabase session cookie (auth)            |

*Required for POST endpoints with a JSON body.
**Required for all POST/PUT/PATCH/DELETE API routes except `/api/webhooks/*`.

---

## Authentication

VendorTrack uses Supabase Auth with session cookies. The authentication flow is:

1. User signs in via Supabase Auth (email/password or OAuth).
2. Supabase sets an HTTP-only session cookie (`sb-<ref>-auth-token`).
3. Server-side code validates the session via `createRouteHandlerClient`.
4. The user's profile is fetched from `profiles` to resolve their RBAC role.

### Auth Result Schema

On successful authentication, the server resolves:

```typescript
interface AuthResult {
  success: true;
  userId: string;       // Supabase auth UID (UUID)
  email: string;        // User email
  role: Role;           // Resolved RBAC role
  dbRole: string;       // Raw database role string
  isAdmin: boolean;     // is_admin flag from profiles table
}
```

### Auth Error Schema

```typescript
interface AuthError {
  success: false;
  error: string;        // Human-readable error message
  statusCode: number;   // HTTP status code (401, 403, 500)
  code: string;         // Machine-readable error code
}
```

### Authentication Error Codes

| Code                   | Status | Description                             |
|------------------------|--------|-----------------------------------------|
| `UNAUTHENTICATED`      | 401    | No valid session found                  |
| `PROFILE_NOT_FOUND`    | 403    | User exists but profile is missing      |
| `AUTH_SYSTEM_ERROR`    | 500    | Unexpected authentication failure       |
| `INSUFFICIENT_PERMISSION` | 403 | User lacks required permission          |
| `INSUFFICIENT_ROLE`    | 403    | User lacks required role level          |
| `ADMIN_REQUIRED`       | 403    | Admin privileges required               |
| `SELLER_REQUIRED`      | 403    | Seller privileges required              |
| `OWNERSHIP_VIOLATION`  | 403    | User does not own the requested resource|

---

## Authorization (RBAC)

VendorTrack implements a role-based access control system with five roles and
seventeen permissions. The RBAC module is the single source of truth for all
authorization decisions.

### Role Hierarchy

Roles are ordered from least to most privileged:

| Rank | Role          | Description                                    |
|------|---------------|------------------------------------------------|
| 1    | `guest`       | Unauthenticated visitors; browse-only access    |
| 2    | `buyer`       | Registered users who can purchase and chat      |
| 3    | `seller`      | Users who can list and sell products            |
| 4    | `admin`       | Platform administrators with broad access       |
| 5    | `super_admin` | Full system access including user management    |

### Permission Matrix

| Permission           | guest | buyer | seller | admin | super_admin |
|----------------------|-------|-------|--------|-------|-------------|
| `products.read`      | Yes   | Yes   | Yes    | Yes   | Yes         |
| `products.write`     | No    | No    | Yes    | Yes   | Yes         |
| `products.delete`    | No    | No    | No     | Yes   | Yes         |
| `orders.read`        | No    | Yes   | Yes    | Yes   | Yes         |
| `orders.manage`      | No    | No    | Yes    | Yes   | Yes         |
| `orders.refund`      | No    | Yes   | No     | No    | Yes         |
| `users.read`         | No    | No    | No     | Yes   | Yes         |
| `users.manage`       | No    | No    | No     | Yes   | Yes         |
| `users.delete`       | No    | No    | No     | No    | Yes         |
| `payments.create`    | No    | Yes   | Yes    | No    | Yes         |
| `payments.manage`    | No    | No    | No     | Yes   | Yes         |
| `analytics.read`     | No    | No    | Yes    | Yes   | Yes         |
| `inventory.manage`   | No    | No    | Yes    | Yes   | Yes         |
| `ai.use`             | No    | Yes   | Yes    | Yes   | Yes         |
| `refunds.manage`     | No    | No    | No     | Yes   | Yes         |
| `cart.manage`        | No    | Yes   | Yes    | No    | Yes         |
| `chat.read`          | No    | Yes   | Yes    | Yes   | Yes         |
| `chat.write`         | No    | Yes   | Yes    | Yes   | Yes         |
| `platform.manage`    | No    | No    | No     | Yes   | Yes         |

### Role Resolution

The `resolveRole` function maps database fields to canonical RBAC roles:

```typescript
function resolveRole(dbRole: string, isAdmin: boolean): Role {
  if (isAdmin) return 'super_admin';
  if (dbRole === 'seller') return 'seller';
  if (dbRole === 'buyer') return 'buyer';
  return 'guest';
}
```

---

## Rate Limiting

Rate limiting uses an in-memory sliding window counter with burst protection.
For production multi-instance deployments, replace with Redis/Upstash.

### Rate Limit Headers

All rate-limited responses include these headers:

| Header                  | Description                              |
|-------------------------|------------------------------------------|
| `X-RateLimit-Limit`     | Maximum requests per window              |
| `X-RateLimit-Remaining` | Remaining requests in current window     |
| `X-RateLimit-Reset`     | Unix timestamp when the window resets    |
| `Retry-After`           | Seconds until reset (only on 429)        |

### Rate Limit Response

When a rate limit is exceeded, the API returns:

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 45,
  "traceId": "rl_1709550000000"
}
```

Status code: `429 Too Many Requests`

### Client Identifier Strategy

| Request Type   | Identifier Source                        |
|----------------|------------------------------------------|
| Authenticated  | `user:<userId>` from session             |
| Unauthenticated| `ip:<X-Forwarded-For>` or `ip:<X-Real-IP>` |

---

## CSRF Protection

All state-changing requests (POST, PUT, PATCH, DELETE) to `/api/*` routes are
protected by CSRF. The defense-in-depth strategy includes:

1. **Origin/Referer verification** -- Rejects requests with missing or
   mismatched origins.
2. **CSRF token** -- Double-submit cookie pattern using `x-csrf-token`
   header and `__Host-csrf-token` cookie.
3. **SameSite cookies** -- Session cookies use `SameSite=Strict`.
4. **Content-Type verification** -- Rejects `application/x-www-form-urlencoded`
   for API routes.

### Exempt Paths

The following paths are exempt from CSRF checks:

- `/api/webhooks/*` -- External services (Stripe) do not send CSRF tokens.
- Server Actions -- Next.js handles CSRF internally.

### CSRF Token Flow

```
1. Client requests page -> Server sets __Host-csrf-token cookie
2. Client reads cookie, includes value in x-csrf-token header
3. Server verifies header token against server secret (HMAC)
4. Optionally verifies header matches cookie (double-submit)
```

---

## Error Handling

All errors follow a unified `AppError` hierarchy. Every error includes a
machine-readable code, HTTP status, and trace ID for debugging.

### Error Response Schema

```json
{
  "error": "Human-readable message safe for clients",
  "code": "MACHINE_READABLE_CODE",
  "traceId": "unique_trace_identifier"
}
```

### Error Class Hierarchy

| Class                | Base Code               | Status | Use Case                     |
|----------------------|-------------------------|--------|------------------------------|
| `ValidationError`    | `VALIDATION_FAILED`     | 400    | Input validation failures    |
| `AuthenticationError`| `UNAUTHENTICATED`       | 401    | Auth/identity failures       |
| `AuthorizationError` | `INSUFFICIENT_PERMISSION`| 403   | Permission/role failures     |
| `NotFoundError`      | `NOT_FOUND`             | 404    | Resource not found           |
| `ConflictError`      | `CONFLICT`              | 409    | Duplicate/state conflict     |
| `DatabaseError`      | `DB_ERROR`              | 500    | Supabase/PostgreSQL failures |
| `PaymentError`       | `PAYMENT_STRIPE_ERROR`  | 500    | Stripe/payment failures      |
| `AppError`           | `INTERNAL_ERROR`        | 500    | Catch-all for unknown errors |

---

## API Endpoints

---

### POST /api/checkout/create-session

Creates a Stripe checkout session for the authenticated buyer. The session
supports single-vendor checkout only (all items must belong to the same seller).

#### Purpose

Initiate a payment flow for one or more cart items. Returns a Stripe
`clientSecret` for client-side confirmation.

#### Authentication

| Requirement | Value                        |
|-------------|------------------------------|
| Auth        | Required (session cookie)    |
| Permission  | `payments.create`            |
| Roles       | buyer, seller, super_admin   |

#### Rate Limit

| Config        | Value          |
|---------------|----------------|
| Key           | `RATE_LIMITS.CHECKOUT` |
| Scope         | Per-user (`user:<userId>`) |
| Sustained     | 10 requests / hour |
| Burst         | 3 requests / minute |

#### CSRF

Protected. Requires `x-csrf-token` header.

#### Request

```
POST /api/checkout/create-session
Content-Type: application/json
x-csrf-token: <token>
Cookie: <supabase-session>
```

**Body Schema** (`CheckoutSessionRequestSchema`):

```typescript
{
  items: [
    {
      productId: string;   // UUID format, required
      quantity: number;     // Integer 1-100, required
    }
  ]                        // 1-50 items, required
}
```

| Field              | Type     | Required | Constraints                          |
|--------------------|----------|----------|--------------------------------------|
| `items`            | array    | Yes      | 1-50 items                           |
| `items[].productId`| string   | Yes      | UUID format                          |
| `items[].quantity` | number   | Yes      | Integer, 1-100                       |

#### Response

**200 OK** -- Checkout session created:

```json
{
  "clientSecret": "pi_xxx_secret_yyy",
  "traceId": "cs_1709550000000_abc123",
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

| Field          | Type   | Description                            |
|----------------|--------|----------------------------------------|
| `clientSecret` | string | Stripe PaymentIntent client secret     |
| `traceId`      | string | Server-side trace ID for debugging     |
| `sessionId`    | string | Internal payment session UUID          |

#### Errors

| Status | Code                      | Description                              |
|--------|---------------------------|------------------------------------------|
| 400    | `VALIDATION_FAILED`       | Invalid request body (missing fields, bad UUID, etc.) |
| 401    | `UNAUTHENTICATED`         | No valid session                         |
| 403    | `INSUFFICIENT_PERMISSION` | User lacks `payments.create` permission  |
| 403    | `SELLER_NOT_CONNECTED`    | Seller has not connected Stripe account  |
| 403    | `OWNERSHIP_VIOLATION`     | User does not own the cart items         |
| 409    | `PAYMENT_CART_MISMATCH`   | Payment session record missing           |
| 409    | `PAYMENT_PRICE_MISMATCH`  | Stripe amount differs from session amount|
| 409    | `PAYMENT_SESSION_EXPIRED` | Payment session has expired              |
| 429    | `RATE_LIMIT_EXCEEDED`     | Too many checkout attempts               |
| 500    | `PAYMENT_STRIPE_ERROR`    | Stripe API error                         |
| 500    | `INTERNAL_ERROR`          | Unexpected server error                  |

#### Example

```bash
curl -X POST https://yourdomain.com/api/checkout/create-session \
  -H "Content-Type: application/json" \
  -H "x-csrf-token: a1b2c3...d4e5f6.hmac_value" \
  -H "Cookie: sb-xxx-auth-token=..." \
  -d '{
    "items": [
      { "productId": "550e8400-e29b-41d4-a716-446655440000", "quantity": 2 },
      { "productId": "660e8400-e29b-41d4-a716-446655440001", "quantity": 1 }
    ]
  }'
```

---

### POST /api/webhooks/stripe

Receives and processes Stripe webhook events. This endpoint is called by
Stripe's servers and does not use the standard authentication flow.

#### Purpose

Processes payment lifecycle events: success, failure, refund, and dispute.
Implements idempotent processing with automatic safety refunds on fulfillment
failure.

#### Authentication

| Requirement | Value                                  |
|-------------|----------------------------------------|
| Auth        | Stripe webhook signature verification  |
| Header      | `stripe-signature` (set by Stripe)     |

No session cookie or RBAC check. Signature is verified against
`STRIPE_WEBHOOK_SECRET` environment variable.

#### Rate Limit

None. Rate limiting is controlled by Stripe on the sending side.

#### CSRF

Exempt. Webhook paths (`/api/webhooks/*`) bypass CSRF protection.

#### Request

```
POST /api/webhooks/stripe
Content-Type: application/json
stripe-signature: t=1709550000,v1=abc123...
```

**Body**: Raw Stripe event JSON (parsed from `req.text()` for signature
verification).

#### Security Processing Pipeline

```
1. Verify Stripe webhook signature
2. Replay protection (reject events older than 5 minutes)
3. Atomic idempotency check (deduplicate via audit_logs)
4. Dispatch to event handler
5. On fulfillment failure -> automatic Stripe refund
```

#### Handled Event Types

| Event Type                        | Handler                      | Description                     |
|-----------------------------------|------------------------------|---------------------------------|
| `payment_intent.succeeded`        | `handlePaymentIntentSucceeded` | Payment confirmed, fulfill order |
| `charge.refunded`                 | `handleChargeRefunded`       | Refund processed, record ledger |
| `payment_intent.payment_failed`   | `handlePaymentIntentFailed`  | Payment declined, mark failed   |
| `charge.dispute.created`          | `handleDisputeCreated`       | Chargeback initiated, log audit |

#### payment_intent.succeeded Processing

On receiving a successful payment:

1. **Session verification** -- Lookup payment session by metadata sessionId.
2. **Amount verification** -- Compare Stripe amount with session amount
   (security check against price manipulation).
3. **Status check** -- Verify session is in `pending` status.
4. **Expiry check** -- Verify session has not expired.
5. **Atomic fulfillment** -- Call `orderRepository.fulfillOrder()` (PostgreSQL RPC).
6. **Background jobs** -- Queue buyer notification, seller notification, and
   analytics event (non-blocking).
7. **Safety refund** -- If any step fails, automatically initiate a Stripe
   refund and create a ledger entry with `recovery_action: AUTO_REFUND_ON_SYSTEM_FAILURE`.

#### Response

**200 OK** -- Event received and processed:

```json
{ "received": true }
```

**200 OK** -- Duplicate event (already processed):

```json
{ "received": true, "duplicate": true }
```

**200 OK** -- Event too old (replay protection):

```json
{ "received": true, "info": "Event too old" }
```

#### Errors

| Status | Description                              |
|--------|------------------------------------------|
| 400    | Invalid webhook signature                |
| 500    | Processing error (auto-refund attempted) |

Note: Even on processing errors, the endpoint returns 200 to prevent Stripe
from retrying. The safety refund mechanism handles failures gracefully.

#### Example

```bash
# Stripe sends this automatically. For local testing:
curl -X POST http://localhost:9002/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "stripe-signature: t=1709550000,v1=abc123..." \
  -d '{
    "id": "evt_123",
    "type": "payment_intent.succeeded",
    "created": 1709550000,
    "data": {
      "object": {
        "id": "pi_abc123",
        "amount": 2999,
        "metadata": {
          "sessionId": "550e8400-e29b-41d4-a716-446655440000",
          "traceId": "cs_1709550000000_abc123"
        }
      }
    }
  }'
```

---

### GET /api/products/search

Searches the product catalog with full-text search, filtering, pagination,
and auto-suggestions.

#### Purpose

Public product search endpoint. Supports text search, category filtering,
price range, and paginated results. Also provides a suggestion endpoint
for autocomplete.

#### Authentication

| Requirement | Value          |
|-------------|----------------|
| Auth        | None (public)  |
| Permission  | None           |

#### Rate Limit

| Config        | Value                          |
|---------------|--------------------------------|
| Key           | `RATE_LIMITS.SEARCH`           |
| Scope         | Per-IP (`ip:<address>`)        |
| Sustained     | 60 requests / minute           |
| Burst         | 20 requests / 10 seconds       |

#### Request

```
GET /api/products/search?q=wireless+headphones&category=Electronics&minPrice=10&maxPrice=200&page=0&limit=12
```

**Query Parameters**:

| Parameter   | Type    | Required | Default | Constraints                          |
|-------------|---------|----------|---------|--------------------------------------|
| `q`         | string  | No       | -       | Max 200 chars; SQL injection patterns rejected |
| `category`  | string  | No       | -       | Max 100 chars; alphanumeric, spaces, hyphens, `&` |
| `minPrice`  | number  | No       | -       | 0 - 10,000,000                       |
| `maxPrice`  | number  | No       | -       | 0 - 10,000,000; must be >= minPrice  |
| `page`      | integer | No       | 0       | >= 0                                 |
| `limit`     | integer | No       | 12      | 1 - 100                              |
| `suggest`   | string  | No       | -       | Prefix for autocomplete suggestions  |

All query values are sanitized via `sanitizeSearchQuery` before processing.

#### Response

**200 OK** -- Search results:

```json
{
  "products": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "Wireless Headphones Pro",
      "price": 7999,
      "imageUrl": "https://storage.example.com/images/headphones.jpg",
      "category": "Electronics",
      "status": "active",
      "rank": 0.85
    }
  ],
  "pagination": {
    "page": 0,
    "pageSize": 12,
    "total": 47,
    "hasMore": true
  }
}
```

**200 OK** -- Suggestions (when `suggest` parameter is provided):

```json
{
  "suggestions": ["wireless headphones", "wireless mouse", "wireless charger"]
}
```

#### Response Headers

| Header              | Description                              |
|---------------------|------------------------------------------|
| `Server-Timing`     | `search;dur=12.3` (query duration in ms) |
| `X-Response-Time`   | `12.3ms` (total response time)           |
| `Cache-Control`     | Cache directives for search results      |

#### Errors

| Status | Code                  | Description                              |
|--------|-----------------------|------------------------------------------|
| 400    | `VALIDATION_FAILED`   | Invalid query parameters                 |
| 429    | `RATE_LIMIT_EXCEEDED` | Too many search requests from this IP    |
| 500    | `INTERNAL_ERROR`      | Unexpected server error                  |

#### Example

```bash
# Full search
curl "https://yourdomain.com/api/products/search?q=headphones&category=Electronics&minPrice=50&maxPrice=200&page=0&limit=12"

# Autocomplete suggestions
curl "https://yourdomain.com/api/products/search?suggest=wire"
```

---

### GET /api/payment-health

Returns real-time payment system health metrics for the admin dashboard.

#### Purpose

Provides a comprehensive view of the payment system including success rates,
failure metrics, refund rates, queue status, and circuit breaker states.
Optimized from 9+ serial database queries to a single RPC call.

#### Authentication

| Requirement | Value                          |
|-------------|--------------------------------|
| Auth        | Required (session cookie)      |
| Permission  | `analytics.read`               |
| Roles       | admin, super_admin only        |

#### Rate Limit

| Config        | Value                          |
|---------------|--------------------------------|
| Key           | `RATE_LIMITS.PAYMENT_HEALTH`   |
| Scope         | Per-user                       |
| Sustained     | 30 requests / minute           |

#### Request

```
GET /api/payment-health
Cookie: <supabase-session>
```

No parameters.

#### Response

**200 OK**:

```json
{
  "timestamp": "2025-03-04T12:00:00.000Z",
  "healthy": true,
  "metrics": {
    "successfulPayments": 142,
    "failedSessions": 3,
    "refundRate": 0.021,
    "pendingRefunds": 2,
    "criticalEvents": 0,
    "gmv24h": 2850000,
    "commission24h": 285000,
    "ledgerEntries24h": 158,
    "totalOrders7d": 892,
    "refundedOrders7d": 18
  },
  "queue": {
    "pending": 4,
    "processing": 1,
    "dead": 0
  },
  "circuitBreakers": {
    "stripe": { "state": "closed", "failures": 0, "lastFailure": null },
    "database": { "state": "closed", "failures": 0, "lastFailure": null }
  }
}
```

| Field                                | Type    | Description                              |
|--------------------------------------|---------|------------------------------------------|
| `timestamp`                          | string  | ISO 8601 timestamp of computation        |
| `healthy`                            | boolean | Overall payment system health            |
| `metrics.successfulPayments`         | integer | Successful payments in last 24h          |
| `metrics.failedSessions`             | integer | Failed payment sessions in last 24h      |
| `metrics.refundRate`                 | number  | Refund rate over last 7 days (0.0-1.0)   |
| `metrics.pendingRefunds`             | integer | Refunds awaiting processing              |
| `metrics.criticalEvents`             | integer | Critical payment events in last 24h      |
| `metrics.gmv24h`                     | integer | Gross merchandise value (cents) in 24h   |
| `metrics.commission24h`              | integer | Platform commission (cents) in 24h       |
| `metrics.ledgerEntries24h`           | integer | Ledger entries created in last 24h       |
| `metrics.totalOrders7d`              | integer | Total orders in last 7 days              |
| `metrics.refundedOrders7d`           | integer | Refunded orders in last 7 days           |
| `queue.pending`                      | integer | Background jobs waiting in queue         |
| `queue.processing`                   | integer | Background jobs currently processing     |
| `queue.dead`                         | integer | Failed jobs in dead letter queue         |
| `circuitBreakers`                    | object  | Circuit breaker states per service       |

#### Errors

| Status | Code                      | Description                              |
|--------|---------------------------|------------------------------------------|
| 401    | `UNAUTHENTICATED`         | No valid session                         |
| 403    | `INSUFFICIENT_PERMISSION` | User lacks `analytics.read` or admin role|
| 500    | `INTERNAL_ERROR`          | Failed to fetch payment health metrics   |

#### Example

```bash
curl "https://yourdomain.com/api/payment-health" \
  -H "Cookie: sb-xxx-auth-token=..."
```

---

### GET /api/performance

Returns real-time performance metrics for the admin dashboard. Supports
both JSON and Prometheus exposition formats.

#### Purpose

Provides system performance data including API latencies, cache hit rates,
slow queries, recent errors, and performance targets. Used for monitoring
and alerting.

#### Authentication

| Requirement | Value                          |
|-------------|--------------------------------|
| Auth        | Required (session cookie)      |
| Permission  | `analytics.read` (ADMIN_READ)  |
| Roles       | admin, super_admin             |

#### Rate Limit

Uses default API rate limit (`RATE_LIMITS.API_DEFAULT`).

#### Request

```
GET /api/performance?format=json
GET /api/performance?format=prometheus
Cookie: <supabase-session>
```

**Query Parameters**:

| Parameter | Type   | Required | Default | Constraints              |
|-----------|--------|----------|---------|--------------------------|
| `format`  | string | No       | `json`  | `json` or `prometheus`   |

#### Response

**200 OK** (JSON format):

```json
{
  "snapshot": {
    "api": {
      "p95LatencyMs": 180,
      "p99LatencyMs": 420,
      "errorRate": 0.005,
      "requestCount": 12500
    },
    "database": {
      "p95LatencyMs": 35,
      "slowQueryCount": 2
    },
    "cache": {
      "hitRate": 0.87,
      "missRate": 0.13,
      "evictionCount": 50
    },
    "memory": {
      "heapUsedMb": 128,
      "heapTotalMb": 256,
      "rssMb": 310
    }
  },
  "cache": {
    "hits": 15000,
    "misses": 2200,
    "hitRate": 0.87,
    "size": 450
  },
  "slowQueries": [
    {
      "query": "SELECT * FROM orders WHERE ...",
      "durationMs": 520,
      "timestamp": "2025-03-04T11:55:00.000Z"
    }
  ],
  "recentErrors": [
    {
      "message": "Connection timeout",
      "code": "DB_CONNECTION_ERROR",
      "timestamp": "2025-03-04T11:50:00.000Z"
    }
  ],
  "performanceTargets": {
    "api": {
      "p95LatencyMs": { "target": 250, "current": 180 },
      "p99LatencyMs": { "target": 500, "current": 420 },
      "errorRate": { "target": 0.01, "current": 0.005 }
    },
    "database": {
      "p95LatencyMs": { "target": 50, "current": 35 },
      "slowQueryCount": { "target": 0, "current": 2 }
    },
    "cache": {
      "hitRate": { "target": 0.8, "current": 0.87 }
    },
    "coreWebVitals": {
      "ttfb": { "target": 200, "unit": "ms" },
      "lcp": { "target": 2500, "unit": "ms" },
      "cls": { "target": 0.1, "unit": "score" },
      "inp": { "target": 200, "unit": "ms" }
    }
  }
}
```

**200 OK** (Prometheus format):

```
Content-Type: text/plain; version=0.0.4

# HELP vt_api_p95_latency_ms API p95 latency in milliseconds
# TYPE vt_api_p95_latency_ms gauge
vt_api_p95_latency_ms 180
vt_api_p99_latency_ms 420
vt_api_error_rate 0.005
vt_db_p95_latency_ms 35
vt_db_slow_query_count 2
vt_cache_hit_rate 0.87
vt_cache_miss_rate 0.13
vt_queue_pending 4
vt_queue_processing 1
vt_queue_dead 0
vt_memory_heap_used_mb 128
vt_memory_heap_total_mb 256
vt_memory_rss_mb 310
```

Prometheus metric prefixes: `vt_api_*`, `vt_db_*`, `vt_cache_*`, `vt_queue_*`,
`vt_memory_*`.

#### Errors

| Status | Code                      | Description                              |
|--------|---------------------------|------------------------------------------|
| 401    | `UNAUTHENTICATED`         | No valid session                         |
| 403    | `INSUFFICIENT_PERMISSION` | User lacks admin access                  |
| 500    | `INTERNAL_ERROR`          | Unexpected server error                  |

#### Example

```bash
# JSON format
curl "https://yourdomain.com/api/performance?format=json" \
  -H "Cookie: sb-xxx-auth-token=..."

# Prometheus format (for Grafana/Prometheus scraping)
curl "https://yourdomain.com/api/performance?format=prometheus" \
  -H "Cookie: sb-xxx-auth-token=..."
```

---

### GET /api/health

System health check endpoint for load balancers and orchestration platforms.

#### Purpose

Returns the overall system health status by checking database connectivity,
Redis availability, and memory usage. Designed for Kubernetes liveness/readiness
probes and load balancer health checks.

#### Authentication

| Requirement | Value          |
|-------------|----------------|
| Auth        | None (public)  |
| Permission  | None           |

#### Rate Limit

Uses default API rate limit (`RATE_LIMITS.API_DEFAULT`).

#### Request

```
GET /api/health
```

No parameters. No authentication required.

#### Response

**200 OK** -- System is healthy:

```json
{
  "status": "healthy",
  "timestamp": "2025-03-04T12:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 12
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 3
    },
    "memory": {
      "status": "healthy",
      "heapUsedMb": 128,
      "heapTotalMb": 256
    }
  }
}
```

**200 OK** -- System is degraded:

```json
{
  "status": "degraded",
  "timestamp": "2025-03-04T12:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 45
    },
    "redis": {
      "status": "degraded",
      "latencyMs": 150,
      "message": "High latency"
    },
    "memory": {
      "status": "healthy",
      "heapUsedMb": 128,
      "heapTotalMb": 256
    }
  }
}
```

**503 Service Unavailable** -- System is unhealthy:

```json
{
  "status": "unhealthy",
  "timestamp": "2025-03-04T12:00:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "checks": {
    "database": {
      "status": "unhealthy",
      "error": "Connection refused"
    },
    "redis": {
      "status": "unhealthy",
      "error": "ECONNREFUSED"
    },
    "memory": {
      "status": "healthy",
      "heapUsedMb": 128,
      "heapTotalMb": 256
    }
  }
}
```

| Field         | Type   | Description                              |
|---------------|--------|------------------------------------------|
| `status`      | string | `healthy`, `degraded`, or `unhealthy`    |
| `timestamp`   | string | ISO 8601 timestamp                       |
| `uptime`      | number | Process uptime in seconds                |
| `version`     | string | Application version                      |
| `checks`      | object | Individual service health checks         |

#### Status Code Mapping

| `status` value | HTTP Status | Load Balancer Action |
|-----------------|-------------|----------------------|
| `healthy`       | 200         | Route traffic         |
| `degraded`      | 200         | Route traffic (warn)  |
| `unhealthy`     | 503         | Stop routing          |

#### Example

```bash
curl "https://yourdomain.com/api/health"
```

---

### GET /api/cron/cache-warming

Scheduled job that pre-warms the Redis cache with featured products,
categories, and seller profiles.

#### Purpose

Reduces cold-start latency by loading frequently accessed data into the
Redis cache before it is requested. Runs every 6 hours.

#### Authentication

| Requirement | Value                                  |
|-------------|----------------------------------------|
| Auth        | `CRON_SECRET` Bearer token             |
| Header      | `Authorization: Bearer <CRON_SECRET>`  |

In non-production environments, the token check is skipped if `CRON_SECRET`
is not set.

#### Rate Limit

None. Cron endpoints are not rate-limited.

#### Request

```
GET /api/cron/cache-warming
Authorization: Bearer <CRON_SECRET>
```

#### Configuration

| Setting        | Value   | Description                       |
|----------------|---------|-----------------------------------|
| `dynamic`      | `force-dynamic` | Prevents Next.js from caching |
| `maxDuration`  | 300     | Maximum execution time (seconds)  |

#### Response

**200 OK** -- Cache warming succeeded:

```json
{
  "status": "ok",
  "task": "cache_warming",
  "timestamp": "2025-03-04T06:00:00.000Z"
}
```

**401 Unauthorized** -- Missing or invalid CRON_SECRET:

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error** -- Cache warming failed:

```json
{
  "status": "error",
  "task": "cache_warming",
  "error": "Error message details"
}
```

#### Example

```bash
curl "https://yourdomain.com/api/cron/cache-warming" \
  -H "Authorization: Bearer your-cron-secret-value"
```

---

### GET /api/cron/reconciliation

Scheduled job that reconciles all pending payments with Stripe to ensure
data consistency between the application database and Stripe's records.

#### Purpose

Runs daily to detect and resolve discrepancies between local payment records
and Stripe. Ensures no payments are lost or incorrectly recorded.

#### Authentication

| Requirement | Value                                  |
|-------------|----------------------------------------|
| Auth        | `CRON_SECRET` Bearer token             |
| Header      | `Authorization: Bearer <CRON_SECRET>`  |

#### Rate Limit

None. Cron endpoints are not rate-limited.

#### Request

```
GET /api/cron/reconciliation
Authorization: Bearer <CRON_SECRET>
```

#### Configuration

| Setting        | Value   | Description                       |
|----------------|---------|-----------------------------------|
| `dynamic`      | `force-dynamic` | Prevents Next.js from caching |
| `maxDuration`  | 300     | Maximum execution time (seconds)  |

#### Response

**200 OK** -- Reconciliation completed:

```json
{
  "status": "ok",
  "task": "reconciliation",
  "timestamp": "2025-03-04T02:00:00.000Z",
  "reconciled": 0,
  "discrepancies": 0
}
```

| Field           | Type    | Description                              |
|-----------------|---------|------------------------------------------|
| `reconciled`    | integer | Number of records reconciled             |
| `discrepancies` | integer | Number of discrepancies found            |

**401 Unauthorized** -- Missing or invalid CRON_SECRET:

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error** -- Reconciliation failed:

```json
{
  "status": "error",
  "task": "reconciliation",
  "error": "Error message details"
}
```

#### Example

```bash
curl "https://yourdomain.com/api/cron/reconciliation" \
  -H "Authorization: Bearer your-cron-secret-value"
```

---

### GET /api/cron/health-check

Scheduled job that verifies system health by testing database connectivity
and recording latency metrics.

#### Purpose

Runs every 5 minutes to verify database connectivity and record performance
metrics. Provides early warning for infrastructure issues.

#### Authentication

| Requirement | Value                                  |
|-------------|----------------------------------------|
| Auth        | `CRON_SECRET` Bearer token             |
| Header      | `Authorization: Bearer <CRON_SECRET>`  |

#### Rate Limit

None. Cron endpoints are not rate-limited.

#### Request

```
GET /api/cron/health-check
Authorization: Bearer <CRON_SECRET>
```

#### Configuration

| Setting        | Value   | Description                       |
|----------------|---------|-----------------------------------|
| `dynamic`      | `force-dynamic` | Prevents Next.js from caching |

#### Response

**200 OK** -- Health check passed:

```json
{
  "status": "ok",
  "task": "health_check",
  "timestamp": "2025-03-04T12:00:00.000Z"
}
```

**200 OK** -- Degraded (database reachable but slow/erroring):

```json
{
  "status": "degraded",
  "timestamp": "2025-03-04T12:00:00.000Z",
  "database": {
    "status": "error",
    "latencyMs": 5000,
    "error": "connection timeout"
  }
}
```

**401 Unauthorized** -- Missing or invalid CRON_SECRET:

```json
{
  "error": "Unauthorized"
}
```

**500 Internal Server Error** -- Health check failed:

```json
{
  "status": "error",
  "task": "health_check",
  "error": "Error message details"
}
```

#### Example

```bash
curl "https://yourdomain.com/api/cron/health-check" \
  -H "Authorization: Bearer your-cron-secret-value"
```

---

## Server Actions

Server Actions are Next.js RPC functions invoked from client components via
form actions or `useServerAction` hooks. They execute on the server and
bypass the HTTP API layer. Authentication is handled identically to API
routes using `requireAuth`.

### Common Response Format

All server actions return a result object:

```typescript
// Success
{ success: true }
{ success: true, deletedCount: number }

// Error
{ error: string }
```

---

### Admin Actions

Source: `src/app/actions/admin-actions.ts`

Admin actions require elevated privileges and are restricted to admin and
super_admin roles.

---

#### toggleAdminStatus

Grants or revokes admin privileges for a user.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `users.manage`                  |
| Role           | admin, super_admin only         |
| Audit          | Yes (TOGGLE_ADMIN_STATUS)       |

**Parameters**:

| Parameter  | Type    | Required | Description                    |
|------------|---------|----------|--------------------------------|
| `userId`   | string  | Yes      | UUID of the target user        |
| `makeAdmin`| boolean | Yes      | `true` to promote, `false` to demote |

**Return**:

```typescript
// Success
{ success: true }

// Error
{ error: "Access denied. Required permission: users.manage..." }
{ error: "User not found" }
```

**Example**:

```typescript
import { toggleAdminStatus } from '@/app/actions/admin-actions';

const result = await toggleAdminStatus(
  '550e8400-e29b-41d4-a716-446655440000',
  true
);
```

---

#### updateSellerStatus

Approves, rejects, or resets a seller's application status.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `users.manage`                  |
| Role           | admin, super_admin only         |
| Audit          | Yes (UPDATE_SELLER_STATUS)      |

**Parameters**:

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `userId`  | string | Yes      | UUID of the seller user                  |
| `status`  | string | Yes      | `'approved'`, `'rejected'`, or `'pending'`|

**Return**:

```typescript
{ success: true }
{ error: string }
```

**Example**:

```typescript
import { updateSellerStatus } from '@/app/actions/admin-actions';

const result = await updateSellerStatus(
  '660e8400-e29b-41d4-a716-446655440001',
  'approved'
);
```

---

#### purgeAllUsers

Deletes all user accounts except the requesting admin. This is a destructive
operation with a confirmation guard requiring the caller's own user ID.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `users.delete`                  |
| Role           | admin, super_admin only         |
| Audit          | Yes (PURGE_ALL_USERS, CRITICAL) |

**Parameters**:

| Parameter        | Type   | Required | Description                              |
|------------------|--------|----------|------------------------------------------|
| `currentUserId`  | string | Yes      | Must match the authenticated user's ID   |

**Return**:

```typescript
{ success: true, deletedCount: 42 }
{ error: "User identity mismatch." }
{ error: string }
```

**Security**: The `currentUserId` parameter must exactly match the
authenticated user's ID. This prevents accidental invocation without
explicit confirmation.

---

#### adminDeleteProduct

Deletes a product from the catalog. Used by administrators to remove
products that violate marketplace policies.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `products.delete`               |
| Role           | admin, super_admin only         |
| Audit          | Yes (ADMIN_DELETE_PRODUCT)      |

**Parameters**:

| Parameter   | Type   | Required | Description              |
|-------------|--------|----------|--------------------------|
| `productId` | string | Yes      | UUID of the product      |

**Return**:

```typescript
{ success: true }
{ error: string }
```

---

#### processRefundDecision

Approves or rejects a buyer's refund request. Triggers a Stripe refund
if approved.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `refunds.manage`                |
| Role           | admin, super_admin only         |
| Audit          | Yes (PROCESS_REFUND)            |

**Parameters**:

| Parameter  | Type   | Required | Description                    |
|------------|--------|----------|--------------------------------|
| `orderId`  | string | Yes      | UUID of the order              |
| `decision` | string | Yes      | `'approved'` or `'rejected'`   |

**Return**:

```typescript
// The result from adminService.processRefundDecision
{ success: true, refundId?: string }
{ error: string }
```

**Example**:

```typescript
import { processRefundDecision } from '@/app/actions/admin-actions';

const result = await processRefundDecision(
  '770e8400-e29b-41d4-a716-446655440002',
  'approved'
);
```

---

### Buyer Actions

Source: `src/app/actions/buyer-actions.ts`

Buyer actions are available to authenticated buyers and include ownership
verification to prevent horizontal privilege escalation.

---

#### requestRefund

Submits a refund request for an order. The buyer must own the order
(unless they are an admin).

| Property       | Value                              |
|----------------|-------------------------------------|
| Permission     | `orders.refund`                     |
| Role           | buyer, seller, admin, super_admin   |
| Ownership      | Verified (buyer must own the order) |
| Audit          | Yes (REFUND_REQUEST / REFUND_REQUEST_OWNERSHIP_VIOLATION) |

**Parameters**:

| Parameter | Type   | Required | Description                       |
|-----------|--------|----------|-----------------------------------|
| `orderId` | string | Yes      | UUID of the order                 |
| `reason`  | string | Yes      | Refund reason (max 1000 chars)    |

**Return**:

```typescript
{ success: true }
{ error: "Order not found." }
{ error: "You do not own this order." }
{ error: string }
```

**Security**: Non-admin users can only request refunds for their own orders.
Admins bypass the ownership check.

**Example**:

```typescript
import { requestRefund } from '@/app/actions/buyer-actions';

const result = await requestRefund(
  '770e8400-e29b-41d4-a716-446655440002',
  'Product arrived damaged. Photos attached.'
);
```

---

#### updateCartItem

Updates the quantity of a cart item. If quantity is set to less than 1,
the item is removed from the cart instead.

| Property       | Value                                |
|----------------|--------------------------------------|
| Permission     | `cart.manage`                         |
| Role           | buyer, seller, super_admin            |
| Ownership      | Verified (buyer must own the cart item)|
| Audit          | Yes (CART_UPDATE_OWNERSHIP_VIOLATION) |

**Parameters**:

| Parameter     | Type    | Required | Description                        |
|---------------|---------|----------|------------------------------------|
| `cartItemId`  | string  | Yes      | UUID of the cart item              |
| `quantity`    | number  | Yes      | New quantity (0-100; 0 removes item)|

**Return**:

```typescript
{ success: true }
{ error: "You do not own this cart item." }
{ error: string }
```

**Behavior**:

- `quantity >= 1`: Updates the cart item quantity.
- `quantity < 1`: Removes the cart item entirely.

**Example**:

```typescript
import { updateCartItem } from '@/app/actions/buyer-actions';

// Update quantity
const result = await updateCartItem('880e8400-...', 3);

// Remove item (quantity = 0)
const result = await updateCartItem('880e8400-...', 0);
```

---

#### removeCartItem

Removes a cart item entirely from the buyer's cart.

| Property       | Value                                |
|----------------|--------------------------------------|
| Permission     | `cart.manage`                         |
| Role           | buyer, seller, super_admin            |
| Ownership      | Verified (buyer must own the cart item)|
| Audit          | Yes (CART_DELETE_OWNERSHIP_VIOLATION) |

**Parameters**:

| Parameter     | Type   | Required | Description              |
|---------------|--------|----------|--------------------------|
| `cartItemId`  | string | Yes      | UUID of the cart item    |

**Return**:

```typescript
{ success: true }
{ error: "You do not own this cart item." }
{ error: string }
```

**Example**:

```typescript
import { removeCartItem } from '@/app/actions/buyer-actions';

const result = await removeCartItem('880e8400-e29b-41d4-a716-446655440003');
```

---

### Seller Actions

Source: `src/app/actions/seller-actions.ts`

Seller actions are restricted to approved sellers and administrators. They
include product and order management capabilities.

---

#### upsertProduct

Creates a new product or updates an existing product. When `existingProductId`
is provided, the action performs an update; otherwise, it creates a new product.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `products.write`                |
| Role           | seller, admin, super_admin only |
| Audit          | Implicit via service layer      |

**Parameters**:

| Parameter              | Type    | Required | Description                           |
|------------------------|---------|----------|---------------------------------------|
| `productData`          | object  | Yes      | Product data object                   |
| `productData.title`    | string  | Yes      | 1-200 chars, SQL injection safe       |
| `productData.category` | string  | No       | Max 100 chars, alphanumeric           |
| `productData.description`| string | Yes      | 1-5000 chars, SQL injection safe      |
| `productData.price_cents`| number | Yes      | 50-10,000,000 (cents)                 |
| `productData.status`   | string  | Yes      | `'active'` or `'draft'`               |
| `productData.image_url`| string  | Yes      | Valid URL (http/https only)           |
| `existingProductId`    | string  | No       | UUID of existing product to update    |

**Return**:

```typescript
{ success: true }
{ error: string }
```

**Validation** (`CreateProductSchema`):

| Field          | Constraints                                       |
|----------------|---------------------------------------------------|
| `title`        | 1-200 chars, trimmed, no SQL injection patterns   |
| `category`     | Optional, max 100 chars, `[a-zA-Z0-9\s\-&]` only |
| `description`  | 1-5000 chars, trimmed, no SQL injection patterns  |
| `price_cents`  | Integer, 50 - 10,000,000                          |
| `status`       | Enum: `'active'` or `'draft'`                     |
| `image_url`    | Valid URL, http/https only, no javascript:/data: schemes |

**Example**:

```typescript
import { upsertProduct } from '@/app/actions/seller-actions';

// Create new product
const result = await upsertProduct({
  title: 'Wireless Headphones Pro',
  category: 'Electronics',
  description: 'Premium noise-cancelling wireless headphones...',
  price_cents: 7999,
  status: 'active',
  image_url: 'https://storage.example.com/images/headphones.jpg',
});

// Update existing product
const result = await upsertProduct(
  {
    title: 'Wireless Headphones Pro v2',
    category: 'Electronics',
    description: 'Updated description...',
    price_cents: 8999,
    status: 'active',
    image_url: 'https://storage.example.com/images/headphones-v2.jpg',
  },
  '550e8400-e29b-41d4-a716-446655440000'  // existingProductId
);
```

---

#### updateOrderStatus

Updates the status of an order. Sellers can only update orders for their
own products; admins can update any order.

| Property       | Value                           |
|----------------|---------------------------------|
| Permission     | `orders.manage`                 |
| Role           | seller, admin, super_admin only |
| Audit          | Implicit via service layer      |

**Parameters**:

| Parameter                      | Type   | Required | Description                          |
|--------------------------------|--------|----------|--------------------------------------|
| `orderId`                      | string | Yes      | UUID of the order                    |
| `updateData`                   | object | Yes      | Update data object                   |
| `updateData.status`            | string | Yes      | `'pending'`, `'shipped'`, `'delivered'`, or `'refunded'` |
| `updateData.tracking_number`   | string | No       | Max 100 chars, `[a-zA-Z0-9\-_]` only|
| `updateData.carrier`           | string | No       | Max 100 chars, `[a-zA-Z0-9\s\-]` only|

**Return**:

```typescript
{ success: true }
{ error: string }
```

**Valid Status Transitions**:

| Current Status | Allowed Transitions                     |
|----------------|-----------------------------------------|
| `pending`      | `shipped`, `refunded`                   |
| `shipped`      | `delivered`, `refunded`                 |
| `delivered`    | `refunded`                              |
| `refunded`     | (none -- terminal state)                |

**Example**:

```typescript
import { updateOrderStatus } from '@/app/actions/seller-actions';

// Mark order as shipped with tracking
const result = await updateOrderStatus(
  '770e8400-e29b-41d4-a716-446655440002',
  {
    status: 'shipped',
    tracking_number: '1Z999AA10123456784',
    carrier: 'UPS',
  }
);
```

---

## Appendix: Error Codes

### Complete Error Code Reference

| Code                                | HTTP Status | Class               | Description                              |
|-------------------------------------|-------------|----------------------|------------------------------------------|
| `VALIDATION_FAILED`                 | 400         | ValidationError      | Input validation failed                  |
| `INVALID_INPUT`                     | 400         | AppError             | Invalid input data                       |
| `INVALID_STATE`                     | 400         | AppError             | Invalid state transition                 |
| `UNAUTHENTICATED`                   | 401         | AuthenticationError  | No valid session                         |
| `SESSION_EXPIRED`                   | 401         | AuthenticationError  | Session has expired                      |
| `PROFILE_NOT_FOUND`                 | 403         | AuthenticationError  | User profile missing                     |
| `INSUFFICIENT_PERMISSION`           | 403         | AuthorizationError   | Lacks required permission                |
| `INSUFFICIENT_ROLE`                 | 403         | AuthorizationError   | Lacks required role                      |
| `ADMIN_REQUIRED`                    | 403         | AuthorizationError   | Admin role required                      |
| `SELLER_REQUIRED`                   | 403         | AuthorizationError   | Seller role required                     |
| `OWNERSHIP_VIOLATION`               | 403         | AuthorizationError   | User does not own the resource           |
| `ORDER_INVOLVEMENT_VIOLATION`       | 403         | AuthorizationError   | User is not involved in the order        |
| `NOT_FOUND`                         | 404         | NotFoundError        | Resource not found                       |
| `DB_NOT_FOUND`                      | 404         | NotFoundError        | Database record not found                |
| `CONFLICT`                          | 409         | ConflictError        | Resource conflict                        |
| `ALREADY_EXISTS`                    | 409         | ConflictError        | Resource already exists                  |
| `DB_CONSTRAINT_VIOLATION`           | 409         | DatabaseError        | PostgreSQL constraint violation          |
| `PAYMENT_STRIPE_RATE_LIMIT`         | 429         | PaymentError         | Stripe API rate limit hit                |
| `DB_ERROR`                          | 500         | DatabaseError        | General database error                   |
| `DB_CONNECTION_ERROR`               | 500         | DatabaseError        | Database connection failure              |
| `DB_RPC_FAILED`                     | 500         | DatabaseError        | PostgreSQL RPC call failed               |
| `PAYMENT_STRIPE_ERROR`              | 500         | PaymentError         | General Stripe API error                 |
| `PAYMENT_STRIPE_REFUND_FAILED`      | 500         | PaymentError         | Stripe refund failed                     |
| `PAYMENT_INVALID_AMOUNT`            | 500         | PaymentError         | Invalid payment amount                   |
| `PAYMENT_INVALID_CURRENCY`          | 500         | PaymentError         | Invalid currency                         |
| `PAYMENT_INVALID_COMMISSION`        | 500         | PaymentError         | Commission calculation error             |
| `PAYMENT_SESSION_EXPIRED`           | 500         | PaymentError         | Payment session has expired              |
| `PAYMENT_CART_MISMATCH`             | 500         | PaymentError         | Cart does not match payment session      |
| `PAYMENT_INSUFFICIENT_STOCK`        | 500         | PaymentError         | Insufficient stock for checkout          |
| `PAYMENT_SELLER_NOT_CONNECTED`      | 500         | PaymentError         | Seller has not connected Stripe          |
| `PAYMENT_PRICE_MISMATCH`            | 500         | PaymentError         | Stripe amount != session amount          |
| `INTERNAL_ERROR`                    | 500         | AppError             | Unexpected internal error                |
| `SERVICE_UNAVAILABLE`               | 503         | AppError             | Service temporarily unavailable          |

---

## Appendix: Rate Limit Configurations

### Complete Rate Limit Table

| Key              | Sustained Limit      | Burst Limit           | Key Prefix        | Scope    |
|------------------|----------------------|-----------------------|-------------------|----------|
| `LOGIN`          | 5 / 15 min           | 3 / 1 min             | `auth:login`      | Per-user |
| `SIGNUP`         | 3 / 1 hour           | 1 / 1 min             | `auth:signup`     | Per-IP   |
| `PASSWORD_RESET` | 3 / 1 hour           | 1 / 5 min             | `auth:password-reset` | Per-user |
| `CHECKOUT`       | 10 / 1 hour          | 3 / 1 min             | `payment:checkout`| Per-user |
| `REFUND`         | 5 / 1 hour           | 2 / 5 min             | `payment:refund`  | Per-user |
| `PAYMENT_HEALTH` | 30 / 1 min           | -                     | `payment:health`  | Per-user |
| `AI_GENERATE`    | 10 / 1 hour          | 3 / 1 min             | `ai:generate`     | Per-user |
| `SEARCH`         | 60 / 1 min           | 20 / 10 sec           | `search`          | Per-IP   |
| `CHAT_SEND`      | 30 / 1 min           | 10 / 10 sec           | `chat:send`       | Per-user |
| `CART_UPDATE`    | 60 / 1 min           | 20 / 10 sec           | `cart:update`     | Per-user |
| `UPLOAD`         | 10 / 1 hour          | 3 / 1 min             | `upload`          | Per-user |
| `ADMIN_ACTION`   | 30 / 1 min           | 10 / 10 sec           | `admin:action`    | Per-user |
| `API_DEFAULT`    | 100 / 1 min          | 30 / 10 sec           | `api:default`     | Per-IP   |

### Implementation Notes

- Rate limiting uses an in-memory sliding window counter per process.
- For multi-instance deployments, replace with Redis/Upstash for distributed
  rate limiting.
- Memory cleanup runs every 60 seconds, removing expired entries.
- Expected memory usage: under 1MB for 10,000 active rate limit keys.
- The `RateLimitResult` object includes `remaining` and `resetAt` for
  building client-side rate limit awareness.

---

## Appendix: DTO Validation Schemas

### Summary of All Zod Schemas

| Schema                            | Used By                          | Key Constraints                     |
|-----------------------------------|----------------------------------|-------------------------------------|
| `CheckoutItemSchema`              | `/api/checkout/create-session`   | productId: UUID, quantity: 1-100    |
| `CheckoutSessionRequestSchema`    | `/api/checkout/create-session`   | items: 1-50 items                   |
| `SearchRequestSchema`             | `/api/products/search`           | q: max 200, minPrice <= maxPrice    |
| `CreateProductSchema`             | `upsertProduct` (create)         | title: 1-200, price: 50-10M cents  |
| `UpdateProductSchema`             | `upsertProduct` (update)         | All fields partial                  |
| `UpdateOrderStatusSchema`         | `updateOrderStatus`              | status: enum, tracking: alphanumeric|
| `RefundRequestSchema`             | `requestRefund`                  | orderId: UUID, reason: 1-1000 chars|
| `RefundDecisionSchema`            | `processRefundDecision`          | orderId: UUID, decision: enum       |
| `UpdateCartItemSchema`            | `updateCartItem`                 | cartItemId: UUID, quantity: 0-100   |
| `RemoveCartItemSchema`            | `removeCartItem`                 | cartItemId: UUID                    |
| `ToggleAdminSchema`               | `toggleAdminStatus`              | userId: UUID, makeAdmin: boolean    |
| `UpdateSellerStatusSchema`        | `updateSellerStatus`             | userId: UUID, status: enum          |
| `SendMessageSchema`               | Chat message sending             | conversationId: UUID, text: 1-2000  |
| `AIProductDescriptionRequestSchema`| AI product description          | productName: 1-200, tone: enum      |

### Security Features in All DTOs

- **UUID format validation** for all ID fields
- **SQL injection pattern rejection** on all text fields
- **HTML sanitization transformers** on text content
- **Length limits** on every string field
- **Strict enum validation** where applicable
- **URL scheme validation** (blocks `javascript:`, `data:` schemes)
- **Price range validation** (50 cents minimum, $100,000 maximum)

---

## Appendix: Webhook Event Processing Details

### payment_intent.succeeded Flow

```
Stripe Event
    |
    v
[1] Verify webhook signature
    |
    v
[2] Replay protection (5 min max age)
    |
    v
[3] Atomic idempotency check (audit_logs)
    |
    v
[4] Session verification (lookup by sessionId)
    |
    v
[5] Amount verification (Stripe vs session)
    |
    v
[6] Status check (must be 'pending')
    |
    v
[7] Expiry check (must not be expired)
    |
    v
[8] Atomic fulfillment (PostgreSQL RPC)
    |
    v
[9] Queue background jobs (notifications, analytics)
    |
    v
[10] Log success
    |
    v (on failure at steps 4-9)
[AUTO-REFUND] Create Stripe refund
    |
    v
[AUTO-REFUND] Update session status to 'failed'
    |
    v
[AUTO-REFUND] Create ledger entry
    |
    v
[AUTO-REFUND] Create audit log entry
    |
    v (if auto-refund also fails)
[CRITICAL] Log manual intervention required
```

### charge.dispute.created Flow

```
Stripe Event
    |
    v
[1] Verify signature + idempotency
    |
    v
[2] Log CRITICAL severity
    |
    v
[3] Create dispute ledger entry
    |
    v
[4] Create audit log (CRITICAL severity)
```

---

*End of API Reference*
