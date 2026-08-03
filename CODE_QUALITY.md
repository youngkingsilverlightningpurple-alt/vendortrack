# CODE_QUALITY.md — VendorTrack Engineering Standards

> **Last Updated**: 2026-07-30
> **Scope**: All contributors, reviewers, and acquisition auditors

---

## 1. Architecture Principles

### 1.1 Separation of Concerns

Every module has a single, clear responsibility. Business logic is never mixed with UI rendering.

| Layer | Location | Responsibility |
|-------|----------|----------------|
| **Presentation** | `src/components/`, `src/app/*/page.tsx` | Rendering, user interaction, layout |
| **Service** | `src/services/` | Business logic, orchestration |
| **Repository** | `src/repositories/` | Database queries, data access |
| **Domain** | `src/domain/` | Domain entities, business rules, type transformations |
| **DTO** | `src/dto/` | Zod validation schemas, request/response types |
| **Validators** | `src/validators/` | Pure validation functions |
| **Infrastructure** | `src/lib/` | Auth, cache, errors, logger, payment, performance, security, monitoring |
| **API Routes** | `src/app/api/` | HTTP endpoints, request/response handling |
| **Server Actions** | `src/app/actions/` | Server-side mutations |
| **AI** | `src/ai/` | Genkit flows, Gemini integration |
| **Types** | `src/types/` | Shared TypeScript types |

### 1.2 Data Flow

```
Supabase Row (snake_case) → Repository → Domain Type (camelCase) → UI Component
```

- **Database rows** use `snake_case` (e.g., `created_at`, `price_cents`)
- **Domain types** use `camelCase` (e.g., `createdAt`, `priceCents`)
- **Transformation functions** (`profileRowToDomain`, `productRowToDomain`, etc.) bridge the gap
- **Never** pass raw Supabase rows to UI components

---

## 2. Folder Conventions

```
src/
├── app/                          # Next.js App Router
│   ├── actions/                  # Server Actions (admin, buyer, seller)
│   ├── admin-dashboard/          # Admin pages
│   ├── api/                      # API routes
│   │   ├── checkout/             # Stripe checkout session
│   │   ├── cron/                 # Vercel Cron jobs (cache-warming, health-check, reconciliation)
│   │   ├── health/               # Public health endpoint (load balancer)
│   │   ├── payment-health/       # Payment health metrics
│   │   ├── performance/          # Performance monitoring + Prometheus export
│   │   ├── products/search/      # Product search API
│   │   └── webhooks/stripe/      # Stripe webhook handler
│   ├── buyer-dashboard/          # Buyer pages (redirect)
│   ├── buyer-orders/             # Buyer order management
│   ├── cart/                     # Cart page + view
│   ├── checkout/                 # Checkout page + view
│   ├── seller-dashboard/         # Seller pages
│   │   ├── orders/               # Order management
│   │   ├── products/             # Product management + AI description generator
│   │   └── settings/             # Seller settings
│   └── ...                       # Other pages (marketplace, login, signup, etc.)
├── ai/                           # Genkit AI integration
│   ├── genkit.ts                 # Genkit configuration
│   ├── dev.ts                    # Development AI config
│   └── flows/                    # AI flows (product description generation)
├── components/
│   ├── ui/                       # shadcn/ui primitives (22 components)
│   ├── chat/                     # Order chat component
│   ├── layout/                   # AuthenticatedLayout, BottomNav
│   ├── providers/                # Supabase provider
│   └── *.tsx                     # Feature components (cart-item-controls, platform-revenue-chart, etc.)
├── domain/                       # Domain entities, types, business rules
│   └── index.ts                  # 8 entity types, 8 row types, 8 mappers, 6 business rules, 3 constants
├── dto/                          # Zod validation schemas
│   └── index.ts                  # 14 schemas (CheckoutSessionRequest, SearchRequest, etc.)
├── hooks/                        # Custom React hooks (use-mobile, use-toast, use-unread-messages)
├── lib/
│   ├── auth.ts                   # Auth utilities (requireAuth, isAuthError, logAuthEvent)
│   ├── cache/                    # Redis caching (redis-client.ts, index.ts)
│   ├── cache.ts                  # In-memory LRU cache
│   ├── db-monitoring.ts          # Database performance monitoring
│   ├── db-benchmark.ts           # Performance benchmarking
│   ├── env.ts                    # Environment validation (fail-fast)
│   ├── errors.ts                 # Unified AppError hierarchy with 30+ error codes
│   ├── logger/                   # Structured logging (JSON in production)
│   ├── monitoring/               # Sentry, OpenTelemetry, feature flags, production security
│   ├── payment/                  # Payment module (errors, ledger, queue, retry, refund, reconciliation)
│   ├── performance/              # Background jobs, monitor, middleware, query optimizer
│   ├── security/                 # CSRF, headers, rate-limit, sanitize, AI security, upload, security-logger
│   ├── rbac.ts                   # Role-based access control (5 roles, 17 permissions)
│   ├── seed-service.ts           # Demo data seeding
│   ├── supabase.ts               # Client-side Supabase
│   ├── supabase-admin.ts         # Server-side Supabase admin
│   └── utils.ts                  # Shared utilities (formatCurrency, cn, etc.)
├── repositories/                 # Data access layer (product, order, cart, user, payment-session, audit-log, chat)
├── services/                     # Business logic layer (checkout, admin, user, search, inventory, analytics, chat, notification)
├── types/
│   └── index.ts                  # Shared TypeScript types and transformations
├── validators/                   # Pure validation functions (8 validators)
│   └── index.ts                  # validateEmail, validatePrice, validateProductTitle, etc.
├── middleware/                    # API middleware
│   └── index.ts                  # API-specific middleware
├── __tests__/                    # Test suites
│   ├── architecture/             # Domain, DTO, validators, errors tests
│   ├── security/                 # OWASP, XSS, CSRF, rate-limiting, RBAC tests
│   ├── performance/              # Cache, latency, memory tests
│   └── smoke/                    # Live server smoke tests
├── instrumentation.ts            # Next.js instrumentation (startup: Sentry, OTel, security, graceful shutdown)
└── middleware.ts                  # Route protection middleware (4-layer: headers, CSRF, rate-limit, auth+RBAC)
```

---

## 3. Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| **React components** | PascalCase | `CheckoutView`, `DataTable` |
| **Component files** | kebab-case | `checkout-view.tsx`, `data-table.tsx` |
| **Page files** | `page.tsx` | Always `page.tsx` in route directory |
| **Library files** | kebab-case | `analytics-service.ts`, `user-repository.ts` |
| **Type/Interface names** | PascalCase | `UserProfile`, `ProductRow`, `CheckoutSessionRequest` |
| **Database row types** | PascalCase + `Row` suffix | `ProfileRow`, `ProductRow`, `OrderRow` |
| **DTO types** | PascalCase + `Request`/`Response` | `CheckoutSessionRequest`, `SearchResponse` |
| **Constants** | UPPER_SNAKE_CASE | `ORDER_STATUS_VARIANT`, `PAGE_SIZE` |
| **Functions** | camelCase | `formatCurrency`, `getErrorMessage` |
| **Transformation functions** | `rowTypeToDomain` | `profileRowToDomain`, `productRowToDomain` |
| **Hooks** | camelCase + `use` prefix | `useSupabase`, `useToast` |
| **API routes** | kebab-case directory | `create-session/route.ts`, `payment-health/route.ts` |
| **Environment variables** | UPPER_SNAKE_CASE | `NEXT_PUBLIC_SUPABASE_URL`, `STRIPE_SECRET_KEY` |

---

## 4. Type Strategy

### 4.1 Zero `any` Policy

The project has **zero** instances of:
- `any` type annotations
- `as any` casts
- `@ts-ignore` / `@ts-expect-error` comments
- `eslint-disable` suppression comments

### 4.2 Error Handling Pattern

```typescript
// WRONG — old pattern
catch (error: any) {
  toast({ description: error.message });
}

// CORRECT — new pattern
import { getErrorMessage } from '@/types';

catch (error: unknown) {
  toast({ description: getErrorMessage(error) });
}
```

### 4.3 Supabase Row → Domain Type Pattern

```typescript
// WRONG — old pattern
const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
setProfile(data as any);

// CORRECT — new pattern
import { type ProfileRow, profileRowToDomain } from '@/types';

const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
if (data) setProfile(profileRowToDomain(data as ProfileRow));
```

### 4.4 Badge Variant Pattern

```typescript
// WRONG — old pattern
<Badge variant={variant as any}>

// CORRECT — new pattern
import { ORDER_STATUS_VARIANT, type BadgeVariant } from '@/types';

const variant = ORDER_STATUS_VARIANT[status] as BadgeVariant;
<Badge variant={variant}>
```

### 4.5 TypeScript Configuration

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true
}
```

---

## 5. Error Handling

### 5.1 Structured Logging

```typescript
import { createLogger } from '@/lib/logger';

const log = createLogger('module-name');

// Info level
log.info('User logged in', { action: 'login', data: { userId: user.id } });

// Error level
log.error('Payment failed', { action: 'process-refund', traceId }, error);
```

### 5.2 Error Hierarchy

The application uses a unified `AppError` hierarchy (`src/lib/errors.ts`) with 30+ error codes:

```
AppError (base class)
├── ErrorCode enum:
│   ├── AUTH_*              — Authentication errors (UNAUTHORIZED, FORBIDDEN, SESSION_EXPIRED, etc.)
│   ├── PAYMENT_*           — Payment errors (CART_MISMATCH, PRICE_MISMATCH, SESSION_EXPIRED, etc.)
│   ├── VALIDATION_*        — Validation errors (INVALID_INPUT, INVALID_FORMAT, etc.)
│   ├── NOT_FOUND           — Resource not found
│   ├── RATE_LIMITED        — Rate limit exceeded
│   ├── CSRF_FAILED         — CSRF token validation failed
│   └── INTERNAL            — Internal server error
```

Each `AppError` includes:
- `code` — Machine-readable `ErrorCode` enum value
- `message` — Human-readable description (internal)
- `clientMessage` — Safe message for client response
- `httpStatus` — HTTP status code mapping
- `traceId` — Request correlation ID
- `context` — Structured metadata (`Record<string, unknown>`)
- `isRetryable` — Whether the operation can be retried

The payment module also has a specialized `PaymentLogger` (`src/lib/payment/errors.ts`) for structured payment event logging with severity levels (INFO, WARN, ERROR, CRITICAL).

### 5.3 Client-Safe Responses

API routes never expose internal error details to clients:

```typescript
catch (error: unknown) {
  log.error('Internal error', { action: 'endpoint' }, error);
  return NextResponse.json(
    { error: 'An internal error occurred. Please try again.' },
    { status: 500 }
  );
}
```

---

## 6. Shared Utilities

| Utility | Location | Purpose |
|---------|----------|---------|
| `formatCurrency(amount)` | `@/lib/utils` | Format number as USD |
| `formatDate(dateString)` | `@/lib/utils` | Format ISO date string |
| `truncate(str, maxLength)` | `@/lib/utils` | Truncate string with ellipsis |
| `cn(...inputs)` | `@/lib/utils` | Merge Tailwind classes |
| `getErrorMessage(error)` | `@/types` | Extract message from unknown error |
| `profileRowToDomain(row)` | `@/domain` | Transform ProfileRow → UserProfile |
| `productRowToDomain(row)` | `@/domain` | Transform ProductRow → Product |
| `orderRowToDomain(row)` | `@/domain` | Transform OrderRow → Order |
| `cartItemRowToDomain(row)` | `@/domain` | Transform CartItemRow → CartItem |
| `createLogger(module)` | `@/lib/logger` | Create scoped structured logger |
| `toAppError(error)` | `@/lib/errors` | Convert unknown error to AppError |
| `validateDto(schema, data)` | `@/dto` | Validate data against Zod schema |
| `requireAuth(options)` | `@/lib/auth` | Authenticate + authorize server action |
| `isFeatureEnabled(key)` | `@/lib/monitoring/feature-flags` | Check feature flag status |
| `measureApiLatency(fn)` | `@/lib/performance/monitor` | Measure API latency |
| `measureDbLatency(fn)` | `@/lib/performance/monitor` | Measure DB query latency |
| `captureException(error)` | `@/lib/monitoring/sentry` | Report error to Sentry |
| `traced(name, fn)` | `@/lib/monitoring/opentelemetry` | Create traced span |

---

## 7. Code Review Checklist

Before submitting any PR, verify:

- [ ] **Zero `any` types** — No `any`, `as any`, `@ts-ignore`, `eslint-disable`
- [ ] **Proper error handling** — `catch (error: unknown)` with `getErrorMessage()`
- [ ] **Row-to-domain transformations** — Use `profileRowToDomain()` etc., never `as any`
- [ ] **Structured logging** — Use `createLogger()`, never `console.log/error`
- [ ] **Shared utilities** — Use `formatCurrency` from `@/lib/utils`, not local copies
- [ ] **Type-safe Badge variants** — Use `ORDER_STATUS_VARIANT` / `REFUND_STATUS_VARIANT`
- [ ] **No Firebase references** — No `firebase`, `Firestore`, `storage.rules`
- [ ] **No dead code** — No unused imports, exports, or files
- [ ] **Component size** — Components under 300 lines; extract logic to services/repositories
- [ ] **Naming consistency** — Follow the naming conventions in Section 3
- [ ] **Build passes** — `npm run typecheck` and `npm run build` succeed with 0 errors
- [ ] **Security** — No secrets in code, proper env validation, no client-side admin access

---

## 8. Build Verification

The project enforces zero-error builds:

```bash
# TypeScript compilation
npm run typecheck

# Full build (includes TypeScript + ESLint)
npm run build

# Secret scanning
npm run secret-scan
```

The `next.config.js` has **both** suppressions disabled:
- `typescript.ignoreBuildErrors: false`
- `eslint.ignoreDuringBuilds: false`

---

## 9. Migration Notes

### Removed in Phase 6

| Item | Reason |
|------|--------|
| `FirebaseErrorListener.tsx` | Firebase artifact — imports non-existent `@/firebase/*` modules |
| `storage.rules` | Firebase Storage rules — project uses Supabase |
| `next.config.ts` | Empty duplicate of `next.config.js` |
| `studio.json` | Firebase Studio metadata |
| `metadata.json` | Firebase Studio import metadata |
| `src/functions/index.ts` | Deprecated Cloud Function stub |
| 11 unused shadcn/ui components | Never imported in application code |
| 12 unused npm dependencies | Only used by deleted UI components |
| 7 duplicate `formatCurrency` implementations | Replaced by shared `@/lib/utils` |
| 4 duplicate `DataTable` components | Replaced by shared `@/components/ui/data-table` |
| 106 `any` type usages | Replaced with proper types |
| 28+ `console.error/log` calls | Replaced with structured logger |

### Type Changes

| Before | After |
|--------|-------|
| `price_cents` (mixed) | `priceCents` (consistent camelCase) |
| `as any` on Badge | `as BadgeVariant` with `ORDER_STATUS_VARIANT` |
| `catch (err: any)` | `catch (error: unknown)` + `getErrorMessage()` |
| `Record<string, any>` | `ErrorContext`, `LogData`, `PaymentPayload`, etc. |
| `Promise<any>` | `Promise<SellerRevenueData>`, etc. |
| `LRUCache<any>` | `LRUCache<MarketplaceStats>`, etc. |
| Firestore timestamp `{ seconds, nanoseconds }` | ISO string `new Date(dateValue)` |
