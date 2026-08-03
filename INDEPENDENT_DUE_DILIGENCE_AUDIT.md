# VendorTrack — Independent Acquisition Due Diligence Audit

> Prepared by: Independent Due Diligence Team  
> Date: 2026-08-01  
> Methodology: Full source code audit, test execution, attack simulation, infrastructure verification  
> Standard: Evidence-based verification — no assumptions, no inherited scores

---

## Executive Summary

This audit was conducted as if a private equity firm had engaged us to determine whether VendorTrack is worth a $500,000 acquisition. We examined every claim, read every source file, ran every test, and attempted to break the application.

**The previous scores are inflated.** The platform demonstrates genuine architectural vision, security awareness, and engineering effort. However, multiple critical bugs, non-functional infrastructure, and inflated quality scores significantly reduce the acquisition value from what has been claimed.

**The platform is NOT production-ready as-is.** It requires targeted fixes before it can be deployed or demonstrated to a buyer. The core architecture is sound, but the implementation has integrity gaps that contradict the documentation's claims.

---

## Claim Verification Matrix

| Previous Claim | Verified? | Evidence | Adjusted Score |
|---------------|-----------|----------|---------------|
| **96/100 overall readiness** | ❌ **REJECTED** | 3 critical runtime bugs, non-functional monitoring, Docker build fails | 72/100 |
| **91/100 security score** | ❌ **REJECTED** | Health endpoint leaks env vars, no-op virus scanner, bypassable HTML sanitizer, in-memory rate limiting | 70/100 |
| **88/100 architecture score** | ⚠️ **PARTIALLY** | Structure is sound, but 2 runtime bugs, layer violations, dead code | 82/100 |
| **250+ tests** | ✅ **VERIFIED** | 265 test cases found, 243 pass, 22 fail (environmental) | Accurate |
| **111 security tests** | ✅ **VERIFIED** | Exactly 111 `it()` blocks in `security.test.ts` | Accurate |
| **8 services, 7 repositories** | ✅ **VERIFIED** | All files exist and export correctly | Accurate |
| **Stripe Connect destination charges** | ✅ **VERIFIED** | `createCheckoutSession()` creates destination charges with 10% commission | Accurate |
| **Self-healing webhooks** | ✅ **VERIFIED** | `webhooks/stripe/route.ts` auto-refunds on fulfillment failure | Accurate |
| **Immutable double-entry ledger** | ⚠️ **PARTIALLY** | RLS prevents UPDATE/DELETE, but service_role bypasses RLS; ledger entries use empty `order_id` | 75% verified |
| **Atomic transactions** | ✅ **VERIFIED** | `fulfill_order()` RPC uses `SELECT FOR UPDATE` with stock decrement | Accurate (but only handles first item) |
| **Docker-ready** | ❌ **REJECTED** | `package-lock.json` pins Next.js 9.3.3 (incompatible), missing `public/` dir, worker crashes | Not buildable |
| **Prometheus/Grafana monitoring** | ❌ **REJECTED** | Prometheus can't auth to `/api/performance`, Alertmanager webhook 404s | Non-functional |
| **12 feature flags** | ⚠️ **PARTIALLY** | Feature flag code exists but is never imported — dead code | Code exists, not integrated |
| **12 job types** | ⚠️ **PARTIALLY** | Background job code exists but is never imported — dead code | Code exists, not integrated |
| **Row Level Security** | ✅ **VERIFIED** | 34 RLS policies across all tables, properly scoped | Accurate |
| **Cursor-based pagination** | ✅ **VERIFIED** | 8 specialized indexes for cursor pagination in `supabase-performance-migration.sql` | Accurate |
| **OWASP Top 10 compliant** | ⚠️ **PARTIALLY** | Headers and CSRF are compliant, but health endpoint leaks info, sanitizer is bypassable | 70% compliant |
| **25+ documentation files** | ✅ **VERIFIED** | 43 `.md` files at root, 12 in `docs/` | Accurate |
| **7-stage CI/CD pipeline** | ✅ **VERIFIED** | `ci-cd.yml` has 8 stages with security scanning, build, deploy, rollback | Accurate |

---

## Critical Risks (Must Fix Before Any Deployment)

### CRITICAL-1: Docker Build Will Fail
- **File**: `package-lock.json`
- **Evidence**: `package-lock.json` pins Next.js 9.3.3, but `package.json` requires `^14.2.0`. `npm ci` installs 9.3.3. App Router code is incompatible.
- **Impact**: The application cannot be deployed via Docker. The build fails at `npm run build`.
- **Risk**: Acquisition value is zero if the application cannot be deployed.

### CRITICAL-2: Worker Container Crashes on Startup
- **File**: `Dockerfile.worker:18`
- **Evidence**: `CMD ["node", "-e", "require('./src/lib/performance/background-jobs').startWorker()"]` — function `startWorker()` does not exist. The actual export is `runBackgroundWorker()`.
- **Impact**: Background job processing (payment retry, reconciliation, notifications) is non-functional.
- **Risk**: Payment failures cannot be retried, reconciliation cannot run, notifications are not sent.

### CRITICAL-3: Monitoring Stack Is Non-Functional
- **File**: `monitoring/prometheus.yml:20`, `monitoring/alertmanager.yml:35`
- **Evidence**: Prometheus scrapes `/api/performance` which requires admin auth (401). Alertmanager sends to `/api/alerts/webhook` which does not exist (404).
- **Impact**: The entire observability stack (Prometheus, Grafana, Alertmanager) is non-functional.
- **Risk**: No operational visibility in production. Errors, performance degradation, and outages go undetected.

### CRITICAL-4: Performance API Route Is Broken
- **File**: `src/app/api/performance/route.ts:23`
- **Evidence**: `requireAuth({ permission: PERMISSIONS.ADMIN_READ })` — `PERMISSIONS.ADMIN_READ` does not exist in the RBAC system. The route returns 401 for all users including admins.
- **Impact**: The performance monitoring endpoint is inaccessible. Prometheus cannot scrape metrics.
- **Risk**: No metrics collection, no alerting, no Grafana dashboards.

### CRITICAL-5: Health Endpoint Leaks Infrastructure Details
- **File**: `src/app/api/health/route.ts:153-166`
- **Evidence**: Unauthenticated endpoint returns which environment variables are missing (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`, `SENTRY_DSN`), Redis hostname, and database connection details.
- **Impact**: An unauthenticated attacker learns which services the app integrates with, which API keys exist, and internal infrastructure topology.
- **Risk**: Active reconnaissance vulnerability. Enables targeted attacks.

---

## Medium Risks (Should Fix Before Production)

### MEDIUM-1: Runtime Bug — Missing Import in Search Service
- **File**: `src/services/search-service.ts:37`
- **Evidence**: `getSupabaseAdmin()` is called but never imported. Would cause `ReferenceError` at runtime.
- **Impact**: Product search suggestions would crash.

### MEDIUM-2: Runtime Bug — Non-existent Method in Checkout Service
- **File**: `src/services/checkout-service.ts:99`
- **Evidence**: `productRepository.findByIdsWithSeller(productIds)` — method does not exist. Only `findByIds()` and `findByIdWithSeller()` exist.
- **Impact**: Checkout would crash when processing cart items.

### MEDIUM-3: Multi-Item Orders Only Partially Handled
- **File**: `docs/supabase-schema.sql:111`
- **Evidence**: `fulfill_order()` v1 and v2 only create one order record from the first item in the session, even though the stock decrement loop processes all items.
- **Impact**: If a buyer checks out with 3 different products, only 1 order is created, but stock is decremented for all 3. Financial records are inconsistent.

### MEDIUM-4: Dashboard Materialized View Has Wrong Column Name
- **File**: `docs/supabase-performance-migration.sql`
- **Evidence**: `mv_dashboard_metrics` references `amount_cents` from orders, but the actual column is `amount_total_cents`.
- **Impact**: The dashboard metrics view would fail to create, breaking the admin dashboard.

### MEDIUM-5: In-Memory Rate Limiting Is Not Distributed
- **File**: `src/lib/security/rate-limit.ts:71`
- **Evidence**: `RateLimitStore` is in-memory. Multi-instance deployments have per-process limits, effectively multiplying the allowed rate by the number of instances.
- **Impact**: Rate limits are trivially bypassable in any multi-instance deployment (Vercel, Kubernetes).

### MEDIUM-6: Custom HTML Sanitizer Is Bypassable
- **File**: `src/lib/security/sanitize.ts:117-179`
- **Evidence**: Regex-based HTML sanitization can be bypassed with malformed HTML (`<img/src=x onerror=alert(1)>` or `<script\x0b>`). A production-grade sanitizer like DOMPurify should be used.
- **Impact**: XSS attacks are possible through user-generated content.

### MEDIUM-7: Cron Routes Allow Access When CRON_SECRET Is Unset
- **Files**: `src/app/api/cron/*/route.ts`
- **Evidence**: `verifyCronRequest()` returns `process.env.NODE_ENV !== 'production'` when `CRON_SECRET` is unset. If the env var is accidentally removed, cron routes become publicly accessible.
- **Impact**: Unauthenticated users could trigger reconciliation, cache warming, or health checks.

### MEDIUM-8: Ledger Entries Use Empty `order_id`
- **File**: `src/app/api/webhooks/stripe/route.ts:204,268,305,339`
- **Evidence**: Multiple ledger entries use `order_id: ''` instead of the actual order ID.
- **Impact**: The financial ledger's audit trail is broken. Ledger entries cannot be correlated to orders.

### MEDIUM-9: Search Suggestion Endpoint Not Sanitized
- **File**: `src/app/api/products/search/route.ts:41`
- **Evidence**: The `suggest` parameter is passed directly to the search service without sanitization, while `q` is sanitized.
- **Impact**: Potential injection via suggestion prefix.

---

## Low Risks (Should Fix Over Time)

| # | Risk | File | Evidence |
|---|------|------|----------|
| L1 | No-op virus scanner | `upload.ts:322-328` | `defaultVirusScanner.scan()` always returns `{ clean: true }` |
| L2 | Image URL allowlist is advisory, not enforced | `upload.ts:407-414` | Untrusted domains logged but still return `{ valid: true }` |
| L3 | `Math.random()` for correlation IDs | `security-logger.ts:227` | Predictable IDs; should use `crypto.randomBytes()` |
| L4 | `headers()` called without `await` in webhook | `webhooks/stripe/route.ts:40` | May break in Next.js 14+ |
| L5 | Error codes in client responses | `errors.ts:494` | Reveals system architecture to attackers |
| L6 | ALLOWED_ORIGINS set is empty | `csrf.ts:35-38` | Relies on host-header matching |
| L7 | Hardcoded 10% commission rate | `refund-service.ts:464` | Not configurable |
| L8 | Non-atomic batch ledger creation | `ledger-service.ts` | If one insert fails, ledger is inconsistent |
| L9 | `node-exporter` referenced but not defined | `docker-compose.monitoring.yml` | Prometheus scrape errors |
| L10 | `next.config.js` deprecated keys | `next.config.js` | `instrumentationHook`, `serverComponentsExternalPackages` deprecated |

---

## Technical Debt

| Category | Items | Severity |
|----------|-------|----------|
| **Dead Code** | 10+ files never imported (`placeholder-images.ts/json`, `db-benchmark.ts`, `cache.ts`, `lib/repositories/user-repository.ts`, `lib/monitoring/` (5 files), `performance/background-jobs.ts`) | Low |
| **Code Duplication** | 3 duplicate module pairs: `lib/analytics-service.ts` vs `services/analytics-service.ts`, `lib/repositories/user-repository.ts` vs `repositories/user-repository.ts`, `lib/cache.ts` vs `lib/cache/index.ts` | Medium |
| **Phantom Dependencies** | 6 packages imported in code but missing from `package.json` (`@sentry/nextjs`, `@opentelemetry/*`) | Medium (dead code, so no runtime impact) |
| **Stale package-lock.json** | Pins Next.js 9.3.3 while `package.json` requires 14.2.0 | Critical |
| **Missing `public/` directory** | Required by Dockerfile COPY step | Critical |
| **Two Parallel RBAC Systems** | `rbac.ts` `ROUTE_PROTECTION` vs `middleware.ts` `PROTECTED_ROUTES` — permissions in `ROUTE_PROTECTION` are never enforced | Medium |
| **In-Memory Stores** | Rate limiting, attack pattern tracker, token budget, circuit breaker — all in-memory, not distributed | Medium |
| **RLS Bypass** | `service_role` bypasses all RLS policies including financial ledger immutability; no trigger-based enforcement | Medium |

---

## Acquisition Risks

| Risk | Evidence | Impact |
|------|----------|--------|
| **Cannot deploy as-is** | Docker build fails (wrong Next.js version), worker crashes, monitoring non-functional | **High** — Buyer cannot evaluate the platform without significant fix effort |
| **Inflated quality scores** | Previous reports claim 96/100, 91/100, 88/100 — actual verified scores are 72/100, 70/100, 82/100 | **High** — Trust deficit; buyer must re-verify all claims |
| **Dead code masquerading as features** | Feature flags, background jobs, Sentry, OpenTelemetry — code exists but is never imported | **Medium** — Features listed in documentation are not actually active |
| **Monitoring is non-functional** | Prometheus can't scrape, Alertmanager can't notify, Grafana has no data | **High** — No operational visibility in production |
| **Single-point-of-failure security** | Rate limiting, attack tracking, token budgets all in-memory, single-process only | **Medium** — Security claims are only valid for single-instance deployments |
| **Financial integrity has gaps** | Ledger entries with empty order_ids, multi-item order bug, non-atomic batch creation | **Medium** — The core differentiator (financial integrity) has implementation gaps |

---

## Operational Risks

| Risk | Evidence | Impact |
|------|----------|--------|
| **No working deployment method** | Docker build fails; Vercel deploy untested | **Critical** — Cannot go to production |
| **Background worker non-functional** | `startWorker()` does not exist | **Critical** — Payment retries, reconciliation, notifications don't work |
| **No monitoring** | Prometheus 401s, Alertmanager 404s | **Critical** — No visibility into production issues |
| **Health endpoint leaks info** | Returns env var names, Redis hostname | **High** — Active reconnaissance vulnerability |
| **In-memory rate limiting** | Not distributed across instances | **Medium** — Rate limits ineffective in multi-instance deployments |
| **No virus scanning** | No-op placeholder | **Medium** — Malicious file uploads pass through |

---

## Verified Scores

### Maintainability Score: 72/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Code organization | 85 | Clean 4+1 layered architecture, but layer violations exist |
| Code duplication | 65 | 3 duplicate module pairs, 10+ dead code files |
| Naming consistency | 80 | Generally consistent, but `lib/` vs `services/` overlap |
| Dead code | 60 | 10+ dead files, phantom dependencies, unused UI components |
| Documentation | 90 | 43+ `.md` files, but inflated scores undermine trust |
| Type safety | 85 | Full TypeScript, but runtime bugs suggest insufficient integration testing |

### Security Score: 70/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Authentication | 90 | Supabase Auth with JWT, `requireAuth()` on all actions |
| Authorization (RBAC) | 80 | Proper RBAC, but two parallel systems, `PERMISSIONS.ADMIN_READ` bug |
| Input validation | 85 | Zod schemas on all API routes, DTOs at boundaries |
| CSRF protection | 90 | HMAC-based tokens, timing-safe comparison, double-submit cookie |
| XSS protection | 60 | Custom regex sanitizer is bypassable; needs DOMPurify |
| Rate limiting | 50 | In-memory only, 3 paths in middleware, IP spoofing via X-Forwarded-For |
| Information disclosure | 55 | Health endpoint leaks env vars, Redis hostname, DB details |
| File upload security | 50 | No-op virus scanner, advisory-only URL allowlist |
| Webhook security | 95 | Signature verification, replay protection, idempotency |
| Financial security | 80 | No refund without Stripe confirmation, but ledger has empty order_ids |

### Architecture Score: 82/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Layer separation | 85 | 4 clear layers, but analytics-service bypasses repository |
| Domain purity | 95 | Zero imports from other layers |
| Dependency direction | 80 | Mostly correct, but repository imports from DTO |
| Error handling | 90 | Comprehensive error hierarchy with client-safe messages |
| API design | 85 | RESTful with DTOs, but `PERMISSIONS.ADMIN_READ` bug |
| Runtime correctness | 70 | 2 runtime bugs (missing import, non-existent method) |

### Performance Score: 78/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Caching strategy | 85 | Multi-layer (Redis + LRU + Next.js), but Redis not actually verified |
| Database optimization | 90 | 55+ indexes, cursor pagination, trigram search |
| Connection management | 70 | Stripe client created per call, no connection pooling evidence |
| Background jobs | 60 | Code exists but is dead code (never imported), worker crashes |
| Feature flags | 60 | Code exists but is dead code (never imported) |

### Documentation Score: 85/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Coverage | 95 | 43+ `.md` files covering every aspect |
| Accuracy | 65 | Inflated scores, features listed as working that are dead code |
| Code examples | 90 | Deployment steps, SQL schemas, API examples |
| Operational runbook | 90 | 10-section runbook with step-by-step procedures |
| Onboarding | 85 | Developer guide, demo guide, user guides |

### Deployment Score: 45/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Docker build | 20 | Fails due to wrong Next.js version, missing `public/` dir |
| Worker container | 10 | Crashes on startup (wrong function name) |
| Monitoring stack | 15 | Prometheus 401s, Alertmanager 404s, no node-exporter |
| CI/CD pipeline | 85 | Well-structured 7-stage pipeline |
| Vercel configuration | 90 | Valid vercel.json with cron jobs, regions, headers |
| Environment templates | 90 | Comprehensive `.env.example` and `.env.production.example` |

### Engineering Score: 72/100

| Factor | Score | Evidence |
|--------|-------|----------|
| Test coverage | 80 | 265 tests, 243 pass, architecture/security/performance coverage |
| Code quality | 75 | Clean TypeScript, but dead code, duplication, runtime bugs |
| Security awareness | 85 | Comprehensive security module, but implementation gaps |
| Financial integrity | 80 | Atomic transactions, self-healing webhooks, but ledger gaps |
| Integration testing | 40 | No E2E tests, runtime bugs suggest insufficient integration testing |
| DevOps maturity | 65 | Good CI/CD, but Docker broken, monitoring non-functional |

---

## Overall Acquisition Score

| Dimension | Previous Claim | Verified Score | Delta |
|-----------|---------------|----------------|-------|
| Security | 98/100 | **70/100** | -28 |
| Architecture | 97/100 | **82/100** | -15 |
| Database | 95/100 | **85/100** | -10 |
| Payments | 96/100 | **80/100** | -16 |
| DevOps | 94/100 | **55/100** | -39 |
| Monitoring | 90/100 | **25/100** | -65 |
| Documentation | 95/100 | **85/100** | -10 |
| Demo Readiness | 98/100 | **75/100** | -23 |
| **Overall** | **96/100** | **72/100** | **-24** |

---

## Strengths

1. **Genuine architectural vision** — The 4+1 layered architecture is well-designed. Domain purity is real. The service/repository pattern is sound.

2. **Self-healing webhooks are real** — The Stripe webhook handler genuinely auto-refunds on fulfillment failure. This is a valuable feature.

3. **Comprehensive database schema** — 18 tables, 34 RLS policies, 17 RPCs, 55+ indexes. The schema is well-designed and properly secured.

4. **Thorough security awareness** — 8 dedicated security modules, 111 security tests, HMAC-based CSRF, timing-safe comparison. The code demonstrates real security expertise.

5. **Extensive documentation** — 43+ `.md` files. Even if some scores are inflated, the coverage is exceptional.

6. **Clean licensing** — All dependencies are MIT/Apache-2.0. No GPL/AGPL. No vendor lock-in risk from licensing.

7. **Test suite is real** — 265 test cases, 243 pass. The "250+ tests" claim is accurate.

8. **CI/CD pipeline is well-structured** — 7-stage pipeline with security scanning, automated deployment, and rollback capability.

---

## Weaknesses

1. **Inflated quality scores** — The most significant weakness. Every previous score is overstated by 15-65 points. This creates a trust deficit that undermines the entire acquisition package.

2. **Dead code masquerading as features** — Feature flags, background jobs, Sentry, OpenTelemetry, and production security monitoring are all listed as implemented features but are dead code that is never imported. This is misleading.

3. **Docker deployment is broken** — The application cannot be deployed via Docker. The `package-lock.json` pins an incompatible Next.js version, the `public/` directory is missing, and the worker container crashes.

4. **Monitoring stack is non-functional** — Prometheus cannot scrape metrics (401), Alertmanager cannot send alerts (404). The entire observability stack is dead.

5. **Integration testing gap** — The runtime bugs (missing import, non-existent method) suggest that the code has never been run end-to-end. The test suite covers architecture and security but not actual workflows.

6. **In-memory security** — Rate limiting, attack tracking, and token budgets are in-memory only, making them ineffective in any multi-instance deployment.

---

## Realistic Acquisition Value

### Based on Verified Evidence Only

| Method | Calculation | Value |
|--------|------------|--------|
| **Cost Approach** | Replacement cost of verified working code | $150K–$250K |
| | Replacement cost of all code (including dead) | $250K–$400K |
| **Market Approach** | Pre-revenue marketplace platform with verified bugs | $100K–$200K |
| | Same platform after critical fixes | $200K–$350K |
| **Income Approach** | Cannot generate revenue until deployed (broken Docker) | $0 (until fixed) |
| | After fixes, with 300 sellers | $200K–$350K |

### Recommended Valuation Range

| Scenario | Value |
|----------|-------|
| **As-is (with all bugs)** | $100,000–$150,000 |
| **After critical fixes (2–4 weeks of engineering)** | $200,000–$350,000 |
| **After full hardening (6–8 weeks)** | $300,000–$450,000 |

**Estimated fix effort**: 2–4 weeks of senior engineering work to resolve all critical and medium risks.

---

## Final Questions

### Would you recommend acquisition?

## **YES AFTER FIXES**

The platform has genuine architectural merit, real security awareness, and a sound database design. The self-healing webhook system and atomic transactions are valuable differentiators that are verified as working. The documentation is extensive and the codebase is well-organized.

However, the critical bugs (broken Docker build, crashing worker, non-functional monitoring, health endpoint information disclosure) make the platform undeployable as-is. A buyer who paid $500,000 for the current state would receive a platform that cannot be deployed, cannot be monitored, and cannot be demonstrated.

After 2–4 weeks of targeted engineering to fix the critical issues, the platform would be worth $200K–$350K. The claimed $500,000 valuation is not supported by the verified evidence.

---

## Required Fixes (Prioritized)

### Week 1: Critical Fixes
1. Regenerate `package-lock.json` with correct Next.js version
2. Create `public/` directory
3. Fix `Dockerfile.worker` — change `startWorker()` to `runBackgroundWorker()`
4. Fix `PERMISSIONS.ADMIN_READ` — change to `PERMISSIONS.ANALYTICS_READ`
5. Fix `/api/health` — remove env var names, Redis hostname, DB details
6. Add auth bypass or token-based auth for Prometheus `/api/performance` scraping
7. Create `/api/alerts/webhook` route for Alertmanager

### Week 2: Runtime Bugs
8. Fix `search-service.ts` — add missing `getSupabaseAdmin()` import
9. Fix `checkout-service.ts` — add `findByIdsWithSeller()` method or fix the call
10. Fix multi-item order handling in `fulfill_order()` RPCs
11. Fix `mv_dashboard_metrics` column name (`amount_cents` → `amount_total_cents`)
12. Fix cron route fallback — deny access when `CRON_SECRET` is unset

### Week 3: Security Hardening
13. Replace custom HTML sanitizer with DOMPurify
14. Add Redis-backed rate limiting (or use Upstash)
15. Fix search suggestion endpoint sanitization
16. Fix ledger entries with empty `order_id`
17. Remove dead code files

### Week 4: Integration
18. Add integration tests for checkout, search, and webhook workflows
19. Verify Docker build succeeds end-to-end
20. Verify monitoring stack works end-to-end
21. Verify worker container processes jobs
22. Run full acceptance test suite

---

*This audit was conducted independently. All findings are based on direct evidence from source code review, test execution, and static analysis. No previous scores were inherited or assumed.*
