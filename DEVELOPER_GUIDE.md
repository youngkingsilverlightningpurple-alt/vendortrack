# DEVELOPER_GUIDE.md -- VendorTrack Onboarding Guide

> **Audience**: New engineers joining the VendorTrack team.
> **Goal**: Be productive within one day.
> **Last Updated**: 2026-07-30

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Project Structure](#2-project-structure)
3. [Architecture](#3-architecture)
4. [Coding Standards](#4-coding-standards)
5. [Adding a New Feature](#5-adding-a-new-feature)
6. [Adding a New API Endpoint](#6-adding-a-new-api-endpoint)
7. [Adding a New Server Action](#7-adding-a-new-server-action)
8. [Database Migrations](#8-database-migrations)
9. [Testing](#9-testing)
10. [Debugging](#10-debugging)
11. [Environment Variables](#11-environment-variables)
12. [Git Workflow](#12-git-workflow)
13. [Code Review Checklist](#13-code-review-checklist)

---

## 1. Getting Started

### Prerequisites

Before you begin, ensure your workstation has the following tools installed. VendorTrack uses Node.js 20, and the build pipeline is pinned to that major version. Earlier or later majors will cause subtle runtime failures in the Stripe SDK and the Supabase SSR client.

| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20.x LTS | Runtime and build toolchain |
| npm | 10.x (bundled with Node 20) | Package management |
| Docker | 24.x | Redis cache, local production-like builds |
| Docker Compose | 2.20+ | Multi-container orchestration |
| Git | 2.40+ | Version control |
| Supabase CLI | 1.100+ | Database migrations and local Supabase |

Verify your environment:

```bash
node --version    # v20.x
npm --version     # 10.x
docker --version  # 24.x
docker compose version  # 2.20+
git --version     # 2.40+
```

### Clone and Install

```bash
# Clone the repository
git clone git@github.com:vendortrack/platform.git
cd platform

# Install dependencies
npm install
```

The project uses a lockfile (`package-lock.json`). Always run `npm install`, never `npm ci` or `yarn install`, to ensure deterministic dependency resolution.

### Configure Environment Variables

Copy the example environment file and fill in your credentials. The application will not start without the required variables due to the fail-fast validation in `src/lib/env.ts`.

```bash
cp .env.example .env.local
```

Open `.env.local` and provide values for every required variable. See [Section 11](#11-environment-variables) for the complete reference table. At minimum, you need:

- `NEXT_PUBLIC_SUPABASE_URL` -- your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` -- the public anon key
- `SUPABASE_SERVICE_ROLE_KEY` -- the server-side service role key (never expose to client)
- `STRIPE_SECRET_KEY` -- your Stripe test-mode secret key
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` -- your Stripe test-mode publishable key
- `STRIPE_WEBHOOK_SECRET` -- from your Stripe CLI webhook forwarder

The `GEMINI_API_KEY` is optional. If omitted, AI product description generation degrades gracefully and returns a user-facing message instead of crashing.

### Run the Development Server

```bash
npm run dev
```

The dev server starts on port 9002 by default (`next dev -p 9002`). Open `http://localhost:9002` in your browser. You should see the VendorTrack marketplace landing page.

### Run the Docker Stack (Redis + Worker)

For full-stack local development including Redis caching and the background worker:

```bash
# Start Redis and the worker container
npm run docker:dev

# Or start the full production-like stack
npm run docker:up
```

The Docker Compose stack includes three services: the Next.js application (`app`), Redis (`redis`), and a background worker (`worker`). Redis is required for the caching layer to function; without it, cache calls fall through to the database with a warning.

### Run Tests

```bash
# Run all unit tests
npm run test

# Run tests in watch mode during development
npm run test:watch

# Run with coverage report
npm run test:coverage

# Run smoke tests (requires a running server)
npm run test:smoke

# Run TypeScript type checking
npm run typecheck

# Run the full production build (includes TypeScript + ESLint)
npm run build
```

The build pipeline is strict: both `typescript.ignoreBuildErrors` and `eslint.ignoreDuringBuilds` are set to `false` in `next.config.js`. Any type error or lint violation will fail the build.

---

## 2. Project Structure

Below is the complete folder tree with explanations for every directory. Understanding this layout is essential because the architecture enforces strict dependency rules between layers.

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout (providers, fonts, globals)
│   ├── page.tsx                      # Home / landing page
│   ├── globals.css                   # Tailwind base styles + custom CSS
│   ├── favicon.ico                   # Site favicon
│   │
│   ├── api/                          # API Route Handlers (thin HTTP layer)
│   │   ├── checkout/
│   │   │   └── create-session/
│   │   │       └── route.ts          # POST /api/checkout/create-session
│   │   ├── products/
│   │   │   └── search/
│   │   │       └── route.ts          # GET /api/products/search
│   │   ├── webhooks/
│   │   │   └── stripe/
│   │   │       └── route.ts          # POST /api/webhooks/stripe
│   │   ├── payment-health/
│   │   │   └── route.ts              # GET /api/payment-health
│   │   ├── performance/
│   │   │   └── route.ts              # GET /api/performance
│   │   └── cron/                     # Scheduled job endpoints
│   │       ├── health-check/
│   │       │   └── route.ts          # Cron: health monitoring
│   │       ├── reconciliation/
│   │       │   └── route.ts          # Cron: payment reconciliation
│   │       └── cache-warming/
│   │           └── route.ts          # Cron: pre-warm caches
│   │
│   ├── actions/                      # Server Actions (thin auth gate)
│   │   ├── admin-actions.ts          # Admin mutations
│   │   ├── buyer-actions.ts          # Buyer mutations
│   │   └── seller-actions.ts         # Seller mutations
│   │
│   ├── admin-dashboard/              # Admin pages
│   │   ├── page.tsx                  # Admin overview
│   │   ├── users/page.tsx            # User management
│   │   ├── orders/page.tsx           # Order management
│   │   ├── refunds/page.tsx          # Refund management
│   │   └── products/page.tsx         # Product moderation
│   │
│   ├── buyer-dashboard/              # Buyer pages
│   │   └── page.tsx                  # Buyer overview with orders
│   │
│   ├── buyer-orders/                 # Buyer order management
│   │   ├── page.tsx                  # Order listing
│   │   ├── orders-data-table.tsx     # Order data table
│   │   ├── orders-columns.tsx        # Column definitions
│   │   └── refund-request-modal.tsx  # Refund request dialog
│   │
│   ├── seller-dashboard/             # Seller pages
│   │   ├── page.tsx                  # Seller overview
│   │   ├── orders/                   # Order management
│   │   ├── products/                 # Product management
│   │   │   ├── page.tsx              # Product listing
│   │   │   ├── product-form.tsx      # Create/edit product form
│   │   │   ├── data-table.tsx        # Product data table
│   │   │   ├── columns.tsx           # Column definitions
│   │   │   └── ai-generator-modal.tsx # AI description generator
│   │   └── settings/page.tsx         # Seller settings
│   │
│   ├── cart/                         # Cart page
│   │   ├── page.tsx                  # Cart page
│   │   └── cart-view.tsx             # Cart view component
│   │
│   ├── checkout/                     # Checkout page
│   │   ├── page.tsx                  # Checkout page
│   │   └── checkout-view.tsx         # Checkout view with Stripe
│   │
│   ├── login/page.tsx                # Login page
│   ├── signup/page.tsx               # Signup page
│   ├── marketplace/page.tsx          # Marketplace listing
│   ├── products/                     # Product pages
│   │   ├── page.tsx                  # Product listing
│   │   └── [id]/page.tsx             # Product detail
│   ├── store/[id]/page.tsx           # Seller store page
│   ├── sellers/[id]/page.tsx         # Seller profile
│   ├── help/page.tsx                 # Help page
│   ├── privacy-policy/page.tsx       # Privacy policy
│   ├── terms/page.tsx                # Terms of service
│   └── summary/page.tsx              # Platform summary
│
├── services/                         # Business Logic Layer
│   ├── checkout-service.ts           # Checkout workflow orchestration
│   ├── inventory-service.ts          # Product & order management
│   ├── user-service.ts               # User profile management
│   ├── admin-service.ts              # Admin operations
│   ├── search-service.ts             # Product search
│   ├── chat-service.ts               # Messaging
│   ├── notification-service.ts       # Notifications
│   ├── analytics-service.ts          # Marketplace analytics
│   └── index.ts                      # Barrel export
│
├── repositories/                     # Data Access Layer
│   ├── product-repository.ts         # Product CRUD + search + cache
│   ├── order-repository.ts           # Order CRUD + fulfillment
│   ├── user-repository.ts            # User profile CRUD
│   ├── cart-repository.ts            # Cart operations
│   ├── payment-session-repository.ts # Payment session CRUD
│   ├── audit-log-repository.ts       # Audit log + idempotency
│   ├── chat-repository.ts            # Conversations + messages
│   └── index.ts                      # Barrel export
│
├── domain/                           # Pure Business Domain
│   └── index.ts                      # Types, enums, mappers, business rules
│
├── dto/                              # Data Transfer Objects
│   └── index.ts                      # Zod schemas + validation helpers
│
├── validators/                       # Pure Validation Functions
│   └── index.ts                      # Business rule validators
│
├── middleware/                        # API Middleware
│   ├── api-middleware.ts             # Auth, validation, response helpers
│   └── index.ts                      # Barrel export
│
├── components/                        # UI Components
│   ├── ui/                           # shadcn/ui primitives (30+ components)
│   │   ├── button.tsx, card.tsx, ...
│   │   ├── data-table.tsx            # Shared DataTable component
│   │   └── ...
│   ├── chat/
│   │   └── order-chat.tsx            # Order chat component
│   ├── layout/
│   │   ├── authenticated-layout.tsx  # Auth-gated layout wrapper
│   │   └── bottom-nav.tsx            # Mobile bottom navigation
│   ├── providers/
│   │   └── supabase-provider.tsx     # Supabase client context
│   ├── cart-item-controls.tsx        # Cart item quantity controls
│   ├── logo.tsx                      # VendorTrack logo
│   ├── platform-revenue-chart.tsx    # Revenue chart (Recharts)
│   ├── seller-onboarding-progress.tsx # Seller onboarding wizard
│   └── system-health-widget.tsx      # Health status widget
│
├── hooks/                             # React Hooks
│   ├── use-mobile.tsx                # Responsive breakpoint detection
│   ├── use-toast.ts                  # Toast notification hook
│   └── use-unread-messages.ts        # Unread message count
│
├── types/                             # Backward-Compatible Re-exports
│   └── index.ts                      # Re-exports from @/domain
│
├── lib/                               # Infrastructure & Shared Utilities
│   ├── auth.ts                       # Authentication & authorization
│   ├── rbac.ts                       # Role-based access control
│   ├── env.ts                        # Environment variable validation
│   ├── errors.ts                     # Unified error hierarchy
│   ├── utils.ts                      # Utility functions (formatCurrency, cn)
│   ├── cache.ts                      # Legacy caching (deprecated, use cache/)
│   ├── supabase.ts                   # Client-side Supabase client
│   ├── supabase-admin.ts             # Server-side Supabase admin client
│   ├── seed-service.ts               # Demo data seeding
│   ├── analytics-service.ts          # Analytics data fetching
│   ├── db-monitoring.ts              # Database performance monitoring
│   ├── db-benchmark.ts               # Performance benchmarking
│   ├── placeholder-images.ts         # Placeholder image generation
│   ├── repositories/
│   │   └── user-repository.ts        # Legacy user repository (deprecated)
│   ├── logger/
│   │   └── index.ts                  # Structured logging (createLogger)
│   ├── cache/
│   │   ├── redis-client.ts           # Redis cache service
│   │   └── index.ts                  # Barrel export
│   ├── payment/
│   │   ├── errors.ts                 # Payment error classification
│   │   ├── ledger-service.ts         # Double-entry ledger
│   │   ├── queue.ts                  # Job queue
│   │   ├── refund-service.ts         # Refund workflow
│   │   ├── reconciliation-service.ts # Reconciliation
│   │   ├── retry.ts                  # Retry + circuit breaker
│   │   └── index.ts                  # Barrel export
│   ├── security/
│   │   ├── csrf.ts                   # CSRF protection
│   │   ├── headers.ts                # Security headers
│   │   ├── rate-limit.ts             # Rate limiting
│   │   ├── sanitize.ts               # Input sanitization
│   │   ├── upload.ts                 # File upload security
│   │   ├── ai-security.ts            # AI prompt injection detection
│   │   ├── security-logger.ts        # Security event logging
│   │   └── index.ts                  # Barrel export
│   ├── performance/
│   │   ├── monitor.ts                # Performance monitoring
│   │   ├── query-optimizer.ts        # Query optimization
│   │   ├── middleware.ts             # Performance middleware
│   │   ├── background-jobs.ts        # Background job processing
│   │   └── index.ts                  # Barrel export
│   └── monitoring/
│       ├── sentry.ts                 # Sentry integration
│       ├── opentelemetry.ts          # OpenTelemetry tracing
│       ├── feature-flags.ts          # Feature flag management
│       ├── production-security.ts    # Production security checks
│       └── index.ts                  # Barrel export
│
├── ai/                                # Genkit AI Flows
│   ├── genkit.ts                     # Genkit configuration
│   ├── dev.ts                        # Dev mode configuration
│   └── flows/
│       └── generate-product-description.ts  # AI product description
│
├── __tests__/                         # Test Suites
│   ├── architecture/                 # Architecture enforcement tests
│   │   ├── domain.test.ts            # Domain purity tests
│   │   ├── dto.test.ts               # DTO validation tests
│   │   ├── validators.test.ts        # Validator tests
│   │   └── errors.test.ts            # Error hierarchy tests
│   ├── smoke/
│   │   └── smoke.test.ts             # Production smoke tests
│   ├── security/
│   │   └── security.test.ts          # Security header tests
│   └── performance/
│       └── performance.test.ts       # Performance baseline tests
│
├── middleware.ts                      # Next.js middleware (route protection)
└── instrumentation.ts                # Next.js instrumentation (startup hooks)
```

### Key Directories Explained

**`src/app/`** -- This is the Next.js App Router. Every subdirectory maps to a URL route. Pages are defined in `page.tsx` files, layouts in `layout.tsx` files, and API routes in `route.ts` files. Server actions are organized in `src/app/actions/` and are the primary mechanism for mutations from the UI. API routes in `src/app/api/` handle external integrations (Stripe webhooks, cron jobs) and AJAX requests. Both API routes and server actions are thin: they handle authentication, validate input, delegate to the service layer, and return results.

**`src/services/`** -- The business logic layer. Services orchestrate workflows by calling repositories and applying business rules. They never access the database directly and never import from the presentation layer. A service coordinates one or more repositories to fulfill a use case, such as the checkout service which validates cart ownership, checks product availability, creates a Stripe PaymentIntent, and records a ledger entry.

**`src/repositories/`** -- The data access layer. Repositories are the only code that touches Supabase directly. Every query goes through a repository, and every repository returns domain types (camelCase), never raw database rows (snake_case). The mapping from snake_case rows to camelCase domain objects happens in the `rowToDomain` functions imported from `@/domain`. Repositories also integrate with the Redis cache layer for read-heavy operations.

**`src/domain/`** -- The pure business domain. This directory defines entity types, database row types, enums, row-to-domain mappers, and pure business rule functions. It has zero external dependencies: no Supabase, no Stripe, no React, no Node.js APIs. All other layers depend on the domain layer, and the domain layer depends on nothing.

**`src/dto/`** -- Data Transfer Objects with Zod validation schemas. Every request and response that crosses a boundary (API route, server action, external service) must be validated through a Zod schema defined here. This is the gatekeeper: no raw request body reaches business logic. DTOs also include security hardening such as SQL injection pattern detection, UUID format validation, and HTML sanitization transformers.

**`src/validators/`** -- Pure validation functions for business rules. These functions take domain objects and return structured validation results (`{ valid: boolean; reason?: string }`). They never perform I/O and never throw. Validators are used by the service layer to enforce business constraints such as product availability, seller payment eligibility, single-vendor checkout, and order status transitions.

**`src/lib/`** -- Infrastructure and shared utilities. This is the largest directory and contains all external service clients (Supabase, Redis, Stripe), security modules (CSRF, rate limiting, sanitization, AI security), payment infrastructure (ledger, queue, retry, reconciliation, refund), performance monitoring, structured logging, and the environment validation system. Infrastructure code has no business logic.

**`src/components/`** -- UI components built with shadcn/ui and Tailwind CSS. The `ui/` subdirectory contains shadcn/ui primitives (button, card, dialog, table, etc.). Business components are organized by feature (chat, layout, providers). Components are for rendering only; they delegate all business logic to services via server actions.

**`src/hooks/`** -- Custom React hooks. These encapsulate reusable client-side stateful logic such as responsive breakpoint detection, toast notifications, and unread message counts.

**`src/types/`** -- Backward-compatible re-exports from `@/domain`. New code should import directly from `@/domain`. Existing code that imports from `@/types` continues to work. This directory also houses payment-related types that have not yet been migrated to the domain layer.

**`src/middleware/`** -- Composable API middleware functions. These provide reusable `withAuth`, `withValidatedBody`, `successResponse`, and `errorResponse` helpers for API routes. Each middleware handles exactly one concern.

**`src/ai/`** -- Genkit AI flows for the Gemini-powered product description generator. The AI flow includes multiple security gates: authentication, rate limiting, prompt injection detection, input sanitization, token budget tracking, and output sanitization.

**`src/__tests__/`** -- Test suites organized by category. Architecture tests verify that dependency rules are not violated. Smoke tests verify production readiness. Security tests verify that HTTP security headers are present. Performance tests establish baseline latency requirements.

---

## 3. Architecture

VendorTrack follows a strict 4-layer architecture with a shared cross-cutting layer. For the full architectural specification, see [ARCHITECTURE.md](./ARCHITECTURE.md).

### Layer Diagram

```
+-------------------------------------------------------------+
|                     PRESENTATION LAYER                       |
|  app/ (pages, API routes, server actions)                    |
|  components/ (UI, layout, business components)               |
|  hooks/ (React hooks)                                        |
|  RESPONSIBILITY: HTTP concerns, UI rendering, user input     |
|  RULE: No business logic. Delegates to services.             |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                      SERVICE LAYER                           |
|  services/ (Checkout, Inventory, User, Admin, Search,       |
|             Chat, Notification, Analytics)                    |
|  RESPONSIBILITY: Business rules, orchestration, workflow     |
|  RULE: No database access. Calls repositories.              |
|  RULE: No HTTP concerns. Returns domain types.              |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    REPOSITORY LAYER                           |
|  repositories/ (Product, Order, User, Cart, PaymentSession,  |
|                 AuditLog, Chat)                               |
|  RESPONSIBILITY: Database access, data transformation        |
|  RULE: Returns domain types (camelCase).                     |
|  RULE: Handles snake_case to camelCase mapping.              |
|  RULE: Throws AppError subclasses, never raw Supabase.       |
+-----------------------------+-------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    INFRASTRUCTURE LAYER                       |
|  lib/supabase-admin.ts, lib/supabase.ts, lib/payment/*      |
|  lib/env.ts, lib/rbac.ts, lib/cache.ts                       |
|  RESPONSIBILITY: External service clients, configuration     |
|  RULE: No business logic. Pure infrastructure.              |
+-------------------------------------------------------------+

+-------------------------------------------------------------+
|                      SHARED LAYER                             |
|  domain/ (types, enums, mappers, business rules)             |
|  dto/ (Zod schemas, validation, request/response types)      |
|  validators/ (reusable validation functions)                 |
|  lib/errors.ts (unified error hierarchy)                     |
|  lib/logger/ (structured logging)                            |
|  types/ (backward-compatible re-exports)                     |
|  RESPONSIBILITY: Cross-cutting concerns, shared definitions  |
|  RULE: No dependencies on other layers.                      |
+-------------------------------------------------------------+
```

### Dependency Rules

The architecture enforces strict unidirectional dependency flow:

```
Presentation --> Services --> Repositories --> Infrastructure
     |              |            |               |
     +--------------+------------+---------------+
                    All depend on
                    Shared Layer
```

| Layer | Can depend on | Cannot depend on |
|-------|--------------|------------------|
| Presentation | Services, Shared | Repositories, Infrastructure |
| Services | Repositories, Shared | Presentation, Infrastructure |
| Repositories | Infrastructure, Shared | Presentation, Services |
| Shared | Nothing | All other layers |
| Infrastructure | Shared | Presentation, Services, Repositories |

### Critical Rules

1. **No upward dependencies**: Services never import from Presentation. Repositories never import from Services.
2. **No cross-branch dependencies**: Services do not import other Services directly. If cross-service coordination is needed, extract shared logic into the domain or validators layer.
3. **Domain is pure**: `@/domain` has zero external dependencies. No Supabase, no Stripe, no React.
4. **Repositories are the data gateway**: No page, component, or service calls Supabase directly. All database access goes through a repository.
5. **DTOs guard all boundaries**: No raw request body reaches business logic. Every API route and server action validates input through a Zod schema.

### Data Flow

```
Client Request
     |
     v
API Route Handler (app/api/*/route.ts)
     |  1. Parse request
     |  2. Validate DTO (Zod schema)
     |  3. Authenticate (requireAuth)
     |  4. Authorize (RBAC)
     |
     v
Service Layer (services/*-service.ts)
     |  1. Execute business rules
     |  2. Call repositories
     |  3. Coordinate workflows
     |  4. Return domain types
     |
     v
Repository Layer (repositories/*-repository.ts)
     |  1. Build Supabase query
     |  2. Execute query
     |  3. Transform rows to domain types
     |  4. Throw AppError on failure
     |
     v
Infrastructure (lib/supabase-admin.ts)
     |  1. Supabase client
     |  2. RPC calls
     |  3. Real-time subscriptions
     |
     v
PostgreSQL Database
```

---

## 4. Coding Standards

For the full coding standards specification, see [CODE_QUALITY.md](./CODE_QUALITY.md). Below is a summary of the most important rules.

### Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| React components | PascalCase | `CheckoutView`, `DataTable` |
| Component files | kebab-case | `checkout-view.tsx`, `data-table.tsx` |
| Page files | `page.tsx` | Always `page.tsx` in route directory |
| Library files | kebab-case | `analytics-service.ts`, `user-repository.ts` |
| Type/Interface names | PascalCase | `UserProfile`, `ProductRow` |
| Database row types | PascalCase + `Row` suffix | `ProfileRow`, `ProductRow` |
| DTO types | PascalCase + `Request`/`Response` | `CheckoutSessionRequest` |
| Constants | UPPER_SNAKE_CASE | `ORDER_STATUS_VARIANT`, `PAGE_SIZE` |
| Functions | camelCase | `formatCurrency`, `getErrorMessage` |
| Transformation functions | `rowTypeToDomain` | `profileRowToDomain`, `productRowToDomain` |
| Hooks | camelCase + `use` prefix | `useSupabase`, `useToast` |
| API routes | kebab-case directory | `create-session/route.ts` |
| Environment variables | UPPER_SNAKE_CASE | `NEXT_PUBLIC_SUPABASE_URL` |

### TypeScript Strictness

The project enforces zero `any` policy. The `tsconfig.json` has these strict flags enabled:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true
}
```

The following are prohibited and will fail code review:

- `any` type annotations
- `as any` casts
- `@ts-ignore` or `@ts-expect-error` comments
- `eslint-disable` suppression comments
- `Record<string, any>` (use `ErrorContext` or `Record<string, PrimitiveValue>` instead)

### Error Handling

Always use the structured error hierarchy from `@/lib/errors`. Never throw raw `Error` objects from business logic.

```typescript
// WRONG
throw new Error('Product not found');

// CORRECT
import { NotFoundError } from '@/lib/errors';
throw new NotFoundError({ resource: 'Product', id: productId, traceId });
```

Always catch with `unknown` type and use `getErrorMessage`:

```typescript
// WRONG
catch (error: any) {
  toast({ description: error.message });
}

// CORRECT
import { getErrorMessage } from '@/types';
catch (error: unknown) {
  toast({ description: getErrorMessage(error) });
}
```

### Structured Logging

Use `createLogger` from `@/lib/logger`. Never use `console.log` or `console.error` in production code.

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('checkout-service');

log.info('Session created', { action: 'create-session', data: { sessionId: session.id } });
log.error('Payment failed', { action: 'process-payment', traceId }, error);
```

### Row-to-Domain Transformation

Never pass raw Supabase rows to UI components. Always use the `rowToDomain` mapper functions.

```typescript
// WRONG
const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
setProfile(data as any);

// CORRECT
import { type ProfileRow, profileRowToDomain } from '@/domain';
const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
if (data) setProfile(profileRowToDomain(data as ProfileRow));
```

---

## 5. Adding a New Feature

This section walks through adding a complete feature end-to-end, using a hypothetical "Wishlist" feature as an example. Every feature in VendorTrack must follow all eight steps.

### Step 1: Define the Domain Entity

Open `src/domain/index.ts` and add the entity type, the database row type, and the mapper function.

```typescript
// src/domain/index.ts

// --- Entity type (camelCase) ---
export interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

// --- Database row type (snake_case, suffixed with Row) ---
export interface WishlistItemRow {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
}

// --- Row-to-domain mapper (pure function) ---
export function wishlistItemRowToDomain(row: WishlistItemRow): WishlistItem {
  return {
    id: row.id,
    userId: row.user_id,
    productId: row.product_id,
    createdAt: row.created_at,
  };
}
```

The domain layer is pure. It has no imports from Supabase, Stripe, or any other external service. The mapper function is the bridge between the database representation (snake_case) and the application representation (camelCase).

### Step 2: Create the DTO Schema

Open `src/dto/index.ts` and add Zod schemas for request and response validation.

```typescript
// src/dto/index.ts

export const AddToWishlistSchema = z.object({
  productId: uuidSchema,
});

export const RemoveFromWishlistSchema = z.object({
  wishlistItemId: uuidSchema,
});

export type AddToWishlistDto = z.infer<typeof AddToWishlistSchema>;
export type RemoveFromWishlistDto = z.infer<typeof RemoveFromWishlistSchema>;
```

The `uuidSchema` is already defined in the DTO module and validates that all ID fields are proper UUIDs. This prevents injection attacks through ID fields.

### Step 3: Create the Validator

Open `src/validators/index.ts` and add pure business validation functions.

```typescript
// src/validators/index.ts

export function validateWishlistItemLimit(
  currentCount: number,
  maxItems: number = 100
): { valid: boolean; reason?: string } {
  if (currentCount >= maxItems) {
    return { valid: false, reason: `Wishlist cannot exceed ${maxItems} items` };
  }
  return { valid: true };
}

export function validateWishlistOwnership(
  userId: string,
  wishlistOwnerId: string,
  isAdmin: boolean
): { valid: boolean; reason?: string } {
  if (isAdmin) return { valid: true };
  if (userId !== wishlistOwnerId) {
    return { valid: false, reason: 'You do not own this wishlist item' };
  }
  return { valid: true };
}
```

Validators are pure functions. They never perform I/O, never throw, and always return a structured result object.

### Step 4: Create the Repository

Create a new file `src/repositories/wishlist-repository.ts`.

```typescript
// src/repositories/wishlist-repository.ts

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { WishlistItem, WishlistItemRow } from '@/domain';
import { wishlistItemRowToDomain } from '@/domain';
import { DatabaseError, NotFoundError, fromDatabaseError } from '@/lib/errors';

class WishlistRepository {
  async findByUserId(userId: string): Promise<WishlistItem[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('wishlist_items')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw fromDatabaseError(error);
    return (data || []).map((row) => wishlistItemRowToDomain(row as WishlistItemRow));
  }

  async create(userId: string, productId: string): Promise<WishlistItem> {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from('wishlist_items')
      .insert({ user_id: userId, product_id: productId })
      .select()
      .single();

    if (error) throw fromDatabaseError(error);
    return wishlistItemRowToDomain(data as WishlistItemRow);
  }

  async deleteById(id: string): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await admin
      .from('wishlist_items')
      .delete()
      .eq('id', id);

    if (error) throw fromDatabaseError(error);
  }

  async countByUserId(userId: string): Promise<number> {
    const admin = getSupabaseAdmin();
    const { count, error } = await admin
      .from('wishlist_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) throw fromDatabaseError(error);
    return count || 0;
  }
}

export const wishlistRepository = new WishlistRepository();
```

Key patterns to follow: use `getSupabaseAdmin()` for server-side queries, map every row through the `rowToDomain` function, and throw `AppError` subclasses using `fromDatabaseError` for database errors.

### Step 5: Create the Service

Create a new file `src/services/wishlist-service.ts`.

```typescript
// src/services/wishlist-service.ts

import { wishlistRepository } from '@/repositories/wishlist-repository';
import { productRepository } from '@/repositories/product-repository';
import { validateWishlistItemLimit } from '@/validators';
import { PaymentError, NotFoundError, ErrorCode } from '@/lib/errors';
import { generateTraceId } from '@/domain';

class WishlistService {
  async addToWishlist(userId: string, productId: string, traceId?: string): Promise<{ id: string }> {
    const tid = traceId || generateTraceId('wl');

    // Validate product exists
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError({ resource: 'Product', id: productId, traceId: tid });
    }

    // Validate wishlist limit
    const currentCount = await wishlistRepository.countByUserId(userId);
    const limitCheck = validateWishlistItemLimit(currentCount);
    if (!limitCheck.valid) {
      throw new PaymentError({ message: limitCheck.reason || 'Wishlist limit exceeded', traceId: tid, code: ErrorCode.VALIDATION_FAILED });
    }

    const item = await wishlistRepository.create(userId, productId);
    return { id: item.id };
  }

  async removeFromWishlist(userId: string, itemId: string, isAdmin: boolean, traceId?: string): Promise<void> {
    await wishlistRepository.deleteById(itemId);
  }

  async getWishlist(userId: string): Promise<Array<{ id: string; productId: string; createdAt: string }>> {
    return wishlistRepository.findByUserId(userId);
  }
}

export const wishlistService = new WishlistService();
```

The service orchestrates business logic by calling repositories and validators. It never accesses the database directly and never handles HTTP concerns.

### Step 6: Create the API Route or Server Action

For this example, we use a server action since the wishlist is primarily a UI-driven feature.

```typescript
// src/app/actions/buyer-actions.ts (add to existing file)

export async function addToWishlist(productId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.WISHLIST_WRITE,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    const result = await wishlistService.addToWishlist(auth.userId, productId);
    return { success: true, id: result.id };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}
```

### Step 7: Create the UI Component

```tsx
// src/app/buyer-dashboard/wishlist/page.tsx

import { addToWishlist } from '@/app/actions/buyer-actions';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';

export default function WishlistPage() {
  // Render wishlist items, call server actions on user interaction
  return (
    <div>
      <h1>My Wishlist</h1>
      {/* Wishlist items rendered here */}
    </div>
  );
}
```

### Step 8: Add Tests

```typescript
// src/__tests__/architecture/domain.test.ts (add to existing file)

describe('Wishlist Domain', () => {
  it('should map WishlistItemRow to WishlistItem', () => {
    const row: WishlistItemRow = {
      id: 'uuid-1',
      user_id: 'user-1',
      product_id: 'product-1',
      created_at: '2026-01-01T00:00:00Z',
    };
    const domain = wishlistItemRowToDomain(row);
    expect(domain.id).toBe('uuid-1');
    expect(domain.userId).toBe('user-1');
    expect(domain.productId).toBe('product-1');
    expect(domain.createdAt).toBe('2026-01-01T00:00:00Z');
  });
});
```

---

## 6. Adding a New API Endpoint

This section provides a complete walkthrough for adding a new API endpoint. We will use the example of a `GET /api/wishlist` endpoint that returns the authenticated user's wishlist.

### Step 1: Define the DTO

Add the response schema to `src/dto/index.ts`:

```typescript
// src/dto/index.ts

export const WishlistResponseSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    productId: z.string(),
    productName: z.string().optional(),
    createdAt: z.string(),
  })),
  total: z.number().int().min(0),
});

export type WishlistResponseDto = z.infer<typeof WishlistResponseSchema>;
```

### Step 2: Create the Route Handler

Create the file `src/app/api/wishlist/route.ts`:

```typescript
// src/app/api/wishlist/route.ts

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError, logDeniedAccess } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { wishlistService } from '@/services/wishlist-service';
import { toAppError } from '@/lib/errors';

export async function GET(req: Request) {
  // Step 1: Authenticate + Authorize
  const auth = await requireAuth({
    permission: PERMISSIONS.WISHLIST_READ,
  });

  if (isAuthError(auth)) {
    await logDeniedAccess(auth, 'READ_WISHLIST', 'wishlist_items');
    return NextResponse.json({ error: auth.error }, { status: auth.statusCode });
  }

  try {
    // Step 2: Delegate to service
    const items = await wishlistService.getWishlist(auth.userId);

    // Step 3: Return success response
    return NextResponse.json({ items, total: items.length });
  } catch (error: unknown) {
    const appError = toAppError(error);
    return NextResponse.json(
      appError.toClientResponse(),
      { status: appError.httpStatus }
    );
  }
}
```

### Step 3: Verify the Endpoint

Start the dev server and test:

```bash
npm run dev

# Test without authentication (should return 401)
curl http://localhost:9002/api/wishlist

# Test with a valid session cookie
curl -b cookie.txt http://localhost:9002/api/wishlist
```

### Pattern Summary

Every API route handler follows this exact pattern:

1. **Authenticate** via `requireAuth()` with the appropriate permission
2. **Validate input** via `validateDto()` if the request has a body
3. **Delegate** to the service layer
4. **Return** a success response or an error response via `toAppError()`

The route handler must never contain business logic. It is a thin HTTP adapter.

---

## 7. Adding a New Server Action

Server actions are the primary mechanism for mutations from the UI. They are defined in `src/app/actions/` and are organized by role: `admin-actions.ts`, `buyer-actions.ts`, and `seller-actions.ts`.

### Server Action Pattern

Every server action follows a three-step pattern:

1. **Auth gate** -- Call `requireAuth()` with the appropriate permission and role restriction
2. **Delegate** -- Call the service layer to execute business logic
3. **Return** -- Return `{ success: true }` or `{ error: message }`

### Complete Example: Add to Wishlist

```typescript
// src/app/actions/buyer-actions.ts

import { requireAuth, isAuthError, logAuthEvent } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { wishlistService } from '@/services/wishlist-service';
import { validateDto, AddToWishlistSchema } from '@/dto';
import { getErrorMessage } from '@/types';

export async function addToWishlist(formData: FormData) {
  // Step 1: Auth gate
  const auth = await requireAuth({
    permission: PERMISSIONS.WISHLIST_WRITE,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    // Step 2: Validate input
    const productId = formData.get('productId') as string;
    const validated = validateDto(AddToWishlistSchema, { productId });

    // Step 3: Delegate to service
    const result = await wishlistService.addToWishlist(auth.userId, validated.productId);

    // Step 4: Audit log
    await logAuthEvent({
      userId: auth.userId,
      action: 'ADD_TO_WISHLIST',
      resource: 'wishlist_items',
      resourceId: result.id,
      result: 'success',
    });

    return { success: true, id: result.id };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}
```

### Auth Gate Options

The `requireAuth()` function accepts these options for fine-grained access control:

```typescript
await requireAuth({
  permission: PERMISSIONS.PRODUCTS_WRITE,   // Specific permission check
  adminOnly: true,                           // Only admin and super_admin
  sellerOnly: true,                          // Only seller, admin, super_admin
  role: 'seller',                            // Minimum role level
  ownership: {                               // Resource ownership check
    table: 'products',
    resourceId: productId,
    ownerField: 'seller_id',                 // Default is 'seller_id'
  },
  orderInvolvement: orderId,                 // User must be buyer or seller
  conversationInvolvement: conversationId,   // User must be in conversation
});
```

The `requireAuth` function chains these checks in order: authenticate, authorize role, authorize permission, verify ownership, verify involvement. If any check fails, it returns an `AuthError` object immediately.

### Using Server Actions in Components

```tsx
'use client';

import { addToWishlist } from '@/app/actions/buyer-actions';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function AddToWishlistButton({ productId }: { productId: string }) {
  const { toast } = useToast();

  async function handleAdd() {
    const formData = new FormData();
    formData.append('productId', productId);

    const result = await addToWishlist(formData);

    if (result.error) {
      toast({ description: result.error, variant: 'destructive' });
    } else {
      toast({ description: 'Added to wishlist' });
    }
  }

  return (
    <Button variant="outline" size="icon" onClick={handleAdd}>
      <Heart className="h-4 w-4" />
    </Button>
  );
}
```

---

## 8. Database Migrations

VendorTrack uses Supabase (PostgreSQL) for all data storage. Migrations are managed as SQL files in the `docs/` directory and applied via the Supabase CLI or the Supabase Dashboard.

### Migration File Organization

```
docs/
├── supabase-schema.sql                    # Base schema (tables, types, functions)
├── supabase-rls-migration.sql             # Row Level Security policies
├── supabase-performance-migration.sql     # Indexes, materialized views
├── supabase-payment-migration.sql         # Payment tables (ledger, sessions)
├── supabase-devops-migration.sql          # DevOps monitoring views
├── supabase-database-optimization-migration.sql  # Advanced optimizations
└── supabase-migration-blueprint.md        # Migration strategy guide
```

### Migration Order

Migrations must be applied in this order to satisfy foreign key and dependency constraints:

1. `supabase-schema.sql` -- Core tables: `profiles`, `products`, `orders`, `cart_items`, `conversations`, `messages`
2. `supabase-payment-migration.sql` -- Payment tables: `payment_sessions`, `financial_ledger`, `payment_queue`
3. `supabase-rls-migration.sql` -- Row Level Security policies on all tables
4. `supabase-performance-migration.sql` -- Indexes, materialized views, RPC functions
5. `supabase-devops-migration.sql` -- Monitoring views: `v_cache_hit_rate`, `v_table_stats`, `v_index_usage`
6. `supabase-database-optimization-migration.sql` -- Advanced optimizations

### Writing a New Migration

When adding a new database table or modifying an existing one, follow these steps:

1. **Create a new SQL file** in the `docs/` directory with a descriptive name, e.g., `supabase-wishlist-migration.sql`.

2. **Write idempotent SQL** using `IF NOT EXISTS` and `CREATE OR REPLACE`:

```sql
-- docs/supabase-wishlist-migration.sql

-- Create wishlist_items table
CREATE TABLE IF NOT EXISTS wishlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

-- Index for fast user lookups
CREATE INDEX IF NOT EXISTS idx_wishlist_items_user_id ON wishlist_items(user_id);

-- Enable RLS
ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only see their own wishlist
CREATE POLICY "Users can view own wishlist" ON wishlist_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wishlist" ON wishlist_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own wishlist" ON wishlist_items
  FOR DELETE USING (auth.uid() = user_id);
```

3. **Apply the migration** using the Supabase CLI:

```bash
# Local development
supabase db push

# Or apply directly via the SQL editor in the Supabase Dashboard
```

4. **Update the domain layer** with the new entity type and row type in `src/domain/index.ts`.

5. **Update the repository** with the new data access methods.

6. **Update the DTO** with the new validation schemas.

### Migration Best Practices

- Always use `IF NOT EXISTS` for `CREATE TABLE` and `CREATE INDEX` statements to make migrations idempotent.
- Always enable RLS on new tables. Every table must have row-level security policies.
- Always add appropriate indexes for foreign key columns and frequently queried columns.
- Use `ON DELETE CASCADE` for foreign keys where the child record should be removed when the parent is deleted.
- Use `gen_random_uuid()` for primary keys instead of `uuid_generate_v4()` (requires the `pgcrypto` extension).
- Test migrations locally before applying to staging or production.

---

## 9. Testing

### Test Categories

VendorTrack has four categories of tests, each with a distinct purpose and configuration:

| Category | Location | Runner | Purpose |
|----------|----------|--------|---------|
| Architecture | `src/__tests__/architecture/` | `vitest` | Enforce layer dependency rules, domain purity, DTO validation |
| Smoke | `src/__tests__/smoke/` | `vitest --config vitest.smoke.config.js` | Verify production readiness after deployment |
| Security | `src/__tests__/security/` | `vitest` | Verify HTTP security headers, CORS, CSRF |
| Performance | `src/__tests__/performance/` | `vitest` | Establish latency baselines, prevent regressions |

### Running Tests

```bash
# Run all unit tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Run smoke tests (requires a running server)
npm run test:smoke

# Run specific test file
npx vitest run src/__tests__/architecture/domain.test.ts
```

### Writing Architecture Tests

Architecture tests verify that the domain layer is pure, that DTOs validate correctly, and that the error hierarchy is consistent. These are the most important tests because they enforce the architectural contract.

```typescript
// src/__tests__/architecture/domain.test.ts

import { describe, it, expect } from 'vitest';
import {
  type Product,
  type ProductRow,
  productRowToDomain,
  isProductAvailable,
  calculateCommission,
  COMMISSION_RATE,
} from '@/domain';

describe('Product Domain', () => {
  describe('productRowToDomain', () => {
    it('should map snake_case row to camelCase domain', () => {
      const row: ProductRow = {
        id: 'uuid-1',
        seller_id: 'seller-1',
        title: 'Test Product',
        category: 'Electronics',
        description: 'A test product',
        price_cents: 2999,
        stock: 10,
        image_url: 'https://example.com/image.jpg',
        status: 'active',
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      };

      const product = productRowToDomain(row);

      expect(product.id).toBe('uuid-1');
      expect(product.sellerId).toBe('seller-1');
      expect(product.priceCents).toBe(2999);
      expect(product.price).toBe(29.99); // price_cents / 100
    });
  });

  describe('isProductAvailable', () => {
    it('should return true for active product with sufficient stock', () => {
      expect(isProductAvailable(
        { status: 'active', deletedAt: undefined, stock: 10 },
        5
      )).toBe(true);
    });

    it('should return false for draft product', () => {
      expect(isProductAvailable(
        { status: 'draft', deletedAt: undefined, stock: 10 },
        1
      )).toBe(false);
    });

    it('should return false for insufficient stock', () => {
      expect(isProductAvailable(
        { status: 'active', deletedAt: undefined, stock: 2 },
        5
      )).toBe(false);
    });
  });

  describe('calculateCommission', () => {
    it('should calculate 10% commission', () => {
      expect(calculateCommission(10000)).toBe(1000); // 10% of 10000 cents
    });
  });
});
```

### Writing DTO Tests

```typescript
// src/__tests__/architecture/dto.test.ts

import { describe, it, expect } from 'vitest';
import { CheckoutSessionRequestSchema, validateDto } from '@/dto';
import { AppError } from '@/lib/errors';

describe('Checkout DTOs', () => {
  describe('CheckoutSessionRequestSchema', () => {
    it('should accept valid checkout request', () => {
      const data = {
        items: [
          { productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 2 },
        ],
      };
      const result = CheckoutSessionRequestSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('should reject non-UUID productId', () => {
      const data = {
        items: [{ productId: 'not-a-uuid', quantity: 1 }],
      };
      const result = CheckoutSessionRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('should reject quantity exceeding 100', () => {
      const data = {
        items: [{ productId: '550e8400-e29b-41d4-a716-446655440000', quantity: 101 }],
      };
      const result = CheckoutSessionRequestSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });
});
```

### Writing Smoke Tests

Smoke tests verify that the application is functioning correctly after deployment. They require a running server and test real HTTP endpoints.

```typescript
// src/__tests__/smoke/smoke.test.ts (add to existing file)

describe('Wishlist API', () => {
  it('should require authentication for wishlist endpoint', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/wishlist`);
    expect([401, 403]).toContain(response.status);
  });
});
```

### Test Configuration

The default Vitest configuration is in `vitest.config.js`:

```javascript
module.exports = {
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
};
```

The smoke test configuration is in `vitest.smoke.config.js` and uses a longer timeout for HTTP requests.

---

## 10. Debugging

### Common Debugging Scenarios

#### Scenario: API Route Returns 401 Unexpectedly

This is the most common debugging scenario. The `requireAuth()` function performs a chain of checks: session validation, profile lookup, role resolution, permission check, and optional ownership verification. If any step fails, the function returns an `AuthError`.

**Debugging steps:**

1. Check the browser's Network tab for the `Set-Cookie` header on the login response. The Supabase session cookie must be present.
2. Check the server logs for the `logDeniedAccess` output, which includes the specific error code (`UNAUTHENTICATED`, `INSUFFICIENT_PERMISSION`, `OWNERSHIP_VIOLATION`, etc.).
3. Verify that the user's profile exists in the `profiles` table and has the correct `role` and `is_admin` values.
4. Check the RBAC configuration in `src/lib/rbac.ts` to ensure the permission is assigned to the user's role.

#### Scenario: DTO Validation Fails with Unexpected Error

DTO validation uses Zod schemas with additional security hardening (SQL injection detection, UUID format validation, string length limits). If validation fails, the error message will indicate which field failed and why.

**Debugging steps:**

1. Log the raw request body before validation to see what the client is actually sending.
2. Check the Zod schema for the specific field constraints (length limits, regex patterns, enum values).
3. Look for SQL injection pattern matches in the `SQL_INJECTION_PATTERN` regex if the error mentions "invalid characters".
4. Verify that ID fields are proper UUIDs (not integers, not empty strings, not `undefined`).

#### Scenario: Repository Returns Null Instead of Data

Repositories return `null` when a record is not found (Supabase error code `PGRST116`). If you expect data but get `null`, the query may be filtering incorrectly.

**Debugging steps:**

1. Check the Supabase query for filter conditions (`eq`, `is`, `range`).
2. Check RLS policies. The server-side admin client (`getSupabaseAdmin()`) bypasses RLS, but the client-side client (`createClient()`) respects RLS. If you are using the wrong client, you may get filtered results.
3. Check soft-delete columns. Products use `deleted_at` for soft deletes. The `is('deleted_at', null)` filter excludes soft-deleted records.
4. Use the Supabase SQL Editor to run the same query manually and verify the data exists.

### Server-Side Debugging

For server-side debugging, use the structured logger instead of `console.log`:

```typescript
import { createLogger } from '@/lib/logger';
const log = createLogger('my-module');

// Add debug logging to trace the flow
log.info('Processing request', { action: 'my-action', data: { userId, productId } });
log.info('Repository result', { action: 'my-action', data: { result } });
```

Set the `LOG_LEVEL` environment variable to `debug` to see all log output:

```bash
LOG_LEVEL=debug npm run dev
```

### Next.js DevTools

The Next.js development server provides detailed error overlays that show the exact file, line number, and stack trace for server-side errors. Use the browser's DevTools Network tab to inspect API request and response payloads.

### Docker Debugging

```bash
# View application logs
npm run docker:logs

# View logs for a specific service
docker compose logs -f app
docker compose logs -f redis
docker compose logs -f worker

# Execute a shell inside the application container
docker compose exec app sh

# Check Redis connectivity
docker compose exec redis redis-cli ping

# Check Redis cache contents
docker compose exec redis redis-cli keys '*'
```

---

## 11. Environment Variables

### Complete Reference Table

| Variable | Required | Server Only | Pattern | Description |
|----------|----------|-------------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | `^https://[a-z]+\.supabase\.co$` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | -- | Supabase anon key (respects RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | -- | Supabase service role key (bypasses RLS) |
| `STRIPE_SECRET_KEY` | Yes | Yes | `^sk_(test\|live)_` | Stripe secret key |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | No | `^pk_(test\|live)_` | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | Yes | Yes | `^whsec_` | Stripe webhook signing secret |
| `GEMINI_API_KEY` | No | Yes | -- | Google Gemini API key for AI features |
| `ALGOLIA_APP_ID` | No | No | -- | Algolia application ID |
| `ALGOLIA_API_KEY` | No | Yes | -- | Algolia admin API key |
| `REDIS_URL` | No | Yes | -- | Redis connection URL (default: `redis://redis:6379`) |
| `SENTRY_DSN` | No | Yes | -- | Sentry DSN for error tracking |
| `SENTRY_ENVIRONMENT` | No | Yes | -- | Sentry environment label |
| `LOG_LEVEL` | No | Yes | -- | Server log level (default: `info`) |
| `NEXT_PUBLIC_LOG_LEVEL` | No | No | -- | Client log level (default: `warn`) |
| `APP_PORT` | No | No | -- | Application port (default: `9002`) |
| `REDIS_PORT` | No | No | -- | Redis exposed port (default: `6379`) |

### .env.local Setup

Copy `.env.example` to `.env.local` and fill in all required values:

```bash
cp .env.example .env.local
```

Example `.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://yourproject.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

# Stripe
STRIPE_SECRET_KEY=sk_test_51ABC...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_51ABC...
STRIPE_WEBHOOK_SECRET=whsec_abc123...

# AI (optional)
GEMINI_API_KEY=AIza...

# Redis
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=debug
NEXT_PUBLIC_LOG_LEVEL=warn
```

### Validation System

The environment variable validation system is defined in `src/lib/env.ts`. It runs at server startup and implements a fail-fast pattern: if any required variable is missing or invalid, the application will not start.

The validation system checks for:

- **Missing required variables**: Returns a `missing` status with a clear error message.
- **Invalid format**: Returns an `invalid` status if the value does not match the expected pattern.
- **Placeholder values**: Returns a `warning` status if the value matches common placeholder patterns (`your-`, `placeholder`, `xxx`, `changeme`).
- **Security violations**: Returns an `unsafe` status if a server-only variable has a `NEXT_PUBLIC_` prefix, which would expose it in the client bundle.

The `requireEnvironment()` function is called at server startup and throws an error if any validation failures are found. The `validateEnvironment()` function returns a detailed report without throwing.

```typescript
import { requireEnvironment, validateEnvironment, requireEnv, optionalEnv } from '@/lib/env';

// Fail-fast at startup (use in instrumentation.ts)
requireEnvironment();

// Get detailed validation report
const results = validateEnvironment();

// Get a required variable (throws if missing)
const stripeKey = requireEnv('STRIPE_SECRET_KEY');

// Get an optional variable with default
const logLevel = optionalEnv('LOG_LEVEL', 'info');
```

### Security Rules

- Server-only variables (marked `Yes` in the Server Only column) must NOT have the `NEXT_PUBLIC_` prefix. Variables with `NEXT_PUBLIC_` are embedded in the client-side JavaScript bundle and are visible to anyone who inspects the browser's network traffic.
- The validation system automatically checks for `NEXT_PUBLIC_` variants of server-only secrets and will fail startup if they exist.
- Never commit `.env.local` to version control. The `.gitignore` file excludes it.

---

## 12. Git Workflow

### Branch Strategy

VendorTrack uses a trunk-based development workflow with short-lived feature branches.

| Branch | Purpose | Merge Target |
|--------|---------|-------------|
| `main` | Production-ready code | -- |
| `staging` | Pre-production testing | `main` |
| `feature/<ticket>-<description>` | New feature development | `staging` |
| `fix/<ticket>-<description>` | Bug fixes | `staging` |
| `hotfix/<ticket>-<description>` | Critical production fixes | `main` and `staging` |

### Creating a Branch

```bash
# Update your local main
git checkout main
git pull origin main

# Create a feature branch
git checkout -b feature/VT-123-add-wishlist

# Create a fix branch
git checkout -b fix/VT-456-checkout-error
```

### Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

| Type | Purpose | Example |
|------|---------|---------|
| `feat` | New feature | `feat(wishlist): add wishlist item endpoint` |
| `fix` | Bug fix | `fix(checkout): handle expired payment sessions` |
| `refactor` | Code restructuring | `refactor(domain): extract commission calculation` |
| `test` | Adding or updating tests | `test(architecture): add wishlist domain tests` |
| `docs` | Documentation changes | `docs(guide): add wishlist feature walkthrough` |
| `chore` | Maintenance tasks | `chore(deps): update stripe sdk` |
| `perf` | Performance improvements | `perf(products): add cursor pagination` |
| `security` | Security fixes | `security(auth): fix session validation bypass` |

### Pull Request Process

1. **Create a PR** from your feature branch to `staging`.
2. **Fill in the PR template** with a description of changes, testing instructions, and any screenshots.
3. **Run the full verification suite** before requesting review:

```bash
npm run typecheck
npm run test
npm run build
npm run security:check
```

4. **Request at least one review** from a team member.
5. **Address all review comments** and push fixes.
6. **Squash and merge** when approved. The commit message should follow the Conventional Commits format.

### Pre-commit Hooks

The project uses Husky for pre-commit hooks. The `prepare` script in `package.json` sets up the hooks:

```bash
npm run prepare
```

The pre-commit hook runs `npm run typecheck` and `npm run test` to catch issues before they reach the CI pipeline.

---

## 13. Code Review Checklist

Before submitting any PR, verify every item on this checklist. Reviewers should also check these items.

### Architecture

- [ ] Business logic is in the service layer, not in route handlers or components
- [ ] Database access is through repositories, not direct Supabase calls
- [ ] No upward dependencies (Services do not import from Presentation, Repositories do not import from Services)
- [ ] Domain types are pure (no external dependencies in `@/domain`)
- [ ] All request/response data is validated through Zod DTOs

### TypeScript

- [ ] Zero `any` types, `as any` casts, `@ts-ignore`, or `eslint-disable`
- [ ] `catch (error: unknown)` pattern used everywhere
- [ ] Row-to-domain mappers used for all Supabase query results
- [ ] No `Record<string, any>` (use `ErrorContext` or `Record<string, PrimitiveValue>`)
- [ ] Badge variants use `ORDER_STATUS_VARIANT` / `REFUND_STATUS_VARIANT` instead of `as any`

### Error Handling

- [ ] All errors thrown from business logic are `AppError` subclasses
- [ ] API routes use `toAppError()` for catch blocks
- [ ] Server actions use `getErrorMessage()` for catch blocks
- [ ] Error messages exposed to clients are safe (no internal details, no stack traces)
- [ ] Structured logging via `createLogger()`, not `console.log` or `console.error`

### Security

- [ ] No secrets in code (API keys, passwords, tokens)
- [ ] Server-only environment variables do not have `NEXT_PUBLIC_` prefix
- [ ] All API routes call `requireAuth()` before processing
- [ ] Ownership checks are performed where appropriate (seller owns product, user owns cart)
- [ ] Input validation via Zod DTOs on all API routes and server actions
- [ ] Rate limiting applied to sensitive endpoints (checkout, AI generation)
- [ ] No SQL injection vectors (parameterized queries, no string concatenation)

### Testing

- [ ] New domain types have mapper tests
- [ ] New DTOs have validation tests
- [ ] New validators have unit tests
- [ ] Critical paths have smoke tests
- [ ] All tests pass: `npm run test`

### Performance

- [ ] No N+1 queries (use batch loading or DataLoader pattern)
- [ ] Frequently accessed data is cached via the Redis cache layer
- [ ] Cache invalidation is handled on write operations
- [ ] Database queries use appropriate indexes (check with `EXPLAIN ANALYZE`)

### Build

- [ ] `npm run typecheck` passes with zero errors
- [ ] `npm run build` passes with zero errors
- [ ] `npm run security:check` passes with zero findings
- [ ] No dead code (unused imports, exports, or files)

### Documentation

- [ ] New environment variables are documented in the reference table
- [ ] New API endpoints are documented with request/response examples
- [ ] New database migrations are documented with a description
- [ ] Complex business logic has inline comments explaining the "why"

---

## Appendix: Quick Reference

### Common Commands

```bash
npm run dev              # Start dev server on port 9002
npm run build            # Production build (TypeScript + ESLint)
npm run typecheck        # TypeScript type checking only
npm run test             # Run all unit tests
npm run test:watch       # Run tests in watch mode
npm run test:coverage    # Run tests with coverage report
npm run test:smoke       # Run smoke tests against running server
npm run lint             # Run ESLint
npm run docker:dev       # Start Docker dev environment
npm run docker:up        # Start production-like Docker stack
npm run docker:down      # Stop Docker containers
npm run docker:logs      # View Docker container logs
npm run security:check   # Scan for secrets in code
npm run healthcheck      # Check if the app is running
```

### Key File Locations

| Purpose | File |
|---------|------|
| Environment validation | `src/lib/env.ts` |
| Error hierarchy | `src/lib/errors.ts` |
| Authentication | `src/lib/auth.ts` |
| RBAC | `src/lib/rbac.ts` |
| Domain types | `src/domain/index.ts` |
| DTO schemas | `src/dto/index.ts` |
| Validators | `src/validators/index.ts` |
| API middleware | `src/middleware/api-middleware.ts` |
| Redis client | `src/lib/cache/redis-client.ts` |
| Payment module | `src/lib/payment/` |
| Security module | `src/lib/security/` |
| Structured logger | `src/lib/logger/index.ts` |
| AI flows | `src/ai/flows/` |
| Test configuration | `vitest.config.js` |
| Docker configuration | `docker-compose.yml` |
| Next.js configuration | `next.config.js` |
| TypeScript configuration | `tsconfig.json` |
| Tailwind configuration | `tailwind.config.ts` |

### Important Architecture Documents

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Full architecture specification with layer diagrams, dependency rules, and data flow |
| [CODE_QUALITY.md](./CODE_QUALITY.md) | Coding standards, naming conventions, TypeScript strictness, error handling |
| [SECURITY.md](./SECURITY.md) | Security policies, threat model, and hardening guide |
| [DATABASE.md](./DATABASE.md) | Database schema, RLS policies, and migration guide |
| [PAYMENTS.md](./PAYMENTS.md) | Payment processing, Stripe integration, and reconciliation |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Deployment procedures and infrastructure |
| [RUNBOOK.md](./RUNBOOK.md) | Operational runbook for on-call engineers |
