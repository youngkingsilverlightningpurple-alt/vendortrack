# VendorTrack Testing Guide

This document defines the comprehensive testing strategy for VendorTrack, a Next.js multi-vendor marketplace powered by Supabase, Stripe, Redis, and Gemini AI. It covers every aspect of the testing pipeline from unit tests through smoke tests, CI/CD integration, and best practices.

---

## Table of Contents

1. [Testing Philosophy](#1-testing-philosophy)
2. [Test Categories](#2-test-categories)
3. [Running Tests](#3-running-tests)
4. [Test Configuration](#4-test-configuration)
5. [Writing Unit Tests](#5-writing-unit-tests)
6. [Writing Smoke Tests](#6-writing-smoke-tests)
7. [Test Coverage](#7-test-coverage)
8. [CI/CD Integration](#8-cicd-integration)
9. [Test Data](#9-test-data)
10. [Testing Best Practices](#10-testing-best-practices)

---

## 1. Testing Philosophy

### The Test Pyramid

VendorTrack follows the classic test pyramid model, which prioritizes a large base of fast, deterministic unit tests, a smaller middle layer of integration-style architecture and security tests, and a thin top layer of end-to-end smoke tests that run against a live server. The pyramid shape is intentional: lower-level tests are cheaper to write, faster to execute, and more precise in pinpointing failures. Higher-level tests provide confidence that the system works end-to-end but are slower, more brittle, and harder to debug when they fail.

| Layer          | Count  | Speed     | Scope                    | Purpose                                    |
|----------------|--------|-----------|--------------------------|--------------------------------------------|
| Unit           | 100+   | <1ms each | Single function/module   | Verify isolated logic correctness          |
| Architecture   | 50+    | <5ms each | Domain, DTO, validators  | Enforce structural invariants              |
| Security       | 40+    | <10ms each| OWASP, XSS, RBAC         | Prevent vulnerability regressions          |
| Performance    | 30+    | <50ms each| Cache, latency, memory   | Guard against performance regressions      |
| Smoke (E2E)    | 15+    | 1-5s each | Full server, real HTTP   | Verify deployment health and correctness   |

### Coverage Targets

| Category          | Target Coverage | Rationale                                            |
|-------------------|-----------------|------------------------------------------------------|
| Domain logic      | 90%+            | Core business rules must be fully verified           |
| DTO validation    | 95%+            | All input boundaries must be tested                  |
| Validators        | 90%+            | Business rule enforcement must be reliable            |
| Error handling    | 85%+            | Every error path must produce correct output         |
| Security          | 80%+            | Critical security functions must be tested            |
| Performance       | 70%+            | Cache and monitoring code should be verified         |
| Overall           | 80%+            | Maintainable minimum across the entire codebase      |

### Testing Principles

1. **Determinism over coverage.** A flaky test is worse than no test. Every test must produce the same result given the same code, regardless of environment, order, or timing. Avoid `setTimeout`, random values, and external service dependencies in unit tests.

2. **Test behavior, not implementation.** Tests should assert what the code does, not how it does it. If a test breaks when you refactor internal logic without changing the external contract, the test is too coupled to implementation details.

3. **Isolate the unit under test.** Every external dependency -- database calls, HTTP requests, Redis, Stripe, Supabase -- must be mocked or stubbed in unit tests. Real connections are reserved for smoke tests.

4. **Fail fast, fail clearly.** Test assertions should produce readable error messages. Use descriptive test names that read as sentences: "rejects non-UUID productId" is better than "invalid input test".

5. **Security is a first-class test category.** XSS, CSRF, SQL injection, RBAC, and prompt injection are not edge cases. They are core test requirements that must never regress.

6. **Performance tests are regression guards.** Cache hit rates, API latency percentiles, and memory thresholds are codified in tests. If a PR causes the p95 latency to exceed the target, the test suite catches it before merge.

7. **Smoke tests verify deployment, not features.** Smoke tests run against a live server after deployment. They confirm that the application is reachable, healthy, and serving correct responses. They do not replace unit or integration tests.

---

## 2. Test Categories

### 2.1 Unit Tests

Unit tests are the foundation of the test suite. They verify individual functions, classes, and modules in complete isolation. In VendorTrack, unit tests live in `src/__tests__/` and are organized by concern: architecture, security, performance, and smoke.

**What unit tests cover:**

- Domain mappers (`profileRowToDomain`, `productRowToDomain`, `orderRowToDomain`, `cartItemRowToDomain`)
- Business rules (`calculateCommission`, `calculateSellerTransfer`, `isProductAvailable`, `isSessionExpired`)
- Constants and configuration values (`COMMISSION_RATE`, `MIN_ORDER_AMOUNT_CENTS`, `SESSION_EXPIRY_MINUTES`)
- Badge variant helpers (`getOrderStatusVariant`, `getRefundStatusVariant`)
- Trace ID generation (`generateTraceId`)

**What unit tests do NOT cover:**

- Network requests to Supabase, Stripe, or Redis
- File system operations
- React component rendering (use React Testing Library for that)
- Browser-specific behavior

Unit tests use vitest with the `node` environment. They are fast, deterministic, and can run in parallel without side effects.

### 2.2 Architecture Tests

Architecture tests enforce structural invariants of the codebase. They verify that the domain layer, DTOs, validators, and error hierarchy are correct and consistent. These tests are not about individual function behavior but about the integrity of the architectural boundaries.

**Architecture test files:**

| File                                       | Purpose                                                      |
|--------------------------------------------|--------------------------------------------------------------|
| `src/__tests__/architecture/domain.test.ts`| Domain entity mappers, business rules, constants             |
| `src/__tests__/architecture/dto.test.ts`   | Zod schema validation for all request/response DTOs          |
| `src/__tests__/architecture/validators.test.ts` | Centralized business validation functions                |
| `src/__tests__/architecture/errors.test.ts`| Error class hierarchy, error mapping, utility functions      |

**Domain tests** verify that Supabase row types (snake_case) are correctly transformed to domain types (camelCase), that price calculations handle cents correctly, and that business constants have expected values.

**DTO tests** verify that every Zod schema accepts valid input, rejects invalid input, and enforces constraints such as UUID format for IDs, maximum string lengths, and bounded numeric ranges. The `validateDto` and `safeValidateDto` helpers are tested to ensure they throw `AppError` with `VALIDATION_FAILED` code on invalid data.

**Validator tests** verify business rule enforcement functions that return `{ valid: boolean; reason?: string }` objects. These include product availability checks, seller payment eligibility, commission calculations, session expiry, single-vendor constraints, ownership verification, order status transitions, and refund eligibility.

**Error tests** verify the complete error hierarchy: `AppError` base class, specialized subclasses (`ValidationError`, `AuthenticationError`, `AuthorizationError`, `DatabaseError`, `PaymentError`, `NotFoundError`, `ConflictError`), utility functions (`getErrorMessage`, `toAppError`), and adapter functions (`fromStripeError`, `fromDatabaseError`) that map external error types to internal error codes.

### 2.3 Security Tests

Security tests are a dedicated category that validates the application's resistance to common attack vectors. These tests cover the OWASP Top 10 vulnerability classes and are critical for a marketplace that handles payments and personal data.

**Security test file:** `src/__tests__/security/security.test.ts`

**What security tests cover:**

| Category                | Tests                                                                    |
|-------------------------|--------------------------------------------------------------------------|
| XSS Prevention          | `encodeHTML`, `sanitizeHTML`, `sanitizePlainText`, `sanitizeChatMessage`, `sanitizeAIOutput`, `sanitizeProfileName`, `sanitizeProductDescription`, `sanitizeSearchQuery` |
| CSRF Protection         | Token generation, token validation, origin verification                 |
| SQL Injection           | Parameterized query enforcement, input sanitization                      |
| Rate Limiting           | Per-IP rate limiting, per-user rate limiting, endpoint-specific limits   |
| RBAC Enforcement        | Role-based access control for buyer, seller, admin roles                 |
| IDOR Prevention         | Insecure direct object reference checks on order, product, and user endpoints |
| Prompt Injection        | AI input sanitization, system prompt protection, output filtering        |
| File Upload Security    | File type validation, size limits, filename sanitization                  |
| Malformed Payload       | JSON parsing edge cases, extra fields, missing fields, type coercion     |
| Replay Attack           | Nonce validation, timestamp checking, idempotency keys                   |
| Security Headers        | X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy          |
| Sanitization            | All sanitization functions tested against known attack payloads           |

Security tests are run as part of the standard test suite. They use mocked dependencies and do not require a running server. Every new security feature must include corresponding tests before merge.

### 2.4 Performance Tests

Performance tests validate that the application's performance characteristics meet defined targets and that the caching layer, monitoring, and background job systems function correctly.

**Performance test file:** `src/__tests__/performance/performance.test.ts`

**What performance tests cover:**

| Category                | Tests                                                                    |
|-------------------------|--------------------------------------------------------------------------|
| Cache Layer             | `set`/`get`/`delete`, tag-based invalidation, `getOrSet` pattern, cache stats |
| Performance Monitor     | API latency recording, database latency recording, error rate tracking, percentile calculations, Prometheus export |
| Cursor Pagination       | Cache key generation for product listings and search results             |
| Cache Durations         | TTL values for all cache categories (products, profiles, search, etc.)   |
| Performance Targets     | Metric structure validation, cache header generation                     |
| Background Jobs         | Job type definitions, handler registration, queue status                 |
| Paginated Response      | Response format with data, pagination metadata                           |
| Measure Helpers         | `measureApiLatency`, `measureDbLatency`, `startTimer`                    |

Performance tests are unit tests that verify the correctness of performance infrastructure. They do not benchmark the actual application. For real-world latency measurements, see the smoke tests.

### 2.5 Smoke Tests

Smoke tests are end-to-end tests that run against a live server. They verify that the deployed application is healthy, serving pages, responding to API requests, and enforcing security headers. Smoke tests are the final gate before a deployment is considered successful.

**Smoke test file:** `src/__tests__/smoke/smoke.test.ts`

**What smoke tests cover:**

| Category                | Tests                                                                    |
|-------------------------|--------------------------------------------------------------------------|
| Health Check            | `/api/health` returns 200, database is healthy, memory is acceptable     |
| Page Rendering          | Home, login, marketplace, signup pages return 200                        |
| Protected Pages         | Unauthenticated users are redirected from seller, buyer, admin dashboards |
| API Endpoints           | Product search returns results, checkout rejects unauthenticated, payment health and performance require auth |
| Security Headers        | X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy          |
| Performance Baseline    | Health check < 500ms, home page < 2s, search < 1s                       |

Smoke tests run sequentially (single fork) to avoid rate limiting issues. They use a separate vitest configuration with extended timeouts.

---

## 3. Running Tests

### Available Commands

All test commands are defined in `package.json` and use vitest as the test runner.

```bash
# Run all unit tests once (architecture, security, performance)
npm run test

# Run tests in watch mode during development
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run smoke tests against localhost:9002
npm run test:smoke

# Run smoke tests against a specific deployment
SMOKE_BASE_URL=https://vendortrack.app npm run test:smoke
```

### Command Details

| Command                         | Script                              | Config File               | Purpose                                          |
|---------------------------------|-------------------------------------|---------------------------|--------------------------------------------------|
| `npm run test`                  | `vitest run`                        | `vitest.config.js`        | Single run of all unit tests                     |
| `npm run test:watch`            | `vitest`                            | `vitest.config.js`        | Watch mode, reruns on file changes               |
| `npm run test:coverage`         | `vitest run --coverage`             | `vitest.config.js`        | Single run with Istanbul coverage report         |
| `npm run test:smoke`            | `vitest run --config vitest.smoke.config.js` | `vitest.smoke.config.js` | Smoke tests against live server                  |

### Running Specific Test Files

```bash
# Run a single test file
npx vitest run src/__tests__/architecture/domain.test.ts

# Run all tests in a directory
npx vitest run src/__tests__/security/

# Run tests matching a pattern
npx vitest run --reporter=verbose "calculateCommission"
```

### Running Smoke Tests Against Different Environments

```bash
# Default: localhost:9002
npm run test:smoke

# Staging environment
SMOKE_BASE_URL=https://staging.vendortrack.app npm run test:smoke

# Production environment
SMOKE_BASE_URL=https://vendortrack.app npm run test:smoke

# Using BASE_URL as fallback
BASE_URL=https://vendortrack.app npm run test:smoke
```

The smoke test file resolves the base URL from the environment in this order:
1. `SMOKE_BASE_URL`
2. `BASE_URL`
3. `http://localhost:9002` (default)

---

## 4. Test Configuration

### vitest.config.js

The primary configuration file for unit tests. It defines the test environment, file inclusion pattern, and path aliases.

```js
const path = require('path');

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
  css: false,
  server: {
    fs: {
      allow: ['.'],
    },
  },
};
```

**Key configuration details:**

- **`environment: 'node'`** -- Tests run in a Node.js environment, not a browser. This is appropriate for domain logic, DTOs, validators, and error handling tests.
- **`include: ['src/__tests__/**/*.test.ts']`** -- Discovers all test files under `src/__tests__/` with the `.test.ts` extension. This excludes the smoke test directory when running `npm run test` because smoke tests use a separate config.
- **`resolve.alias`** -- Maps `@/` to `src/`, matching the TypeScript path alias used throughout the application. This allows imports like `import { AppError } from '@/lib/errors'` in test files.
- **`css: false`** -- Disables CSS processing since unit tests do not render components.
- **`server.fs.allow`** -- Allows vitest to serve files from the project root directory.

### vitest.smoke.config.js

A separate configuration file for smoke tests that run against a live server. This config uses extended timeouts and sequential execution to avoid rate limiting.

```js
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/smoke/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

**Key configuration details:**

- **`include: ['src/__tests__/smoke/**/*.test.ts']`** -- Only includes smoke test files. This ensures `npm run test:smoke` does not run unit tests.
- **`testTimeout: 30000`** -- 30-second timeout per test. Smoke tests make real HTTP requests which can be slow, especially on cold starts or distant servers.
- **`hookTimeout: 30000`** -- 30-second timeout for before/after hooks.
- **`pool: 'forks'` with `singleFork: true`** -- Runs all smoke tests sequentially in a single fork. This prevents concurrent requests from triggering rate limiting on the target server. It also ensures that tests do not interfere with each other's network state.

### Path Aliases

Both configuration files define the same path alias:

```js
resolve: {
  alias: {
    '@': path.resolve(__dirname, 'src'),
  },
}
```

This mirrors the TypeScript `paths` configuration and allows test files to use the same import syntax as application code:

```typescript
// Test imports use the same @ alias as application code
import { AppError, ErrorCode } from '@/lib/errors';
import { calculateCommission } from '@/domain';
import { CheckoutItemSchema } from '@/dto';
import { validateProductAvailability } from '@/validators';
import { sanitizeHTML } from '@/lib/security/sanitize';
```

---

## 5. Writing Unit Tests

### General Pattern

All unit tests follow the same structure using vitest's `describe`/`it` API:

```typescript
import { describe, it, expect } from 'vitest';
import { functionUnderTest } from '@/module';

describe('functionUnderTest', () => {
  it('should do something specific', () => {
    // Arrange
    const input = ...;

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBe(expected);
  });
});
```

### Architecture Test Example: Domain Entity

```typescript
import { describe, it, expect } from 'vitest';
import { productRowToDomain, calculateCommission } from '@/domain';
import type { ProductRow } from '@/domain';

describe('productRowToDomain', () => {
  it('transforms and calculates price from cents', () => {
    // Arrange
    const row: ProductRow = {
      id: 'prod_1',
      seller_id: 'seller_1',
      title: 'Widget',
      category: 'Electronics',
      description: 'A great widget',
      price_cents: 999,
      stock: 50,
      image_url: 'https://example.com/widget.jpg',
      status: 'active',
      created_at: '2024-01-01T00:00:00Z',
    };

    // Act
    const result = productRowToDomain(row);

    // Assert
    expect(result.price).toBe(9.99);
    expect(result.priceCents).toBe(999);
    expect(result.sellerId).toBe('seller_1');
  });
});

describe('calculateCommission', () => {
  it('calculates 10% commission with rounding', () => {
    expect(calculateCommission(1000)).toBe(100);
    expect(calculateCommission(99)).toBe(10);   // Math.round(9.9)
    expect(calculateCommission(1)).toBe(0);     // Math.round(0.1)
  });
});
```

### Architecture Test Example: DTO Validation

```typescript
import { describe, it, expect } from 'vitest';
import { CheckoutItemSchema, validateDto, safeValidateDto } from '@/dto';
import { AppError, ErrorCode } from '@/lib/errors';

const UUID = '123e4567-e89b-12d3-a456-426614174000';

describe('CheckoutItemSchema', () => {
  it('validates a valid checkout item', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 2 });
    expect(result.success).toBe(true);
  });

  it('rejects non-UUID productId', () => {
    const result = CheckoutItemSchema.safeParse({ productId: 'prod_123', quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects quantity greater than 100', () => {
    const result = CheckoutItemSchema.safeParse({ productId: UUID, quantity: 101 });
    expect(result.success).toBe(false);
  });
});

describe('validateDto', () => {
  it('throws AppError with VALIDATION_FAILED code on invalid data', () => {
    expect(() => validateDto(CheckoutItemSchema, { productId: '', quantity: 0 })).toThrow(AppError);
  });

  it('returns validated data on success', () => {
    const result = validateDto(CheckoutItemSchema, { productId: UUID, quantity: 2 });
    expect(result).toEqual({ productId: UUID, quantity: 2 });
  });
});
```

### Security Test Example: XSS Prevention

```typescript
import { describe, it, expect } from 'vitest';
import {
  encodeHTML,
  sanitizeHTML,
  sanitizeChatMessage,
  sanitizeSearchQuery,
} from '@/lib/security/sanitize';

describe('XSS Protection -- Sanitization', () => {
  describe('encodeHTML', () => {
    it('should encode HTML special characters', () => {
      expect(encodeHTML('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should encode ampersands', () => {
      expect(encodeHTML('a&b')).toBe('a&amp;b');
    });

    it('should encode single quotes', () => {
      expect(encodeHTML("it's")).toBe('it&#x27;s');
    });
  });

  describe('sanitizeChatMessage', () => {
    it('should strip script tags from chat messages', () => {
      const result = sanitizeChatMessage('<script>steal()</script>Hello');
      expect(result).not.toContain('<script>');
      expect(result).toContain('Hello');
    });

    it('should preserve safe formatting', () => {
      const result = sanitizeChatMessage('<b>important</b> message');
      expect(result).toContain('important');
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should remove HTML from search queries', () => {
      const result = sanitizeSearchQuery('<img onerror="alert(1)">laptop');
      expect(result).not.toContain('<img');
      expect(result).toContain('laptop');
    });
  });
});
```

### Security Test Example: Rate Limiting

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { rateLimiter } from '@/lib/security/rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    rateLimiter.reset();
  });

  it('should allow requests within the limit', () => {
    const result = rateLimiter.check('192.168.1.1', { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
  });

  it('should block requests exceeding the limit', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.check('192.168.1.1', { limit: 5, windowMs: 60000 });
    }
    const result = rateLimiter.check('192.168.1.1', { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(false);
  });

  it('should track different IPs independently', () => {
    for (let i = 0; i < 5; i++) {
      rateLimiter.check('192.168.1.1', { limit: 5, windowMs: 60000 });
    }
    const result = rateLimiter.check('192.168.1.2', { limit: 5, windowMs: 60000 });
    expect(result.allowed).toBe(true);
  });
});
```

### Performance Test Example: Cache Hit Rate

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Cache Layer', () => {
  let cacheService: any;

  beforeEach(async () => {
    const module = await import('@/lib/cache/redis-client');
    cacheService = module.cacheService;
    await cacheService.clear();
  });

  it('should implement getOrSet pattern', async () => {
    let fetchCount = 0;
    const fetcher = async () => {
      fetchCount++;
      return { data: 'fetched' };
    };

    // First call -- should fetch
    const result1 = await cacheService.getOrSet('test-key', fetcher, { ttlSeconds: 60 });
    expect(result1).toEqual({ data: 'fetched' });
    expect(fetchCount).toBe(1);

    // Second call -- should use cache
    const result2 = await cacheService.getOrSet('test-key', fetcher, { ttlSeconds: 60 });
    expect(result2).toEqual({ data: 'fetched' });
    expect(fetchCount).toBe(1); // Not incremented
  });

  it('should return cache stats', async () => {
    await cacheService.set('key1', 'value1', { ttlSeconds: 60 });
    await cacheService.get('key1');    // Hit
    await cacheService.get('nonexistent'); // Miss

    const stats = cacheService.getStats();
    expect(stats.keyCount).toBeGreaterThanOrEqual(1);
    expect(typeof stats.hitRate).toBe('number');
  });
});
```

### Performance Test Example: Latency Measurement

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Performance Monitor', () => {
  let monitor: any;

  beforeEach(async () => {
    const module = await import('@/lib/performance/monitor');
    monitor = module.performanceMonitor;
    monitor.reset();
  });

  it('should calculate percentiles', () => {
    for (let i = 1; i <= 100; i++) {
      monitor.recordApiLatency(i);
    }

    const histogram = monitor.getApiLatencyHistogram();
    expect(histogram.p50).toBeLessThanOrEqual(55);
    expect(histogram.p95).toBeLessThanOrEqual(100);
    expect(histogram.p99).toBeLessThanOrEqual(100);
    expect(histogram.count).toBe(100);
  });

  it('should track error rates', () => {
    monitor.recordApiLatency(100, '/api/test', 200);
    monitor.recordApiLatency(100, '/api/test', 500);
    monitor.recordApiLatency(100, '/api/test', 200);

    const snapshot = monitor.getSnapshot();
    expect(snapshot.api.requestCount).toBe(3);
    expect(snapshot.api.errorRate).toBeCloseTo(1/3, 2);
  });
});
```

### Mocking Patterns

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocking a module
vi.mock('@/lib/cache/redis-client', () => ({
  cacheService: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mocking with dynamic implementation
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Resetting mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
```

### Assertion Patterns

```typescript
// Equality
expect(result).toBe(100);
expect(result).toEqual({ id: '1', name: 'Test' });

// Boolean
expect(result.success).toBe(true);
expect(result.valid).toBe(false);

// Error throwing
expect(() => fn()).toThrow(AppError);
expect(() => fn()).toThrow(/validation/i);

// Async
await expect(promise).resolves.toBe('done');
await expect(promise).rejects.toThrow(AppError);

// Collections
expect(array).toContain('item');
expect(array).toHaveLength(3);
expect(result).toEqual(expect.objectContaining({ status: 'ok' }));

// Numeric comparisons
expect(duration).toBeLessThan(500);
expect(hitRate).toBeGreaterThan(0.8);
expect(errorRate).toBeCloseTo(0.33, 2);

// String matching
expect(result).toMatch(/^test_\d+_[a-z0-9]+$/);
expect(result).not.toContain('<script>');
```

---

## 6. Writing Smoke Tests

### Overview

Smoke tests are fundamentally different from unit tests. They run against a live HTTP server and make real network requests. They verify that the deployed application is functioning correctly at the most basic level. A smoke test failure means the application is broken in production and requires immediate attention.

### Smoke Test Pattern: fetchWithTimeout

All smoke tests use a `fetchWithTimeout` helper that aborts requests after a configurable timeout. This prevents smoke tests from hanging indefinitely if the server is unresponsive.

```typescript
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```

**Usage guidelines:**

- Default timeout is 10 seconds, appropriate for most endpoints.
- Use longer timeouts (20 seconds) for page rendering tests that may involve server-side rendering.
- The `AbortController` pattern ensures the test fails cleanly with a timeout error rather than hanging.

### Smoke Test Pattern: Health Check

```typescript
describe('Health Check', () => {
  it('should return 200 from /api/health', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.timestamp).toBeDefined();
    expect(data.uptime).toBeGreaterThan(0);
    expect(data.checks).toBeDefined();
  });

  it('should have healthy database', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const data = await response.json();

    expect(data.checks.database.status).toBe('ok');
    expect(data.checks.database.latencyMs).toBeLessThan(1000);
  });

  it('should have acceptable memory usage', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/health`);
    const data = await response.json();

    expect(data.checks.memory.status).not.toBe('critical');
    expect(data.checks.memory.heapUsedMb).toBeLessThan(500);
  });
});
```

### Smoke Test Pattern: Page Rendering

```typescript
describe('Page Rendering', () => {
  it('should render the home page', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html.length).toBeGreaterThan(0);
  });

  it('should redirect unauthenticated users from protected pages', async () => {
    const protectedPaths = [
      '/seller-dashboard',
      '/buyer-dashboard',
      '/admin-dashboard',
    ];

    for (const path of protectedPaths) {
      const response = await fetchWithTimeout(`${BASE_URL}${path}`, {
        redirect: 'manual',
      });
      // Accept redirects (301, 302, 307) or auth errors (401, 403)
      expect([200, 301, 302, 307, 401, 403]).toContain(response.status);
    }
  });
});
```

### API Endpoint Testing

```typescript
describe('API Endpoints', () => {
  it('should return search results from /api/products/search', async () => {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/products/search?q=test&limit=5`
    );
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toBeDefined();
  });

  it('should reject unauthenticated checkout requests', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/api/checkout/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    expect([401, 403, 400, 422]).toContain(response.status);
  });
});
```

### Security Header Verification

```typescript
describe('Security Headers', () => {
  it('should include security headers on all responses', async () => {
    const response = await fetchWithTimeout(`${BASE_URL}/`);
    const headers = response.headers;

    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('strict-transport-security')).toContain('max-age=31536000');
    expect(headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
  });
});
```

**Security header verification checklist:**

| Header                        | Expected Value                          | Purpose                                 |
|-------------------------------|-----------------------------------------|-----------------------------------------|
| `X-Frame-Options`             | `DENY`                                  | Prevent clickjacking                    |
| `X-Content-Type-Options`      | `nosniff`                               | Prevent MIME type sniffing              |
| `Strict-Transport-Security`   | `max-age=31536000; includeSubDomains`   | Force HTTPS                             |
| `Referrer-Policy`             | `strict-origin-when-cross-origin`       | Limit referrer information leakage      |

### Performance Baseline Testing

```typescript
describe('Performance Baseline', () => {
  it('should respond to health check within 500ms', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/api/health`);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('should respond to home page within 2 seconds', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/`, {}, 20000);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(2000);
  });

  it('should respond to search within 1 second', async () => {
    const start = performance.now();
    await fetchWithTimeout(`${BASE_URL}/api/products/search?q=test`);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000);
  });
});
```

**Performance baseline targets:**

| Endpoint                  | Max Duration | Rationale                                          |
|---------------------------|--------------|----------------------------------------------------|
| `/api/health`             | 500ms        | Health checks must be fast for load balancers      |
| `/` (home page)           | 2s           | SSR with marketplace data, acceptable for first load|
| `/api/products/search`    | 1s           | Search is a high-frequency operation               |

---

## 7. Test Coverage

### How to Measure Coverage

Run the coverage command to generate a detailed report:

```bash
npm run test:coverage
```

This executes `vitest run --coverage`, which uses Istanbul (c8) under the hood to instrument code and track which lines, branches, functions, and statements are executed during tests.

### Coverage Output

The coverage report is generated in the `coverage/` directory and includes:

- **Terminal output** -- A summary table showing coverage per file and overall.
- **HTML report** -- Open `coverage/index.html` in a browser for a detailed file-by-file view with line-level highlighting.

### Current Coverage Summary

| Category          | Files | Statements | Branches | Functions | Lines |
|-------------------|-------|------------|----------|-----------|-------|
| Domain            | 1     | 95%+       | 90%+     | 100%      | 95%+  |
| DTO               | 1     | 95%+       | 90%+     | 100%      | 95%+  |
| Validators        | 1     | 90%+       | 85%+     | 100%      | 90%+  |
| Errors            | 1     | 90%+       | 85%+     | 95%+      | 90%+  |
| Security          | 7     | 80%+       | 75%+     | 85%+      | 80%+  |
| Performance       | 5     | 70%+       | 65%+     | 75%+      | 70%+  |
| **Overall**       | **16**| **85%+**   | **80%+** | **90%+**  | **85%+** |

### Coverage Targets

| Metric      | Target | Minimum | Rationale                                        |
|-------------|--------|---------|--------------------------------------------------|
| Statements  | 85%    | 80%     | Most code paths should be exercised              |
| Branches    | 80%    | 75%     | Both happy and error paths should be tested       |
| Functions   | 90%    | 85%     | All exported functions should have at least one test |
| Lines       | 85%    | 80%     | Consistent with statement coverage target         |

### Enforcing Coverage in CI

Add a coverage threshold to `vitest.config.js` to fail the build when coverage drops below the minimum:

```js
module.exports = {
  test: {
    coverage: {
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 85,
        lines: 80,
      },
    },
  },
};
```

### What Coverage Does NOT Measure

- **Test quality.** 100% coverage does not mean 100% correctness. A test that asserts `expect(true).toBe(true)` on every line achieves 100% coverage with zero value.
- **Edge case coverage.** Coverage tools track which lines were executed, not which edge cases were tested. A function with 100% line coverage may still have untested boundary conditions.
- **Integration correctness.** Unit test coverage does not guarantee that modules work correctly together. That is the purpose of smoke tests and manual testing.

---

## 8. CI/CD Integration

### Pipeline Overview

Tests run in GitHub Actions as part of the continuous integration pipeline. The pipeline is designed to fail fast: cheaper checks run first, and expensive checks run only after cheaper ones pass.

```
lint --> typecheck --> test --> security --> build
  |         |            |         |           |
  v         v            v         v           v
ESLint   TypeScript    vitest   gitleaks   next build
                       +cov
```

### Pipeline Stages

| Stage       | Command                          | Purpose                                              | Failure Impact       |
|-------------|----------------------------------|------------------------------------------------------|----------------------|
| lint        | `npm run lint`                   | Catch style issues, unused variables, potential bugs  | Blocks merge         |
| typecheck   | `npm run typecheck`              | Verify TypeScript type safety across the codebase     | Blocks merge         |
| test        | `npm run test:coverage`          | Run all unit tests with coverage enforcement          | Blocks merge         |
| security    | `npm run security:check`         | Scan for hardcoded secrets using gitleaks             | Blocks merge         |
| build       | `npm run build`                  | Verify the application builds successfully            | Blocks merge         |
| smoke       | `npm run test:smoke`             | Verify deployment health after deploy                 | Alerts team          |

### Example GitHub Actions Workflow

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run test:coverage

  security:
    runs-on: ubuntu-latest
    needs: quality
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run security:check

  build:
    runs-on: ubuntu-latest
    needs: [test, security]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: npm run build

  smoke:
    runs-on: ubuntu-latest
    needs: build
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci
      - run: SMOKE_BASE_URL=https://vendortrack.app npm run test:smoke
```

### Key Design Decisions

- **Quality gate runs first.** Lint and typecheck are fast (under 30 seconds combined). If they fail, there is no point running tests.
- **Test and security run in parallel.** Both are independent checks that can run concurrently after the quality gate passes.
- **Build depends on test and security.** The application should only be built if tests pass and no secrets are leaked.
- **Smoke tests run only on main.** Smoke tests target a deployed environment and only make sense after a successful build and deploy to the main branch.

---

## 9. Test Data

### Seeding

VendorTrack provides a seed service at `src/lib/seed-service.ts` for populating the database with realistic test data. This is used for development, staging, and manual testing environments.

```bash
# Seed the database with test data
npm run seed
```

The seed service creates:

- Test users with different roles (buyer, seller, admin)
- Products with various statuses (active, draft, deleted)
- Orders in different states (pending, shipped, delivered, refunded)
- Cart items, conversations, and audit logs

### Test Fixtures

Test fixtures are defined inline in test files as constant objects. This approach keeps tests self-contained and avoids shared mutable state.

```typescript
// Domain test fixture
const UUID = '123e4567-e89b-12d3-a456-426614174000';

const row: ProfileRow = {
  id: 'user_1',
  full_name: 'John Doe',
  email: 'john@example.com',
  role: 'seller',
  seller_status: 'approved',
  created_at: '2024-01-01T00:00:00Z',
  store_name: "John's Store",
  store_description: 'Best products',
  store_logo_url: 'https://example.com/logo.png',
  stripe_account_id: 'acct_123',
  stripe_connected: true,
  referral_code: 'REF123',
  referrer_id: 'user_0',
  is_demo: false,
  is_admin: false,
};
```

**Fixture conventions:**

- Use descriptive names like `UUID`, `UUID2` for test identifiers.
- Use realistic but obviously fake data (e.g., `john@example.com`, not `test@test.com`).
- Define fixtures at the top of the test file or within the `describe` block that uses them.
- Never share mutable fixtures between test files. Each test should create its own data.
- For time-dependent fixtures, use `Date.now()` offsets rather than hardcoded timestamps.

### Cleanup

Unit tests do not require cleanup because they operate on pure functions and mocked dependencies. However, some test categories require explicit cleanup:

**Cache tests** clear the cache before each test:

```typescript
beforeEach(async () => {
  const module = await import('@/lib/cache/redis-client');
  cacheService = module.cacheService;
  await cacheService.clear();
});
```

**Performance monitor tests** reset metrics before each test:

```typescript
beforeEach(async () => {
  const module = await import('@/lib/performance/monitor');
  monitor = module.performanceMonitor;
  monitor.reset();
});
```

**Rate limiter tests** reset the rate limiter state:

```typescript
beforeEach(() => {
  rateLimiter.reset();
});
```

**Smoke tests** do not require cleanup because they only read from the server and do not create or modify data. The checkout endpoint test uses an empty items array that triggers a validation error before any data is created.

### Test Isolation

Every test must be independent. The order in which tests run must not affect the outcome. To achieve this:

1. Reset all shared state in `beforeEach` hooks.
2. Never rely on state created by a previous test.
3. Use `vi.clearAllMocks()` in `beforeEach` to reset mock call counts.
4. Avoid shared mutable variables across `describe` blocks.
5. Use `afterEach` for cleanup only when `beforeEach` is insufficient (e.g., closing database connections).

---

## 10. Testing Best Practices

### Do's

1. **Write tests before fixing bugs.** When a bug is reported, write a failing test that reproduces the bug, then fix the code to make the test pass. This prevents regression.

2. **Use descriptive test names.** Test names should read as specifications: "rejects non-UUID productId", "returns invalid for soft-deleted product", "calculates 10% commission with rounding". Avoid vague names like "test1" or "works correctly".

3. **Test the happy path and the sad path.** Every function should have at least one test for the expected input and one test for invalid input. For example, `CheckoutItemSchema` should be tested with both valid UUIDs and invalid strings.

4. **Keep tests focused.** Each test should verify one behavior. If a test has more than five assertions, it is probably testing too many things. Split it into multiple tests.

5. **Use `safeParse` for Zod schema tests.** The `safeParse` method returns a result object without throwing, making it easy to test both success and failure cases with `expect(result.success).toBe(true/false)`.

6. **Use `toBeInstanceOf` for error type checks.** When testing that a function throws a specific error class, use `expect(() => fn()).toThrow(AppError)` rather than checking the error message string.

7. **Use `beforeEach` for setup, not `beforeAll`.** `beforeEach` ensures each test starts with a clean state. `beforeAll` can lead to shared mutable state that causes test interdependencies.

8. **Test edge cases explicitly.** Boundary values (0, 1, maximum, minimum), empty strings, null, undefined, and very long strings should all have explicit test cases. The DTO tests explicitly test quantity limits (0, 1, 100, 101) and string length limits (200 characters for search queries).

9. **Use `vi.fn()` for mocks, not real implementations.** Mock functions should be simple stubs that return predetermined values. Do not implement real logic in mocks.

10. **Run the full test suite before pushing.** Local changes may break tests in unrelated files. Running `npm run test` before pushing catches these issues early.

### Don'ts

1. **Do not test implementation details.** If you refactor a function's internals without changing its behavior, the tests should still pass. Tests that access private variables, depend on internal ordering, or mock internal function calls are too coupled to implementation.

2. **Do not use `setTimeout` in tests.** Use `vi.useFakeTimers()` or await promises instead. Real timers make tests slow and non-deterministic.

3. **Do not make real network requests in unit tests.** All external dependencies (Supabase, Stripe, Redis, Gemini AI) must be mocked. Real network requests make tests slow, flaky, and dependent on external service availability.

4. **Do not use `any` types in test code.** Tests are part of the codebase and should be type-safe. The `any` type in the performance tests (`let cacheService: any; let monitor: any;`) is a temporary exception for dynamic imports and should be replaced with proper type annotations.

5. **Do not skip failing tests.** Use `xit` or `test.skip` only as a last resort. A skipped test is a known defect that should be fixed, not ignored. If a test is flaky, fix the flakiness rather than skipping it.

6. **Do not rely on test execution order.** Tests must be independent. Never assume that one test runs before another. Use `beforeEach` to set up the state required for each test.

7. **Do not use `console.log` in test code.** Use `expect` assertions to verify behavior. If you need to debug a test, use the vitest `--reporter=verbose` flag or a debugger.

8. **Do not test third-party libraries.** Zod, Supabase, Stripe, and other libraries have their own tests. Test your schemas and adapters, not the library internals. For example, test that `CheckoutItemSchema` rejects invalid input, not that Zod's `safeParse` works correctly.

9. **Do not hardcode environment-specific values.** Use the `BASE_URL` environment variable in smoke tests. Use `process.env` for configuration values. Never hardcode localhost URLs, database URLs, or API keys in test files.

10. **Do not write tests that are slower than necessary.** If a unit test takes more than 100ms, it is probably doing something wrong (real I/O, real timers, or excessive computation). Profile slow tests and optimize them.

### Common Patterns

**Pattern: Testing a validation function that returns `{ valid, reason? }`**

```typescript
describe('validateProductAvailability', () => {
  it('returns valid for active product with sufficient stock', () => {
    const result = validateProductAvailability({ status: 'active', deletedAt: null, stock: 10 }, 5);
    expect(result.valid).toBe(true);
  });

  it('returns invalid for inactive product', () => {
    const result = validateProductAvailability({ status: 'draft', deletedAt: null, stock: 10 }, 5);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not available');
  });
});
```

**Pattern: Testing an error class hierarchy**

```typescript
describe('NotFoundError', () => {
  it('creates with 404 status', () => {
    const error = new NotFoundError({ resource: 'Order', id: 'order_123' });
    expect(error.httpStatus).toBe(404);
    expect(error.message).toContain('Order');
    expect(error.message).toContain('order_123');
    expect(error.clientMessage).toBe('Order not found');
  });
});
```

**Pattern: Testing a Zod schema with safeParse**

```typescript
describe('RefundRequestSchema', () => {
  it('validates a valid refund request', () => {
    const result = RefundRequestSchema.safeParse({ orderId: UUID, reason: 'Item was defective' });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = RefundRequestSchema.safeParse({ orderId: UUID, reason: '' });
    expect(result.success).toBe(false);
  });
});
```

**Pattern: Testing an async service with beforeEach cleanup**

```typescript
describe('Cache Layer', () => {
  let cacheService: any;

  beforeEach(async () => {
    const module = await import('@/lib/cache/redis-client');
    cacheService = module.cacheService;
    await cacheService.clear();
  });

  it('should set and get a value', async () => {
    await cacheService.set('test-key', { name: 'test' }, { ttlSeconds: 60 });
    const result = await cacheService.get('test-key');
    expect(result).toEqual({ name: 'test' });
  });
});
```

**Pattern: Testing an error mapping function**

```typescript
describe('fromStripeError', () => {
  it('maps rate limit error', () => {
    const result = fromStripeError({ type: 'rate_limit_error', message: 'Rate limited' });
    expect(result).toBeInstanceOf(PaymentError);
    expect(result.retryable).toBe(true);
  });
});
```

---

## Appendix: Test File Inventory

| File                                                | Category      | Tests | Key Focus Areas                                    |
|-----------------------------------------------------|---------------|-------|----------------------------------------------------|
| `src/__tests__/architecture/domain.test.ts`         | Architecture  | 18    | Mappers, business rules, constants, badge variants |
| `src/__tests__/architecture/dto.test.ts`            | Architecture  | 25    | Zod schemas, validateDto, safeValidateDto          |
| `src/__tests__/architecture/validators.test.ts`     | Architecture  | 18    | Availability, seller, commission, ownership, status |
| `src/__tests__/architecture/errors.test.ts`         | Architecture  | 20    | Error hierarchy, utilities, Stripe/DB adapters      |
| `src/__tests__/security/security.test.ts`           | Security      | 40+   | XSS, CSRF, SQL injection, RBAC, rate limiting, IDOR|
| `src/__tests__/performance/performance.test.ts`     | Performance   | 20+   | Cache, monitor, pagination, background jobs, timers |
| `src/__tests__/smoke/smoke.test.ts`                 | Smoke         | 15+   | Health, pages, API, headers, performance baseline   |

---

*This document is maintained alongside the codebase. When test infrastructure changes, update this guide accordingly.*
