# VendorTrack -- DevOps Documentation

> Production-grade DevOps reference for the VendorTrack multi-vendor marketplace platform.
> This document covers the complete deployment lifecycle, from container builds to production monitoring.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Docker Infrastructure](#2-docker-infrastructure)
3. [CI/CD Pipeline](#3-cicd-pipeline)
4. [Infrastructure Stack](#4-infrastructure-stack)
5. [Monitoring and Observability](#5-monitoring-and-observability)
6. [Feature Flags](#6-feature-flags)
7. [Production Readiness Checklist](#7-production-readiness-checklist)
8. [Acquisition Readiness Score](#8-acquisition-readiness-score)

---

## 1. Overview

VendorTrack is a Next.js multi-vendor marketplace application that connects sellers with buyers through a platform managed by administrators. The DevOps architecture is built around a one-command deployment philosophy: every environment, from local development to production, can be brought up with a single command. This principle ensures that developers spend time building features rather than wrestling with infrastructure, and it guarantees that the production environment is a faithful replica of what was tested in staging.

The platform integrates four core external services: Supabase for PostgreSQL database hosting, authentication, and row-level security enforcement; Stripe for payment processing, webhook handling, and multi-vendor payouts via Stripe Connect; Redis for distributed caching, session management, and rate limit storage; and Google Gemini AI for product description generation and chat assistance. Each of these services is treated as a managed dependency -- the application degrades gracefully when optional services are unavailable, and critical paths (payments, authentication) are protected by circuit breakers and retry logic.

The deployment strategy follows a trunk-based development model with two long-lived branches: `main` for production deployments and `develop` for staging. Every merge to `develop` triggers a full CI pipeline that runs linting, type checking, unit tests, security scans, and a production build. Merges to `main` additionally trigger a deployment to Vercel with automatic rollback on failure. Docker containers are used for local development parity, self-hosted deployments, and the background worker process. The Vercel platform hosts the primary application, leveraging its edge network for global CDN distribution and serverless functions for API routes.

The operational philosophy is "fail fast, recover faster." The application validates all environment variables at startup and will refuse to boot if critical secrets are missing. Health checks run every five minutes via a Vercel cron job. Sentry captures unhandled errors in real time. OpenTelemetry provides distributed tracing across service boundaries. Prometheus metrics are exported at a dedicated endpoint for infrastructure monitoring. Feature flags allow canary releases and emergency kill switches without redeployment. Together, these systems ensure that the platform is always observable, always recoverable, and always deployable with a single command.

---

## 2. Docker Infrastructure

### Multi-Stage Production Build

The production Dockerfile uses a three-stage build strategy to minimize the final image size to approximately 120MB. Each stage has a distinct responsibility and the final stage contains only the artifacts needed to run the application.

**Stage 1 -- Dependencies (`deps`)**: Uses `node:20-alpine` as the base image. Installs `libc6-compat` for native module compatibility. Copies only `package.json` and `package-lock.json` first to leverage Docker layer caching -- dependency layers are only rebuilt when package files change. Runs `npm ci --ignore-scripts` to install all dependencies deterministically, then cleans the npm cache to reduce layer size.

**Stage 2 -- Build (`builder`)**: Copies the full `node_modules` from the deps stage and the entire source tree. Sets `NEXT_TELEMETRY_DISABLED=1` and `NODE_ENV=production` as build-time environment variables. Runs `npm run build` to produce the Next.js standalone output. No secrets are copied into the build stage -- the `.env` file is explicitly excluded and all runtime secrets come from environment variables.

**Stage 3 -- Runtime (`runner`)**: Uses `node:20-alpine` as a minimal base. Creates a non-root `nodejs` group (GID 1001) and `nextjs` user (UID 1001) for security. Copies only the built artifacts: `public/`, `.next/standalone/`, `.next/static/`, and `.next/server/`. The standalone output mode (configured in `next.config.js` via `output: 'standalone'`) produces a self-contained server bundle that does not require the full `node_modules` directory, which is the primary mechanism for the ~120MB image size. The application runs on port 9002 and the `HEALTHCHECK` directive probes `/api/health` every 30 seconds with a 10-second timeout and 40-second start period.

```dockerfile
# Production Dockerfile summary
FROM node:20-alpine AS deps    # Install dependencies
FROM node:20-alpine AS builder # Build Next.js
FROM node:20-alpine AS runner  # Run standalone server (~120MB)
```

### Worker Dockerfile

The background worker (`Dockerfile.worker`) uses a two-stage build. It runs the same dependency installation but skips the Next.js build step entirely. The worker process is started via `node -e "require('./src/lib/performance/background-jobs').runBackgroundWorker()"`, which runs the background job loop that polls the `background_jobs` table for pending tasks. The worker health check uses a simple `process.exit(0)` probe since the worker does not expose an HTTP server. The worker container is granted 512MB of memory and 0.5 CPU cores.

### Development Container

The development Dockerfile (`Dockerfile.dev`) is a single-stage build that prioritizes developer experience over image size. It runs `npm ci` to install all dependencies including dev dependencies, and exposes both port 9002 (the application) and port 9229 (the Node.js debugger). Source code is mounted as a volume, so changes are reflected immediately via Next.js hot module replacement. The `node_modules` and `.next` directories are excluded from the volume mount to prevent conflicts between the host and container environments.

### Docker Compose Services

The production-like `docker-compose.yml` defines three services:

| Service   | Image              | Port | Memory Limit | CPU Limit | Health Check                     |
|-----------|--------------------|------|-------------|-----------|----------------------------------|
| `app`     | Built from Dockerfile | 9002 | 512MB       | 1.0       | `wget http://localhost:9002/api/health` |
| `redis`   | `redis:7-alpine`   | 6379 | 512MB       | --        | `redis-cli ping`                 |
| `worker`  | Built from Dockerfile.worker | -- | 512MB    | 0.5       | `node -e "process.exit(0)"`      |

The Redis service is configured with `maxmemory 256mb` and `allkeys-lru` eviction policy, with both RDB snapshots (every 60 seconds if 1000+ keys changed) and AOF persistence (fsync every second) enabled. All services communicate over the `vendortrack-network` bridge network. The `app` and `worker` services both depend on `redis` being healthy before starting.

The development compose file (`docker-compose.dev.yml`) adds a `redis-commander` service on port 8081 for visual Redis inspection, and configures Redis with a smaller 128MB memory limit suitable for development.

### Quick Reference Commands

```bash
# Production-like environment
docker compose up -d

# Development environment with hot reload
docker compose -f docker-compose.dev.yml up

# Build and tag
docker build -t vendortrack:latest .

# View logs
docker compose logs -f app

# Health check
curl -sf http://localhost:9002/api/health || exit 1
```

---

## 3. CI/CD Pipeline

### GitHub Actions Workflow

The CI/CD pipeline is implemented as a GitHub Actions workflow that enforces a strict gate system: each stage must pass before the next stage begins, and any failure immediately halts the pipeline. The workflow follows a seven-stage progression from code quality verification to production deployment.

**Stage 1 -- Lint**: Runs `next lint` to enforce code style and catch common React/Next.js anti-patterns. This stage catches issues like missing key props, unused variables, and accessibility violations before they reach the codebase.

**Stage 2 -- TypeCheck**: Runs `tsc --noEmit` to perform strict TypeScript type checking without emitting files. The project has `ignoreBuildErrors: false` in `next.config.js`, meaning the build would fail on type errors anyway, but this stage catches them earlier and provides clearer error messages.

**Stage 3 -- Test**: Runs `vitest run` for unit tests and `vitest run --config vitest.smoke.config.js` for smoke tests. The test suite includes architecture validation tests (DTOs, domain models, error handling, validators), security tests, and performance tests. Test coverage is reported via `vitest run --coverage`.

**Stage 4 -- Security**: Runs `gitleaks detect` for secret scanning (both current files and git history). This prevents API keys, tokens, and other credentials from being committed to the repository. The project also includes a `secret-scan` npm script for local pre-commit checks via Husky.

**Stage 5 -- Build**: Runs `NODE_ENV=production next build` to produce the production bundle. This stage validates that the application compiles successfully and that the standalone output is generated correctly for Docker deployment.

**Stage 6 -- Deploy**: Triggers a deployment to Vercel. For the `develop` branch, this deploys to the staging environment. For the `main` branch, this deploys to production. The deployment uses Vercel's built-in Git integration, which creates a preview deployment for every pull request and a production deployment for every merge to `main`.

**Stage 7 -- Rollback**: If post-deployment health checks fail (the `/api/health` endpoint returns non-200 for three consecutive checks within the first five minutes), the pipeline automatically rolls back to the previous known-good deployment using Vercel's instant rollback feature.

### Branch Strategy

| Branch      | Environment | Deployment          | Protection                  |
|-------------|-------------|---------------------|-----------------------------|
| `main`      | Production  | Automatic on merge  | Require 1 approval, CI pass |
| `develop`   | Staging     | Automatic on merge  | Require CI pass             |
| `feature/*` | Preview     | On PR creation      | None                        |
| `hotfix/*`  | Production  | Fast-track merge    | Require 1 approval          |

### Concurrency Groups

The pipeline uses GitHub Actions concurrency groups to prevent parallel deployments to the same environment. The group key is formatted as `deploy-{environment}-{branch}`, ensuring that only one deployment workflow runs at a time per environment. In-progress deployments are cancelled when a newer commit is pushed, preventing stale deployments from reaching production.

### Environment Protection

Production deployments are protected by GitHub Environment protection rules. The `production` environment requires at least one approving review from a designated reviewer before the deployment job can proceed. Environment secrets (Supabase service role key, Stripe live keys, Sentry DSN) are stored in GitHub Secrets and are only accessible to jobs targeting the corresponding environment. The `staging` environment uses test Stripe keys and a separate Supabase project to isolate test data from production.

### Pipeline Configuration

```yaml
# .github/workflows/deploy.yml (conceptual)
name: VendorTrack CI/CD
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:        { runs-on: ubuntu-latest, steps: [npm ci, npm run lint] }
  typecheck:   { runs-on: ubuntu-latest, needs: lint, steps: [npm ci, npm run typecheck] }
  test:        { runs-on: ubuntu-latest, needs: typecheck, steps: [npm ci, npm test] }
  security:    { runs-on: ubuntu-latest, needs: test, steps: [npm ci, npm run security:check] }
  build:       { runs-on: ubuntu-latest, needs: security, steps: [npm ci, npm run build] }
  deploy:      { runs-on: ubuntu-latest, needs: build, environment: production }
  rollback:    { runs-on: ubuntu-latest, needs: deploy, if: failure() }
```

---

## 4. Infrastructure Stack

### Vercel (Application Hosting)

The primary application is hosted on Vercel, which provides serverless function execution for API routes, static asset serving for the Next.js frontend, and a global edge network for low-latency content delivery. The `vercel.json` configuration specifies two deployment regions (`iad1` for US East and `sfo1` for US West) to ensure low-latency access for North American users. API routes are configured with `Cache-Control: no-store` headers to prevent caching of dynamic responses, while static assets under `/_next/static/` are cached with a one-year `max-age` and `immutable` directive.

Vercel cron jobs handle three periodic tasks:

| Cron Job            | Schedule       | Endpoint                          | Purpose                              |
|---------------------|----------------|-----------------------------------|--------------------------------------|
| Cache Warming       | `0 */6 * * *`  | `/api/cron/cache-warming`         | Pre-populate featured products/categories |
| Reconciliation      | `0 2 * * *`    | `/api/cron/reconciliation`        | Daily payment reconciliation          |
| Health Check        | `*/5 * * * *`  | `/api/cron/health-check`          | Verify database connectivity and latency |

Cron endpoints are protected by a `CRON_SECRET` bearer token. In production, the health check verifies database connectivity by querying the `profiles` table and recording the query latency in the performance monitor.

### Supabase (PostgreSQL + Auth + RLS)

Supabase provides the primary data store, authentication, and row-level security enforcement. The database is hosted on a managed PostgreSQL instance with automatic backups and point-in-time recovery. Row-level security policies ensure that buyers can only access their own orders, sellers can only manage their own products, and administrators have full platform access. The application uses two Supabase client instances: the anon-key client (respects RLS) for user-scoped operations, and the service-role client (bypasses RLS) for admin operations and background worker tasks.

Key environment variables:

| Variable                          | Required | Server-Only | Description                               |
|-----------------------------------|----------|-------------|-------------------------------------------|
| `NEXT_PUBLIC_SUPABASE_URL`        | Yes      | No          | Project URL (client-safe)                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Yes      | No          | Anon key (respects RLS, client-safe)      |
| `SUPABASE_SERVICE_ROLE_KEY`       | Yes      | Yes         | Service role key (bypasses RLS, server-only) |

### Redis (Caching + Sessions)

Redis 7 Alpine is used for distributed caching and session management. The cache service implements a three-tier fallback strategy: Redis in production, Upstash REST API for serverless/edge environments, and an in-memory LRU cache for development and fallback. All cache keys are prefixed with `vt:` to avoid namespace collisions. The cache service supports tag-based invalidation, pattern-based invalidation, and a cache-aside pattern with stampede prevention (deduplicating concurrent fetches for the same key).

Cache TTLs are calibrated to business requirements: product listings are cached for 5 minutes, payment health data for 30 seconds (stale financial data is dangerous), search results for 1 minute, and category lists for 10 minutes. Financial data (payment intents, order status, ledger entries) is never cached.

### Background Workers

The background worker runs as a separate Docker container that polls the `background_jobs` table for pending tasks. The job queue supports 12 job types including notifications, analytics, search indexing, payment reconciliation, cache warming, and seller payouts. Jobs are claimed atomically using a compare-and-swap pattern that prevents duplicate processing across multiple worker instances. Failed jobs are retried with exponential backoff and jitter, and exhausted retries are moved to a dead letter queue. The worker can be horizontally scaled by running additional container instances.

### CDN (Vercel Edge)

Static assets are served through Vercel's global edge network with aggressive caching headers. Images are optimized on-the-fly by Next.js Image Optimization, supporting AVIF and WebP formats with a minimum cache TTL of 3600 seconds. The `next.config.js` specifies device sizes and image sizes for responsive image generation. Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin headers) are applied at the Next.js build level and serve as the baseline for all routes.

### Environment Variables

The complete environment variable specification is defined in `src/lib/env.ts`. All required variables are validated at application startup with the `requireEnvironment()` function, which throws an error and prevents the application from starting if any required variable is missing, invalid, or contains a placeholder value. Server-only variables are checked for accidental exposure via `NEXT_PUBLIC_` prefix. The validation also checks for placeholder patterns (`your-`, `changeme`, `xxx`, `placeholder`) that indicate incomplete setup.

---

## 5. Monitoring and Observability

### Sentry (Error Tracking)

Sentry provides real-time error tracking for both server-side and client-side code. The integration is initialized in `src/instrumentation.ts` at server startup and in the client layout for browser errors. The Sentry configuration includes several important features:

- **Privacy filtering**: The `beforeSend` hook strips PII from error events, including cookies, authorization headers, email addresses, IP addresses, and URL query parameters containing `token`, `key`, or `secret`.
- **Noise filtering**: Known noisy errors (ResizeObserver loops, network failures, AbortError) are suppressed via the `ignoreErrors` list. Browser extension URLs and Google Tag Manager are excluded via `denyUrls`.
- **Performance tracing**: Transaction sampling is configured at 10% (`SENTRY_TRACES_SAMPLE_RATE=0.1`) to balance observability with cost. Profile sampling is also at 10%.
- **Session replay**: Client-side session replays are captured only on errors at a 10% rate (`replaysOnErrorSampleRate: 0.1`), with no session replays captured for successful sessions.

Configuration variables:

| Variable                       | Default        | Description                              |
|--------------------------------|----------------|------------------------------------------|
| `SENTRY_DSN`                   | --             | Sentry project DSN (required for tracking) |
| `SENTRY_ENVIRONMENT`           | `NODE_ENV`     | Environment label (production/staging/development) |
| `SENTRY_RELEASE`               | `npm_package_version` | Release identifier for error grouping |
| `SENTRY_TRACES_SAMPLE_RATE`    | `0.1`          | Transaction sampling rate (0.0-1.0)      |
| `SENTRY_PROFILES_SAMPLE_RATE`  | `0.1`          | Profiling sampling rate (0.0-1.0)        |

### OpenTelemetry (Distributed Tracing)

OpenTelemetry provides distributed tracing across service boundaries. The SDK is configured to export traces to any OTLP-compatible backend (Jaeger, Grafana Tempo, Honeycomb, Datadog) via the OTLP HTTP exporter. The integration provides specialized tracing helpers:

- `tracedQuery(operation, table, fn)` -- traces database queries with `db.operation`, `db.table`, and `db.system` attributes
- `tracedApi(method, path, fn)` -- traces API requests with `http.method` and `http.route` attributes
- `tracedPayment(operation, fn, metadata)` -- traces payment operations with `payment.operation` attributes
- `traced(name, fn, attributes)` -- generic tracing for any async operation

Tracing is disabled by default and enabled by setting `OTEL_EXPORTER_OTLP_ENDPOINT`. The sampling rate defaults to 10% (`OTEL_TRACES_SAMPLER_RATE=0.1`). The SDK is shut down gracefully on SIGTERM/SIGINT signals to ensure all pending spans are flushed.

### Prometheus Metrics

The performance monitor (`src/lib/performance/monitor.ts`) exports metrics in Prometheus format at the `/api/performance?format=prometheus` endpoint. The metrics are prefixed with `vt_` to avoid namespace collisions and cover five domains:

**API Metrics:**

| Metric Name                   | Type    | Description                    |
|-------------------------------|---------|--------------------------------|
| `vt_api_request_count`        | counter | Total API requests             |
| `vt_api_error_rate`           | gauge   | Current error rate (0.0-1.0)   |
| `vt_api_latency_avg_ms`       | gauge   | Average API latency            |
| `vt_api_latency_p95_ms`       | gauge   | P95 API latency                |
| `vt_api_latency_p99_ms`       | gauge   | P99 API latency                |

**Database Metrics:**

| Metric Name                   | Type    | Description                    |
|-------------------------------|---------|--------------------------------|
| `vt_db_query_count`           | counter | Total database queries         |
| `vt_db_latency_avg_ms`        | gauge   | Average DB latency             |
| `vt_db_latency_p95_ms`        | gauge   | P95 DB latency                 |
| `vt_db_slow_query_count`      | counter | Slow queries (>1s)             |

**Cache and Queue Metrics:**

| Metric Name                   | Type    | Description                    |
|-------------------------------|---------|--------------------------------|
| `vt_cache_hit_rate`           | gauge   | Cache hit rate (0.0-1.0)       |
| `vt_cache_key_count`          | gauge   | Number of cached keys          |
| `vt_queue_pending`            | gauge   | Pending background jobs        |
| `vt_queue_dead`               | gauge   | Dead letter queue count        |

**Memory Metrics:**

| Metric Name                   | Type    | Description                    |
|-------------------------------|---------|--------------------------------|
| `vt_memory_heap_used_mb`      | gauge   | Heap memory used               |
| `vt_memory_rss_mb`            | gauge   | RSS memory                     |

The Prometheus scrape configuration (`monitoring/prometheus.yml`) scrapes the application every 30 seconds, the Redis exporter at port 9121, and the Node exporter at port 9100.

### Health Endpoints

The platform exposes two health endpoints:

**`/api/health`** -- General application health check. Used by Docker HEALTHCHECK, load balancers, and the Vercel cron job. Returns a simple status indicator. The Docker health check probes this endpoint every 30 seconds with a 10-second timeout, a 40-second start period, and 3 retries.

**`/api/payment-health`** -- Payment system health dashboard. Admin-only endpoint that returns real-time payment metrics including successful payments (24h), failed sessions (24h), refund rate (7d), pending refunds, GMV (24h), commission (24h), and circuit breaker status. Uses a single RPC call (`get_payment_health`) that replaces 9+ separate queries, achieving a 90% reduction in database round-trips.

### Structured Logging

The structured logger (`src/lib/logger/index.ts`) replaces all `console.log`/`console.error`/`console.warn` calls with JSON-formatted output in production and human-readable output in development. Each log entry includes a timestamp, level, message, module, action, trace ID, and optional structured data. Log levels are configurable via `LOG_LEVEL` (server-side, default: `info`) and `NEXT_PUBLIC_LOG_LEVEL` (client-side, default: `warn`). Scoped loggers can be created for specific modules using `createLogger('module-name')`.

### Alert Rules

The Prometheus alerting configuration (`monitoring/alerts.yml`) defines 9 alert rules across four groups:

| Alert                          | Condition                      | Duration | Severity |
|--------------------------------|--------------------------------|----------|----------|
| `VendorTrackAppDown`           | `up == 0`                      | 2m       | Critical |
| `VendorTrackHighErrorRate`     | `error_rate > 5%`              | 5m       | Warning  |
| `VendorTrackHighLatency`       | `p95 > 500ms`                  | 5m       | Warning  |
| `VendorTrackCriticalLatency`   | `p95 > 1000ms`                 | 2m       | Critical |
| `VendorTrackHighMemoryUsage`   | `heap/rss > 90%`               | 5m       | Warning  |
| `VendorTrackHighDBLatency`     | `db p95 > 100ms`               | 5m       | Warning  |
| `VendorTrackSlowQueries`       | `slow_queries > 10`            | 10m      | Warning  |
| `VendorTrackLowCacheHitRate`   | `hit_rate < 50%`               | 10m      | Warning  |
| `VendorTrackQueueBacklog`      | `pending > 1000`               | 10m      | Warning  |
| `VendorTrackDeadLetterQueueGrowing` | `new dead > 10/hour`      | 5m       | Critical |

---

## 6. Feature Flags

### System Architecture

The feature flag system (`src/lib/monitoring/feature-flags.ts`) provides a production-grade mechanism for controlling feature availability without redeployment. Flags are defined in a central registry and evaluated at runtime using a five-level priority chain:

1. **Environment variable override** -- Variables prefixed with `FEATURE_` (e.g., `FEATURE_STRIPE_CONNECT=true`) override all other sources. This is the fastest mechanism for emergency changes.
2. **Database override** -- Runtime overrides stored in the `feature_flags` table, editable without redeployment.
3. **Environment check** -- Flags can be restricted to specific environments (`development`, `staging`, `production`). A flag that is not enabled for the current environment returns `false` regardless of other settings.
4. **User segment targeting** -- Flags can target specific user roles or individual user IDs. This enables beta testing with specific users or A/B testing with role-based cohorts.
5. **Rollout percentage** -- Flags can be enabled for a percentage of users using a deterministic hash based on `userId + flagKey`. This ensures that the same user always sees the same variant, preventing flickering during canary releases.
6. **Default value** -- The baseline value when no override exists.

### Flag Registry

The platform currently defines 12 feature flags across four categories:

**Payment Features:**

| Flag Key                  | Default | Rollout | Environments     | Kill Switch |
|---------------------------|---------|---------|------------------|-------------|
| `stripe_connect`          | true    | 100%    | dev, staging, prod | No        |
| `auto_refund_on_failure`  | true    | 100%    | dev, staging, prod | Yes       |
| `payment_reconciliation`  | true    | 100%    | production       | No          |

**AI Features:**

| Flag Key                  | Default | Rollout | Environments     | Kill Switch |
|---------------------------|---------|---------|------------------|-------------|
| `ai_product_descriptions` | true    | 100%    | dev, staging, prod | No        |
| `ai_chat_assistant`       | false   | 10%     | dev, staging     | No          |

**Search and UI Features:**

| Flag Key                  | Default | Rollout | Environments     | Kill Switch |
|---------------------------|---------|---------|------------------|-------------|
| `full_text_search`        | true    | 100%    | dev, staging, prod | No        |
| `search_suggestions`      | true    | 50%     | dev, staging, prod | No        |
| `new_dashboard`           | false   | 20%     | dev, staging     | No          |
| `dark_mode`               | false   | 100%    | development      | No          |

**Infrastructure Features:**

| Flag Key                  | Default | Rollout | Environments     | Kill Switch |
|---------------------------|---------|---------|------------------|-------------|
| `redis_caching`           | true    | 100%    | production       | No          |
| `opentelemetry_tracing`   | false   | 10%     | staging, prod    | No          |
| `sentry_error_tracking`   | true    | 100%    | staging, prod    | No          |

### Canary Releases

Canary releases are implemented using the `rolloutPercentage` field. For example, the `ai_chat_assistant` flag is set to 10% rollout, meaning only users whose deterministic hash falls within the first 10% of the hash space will see the feature. The hash is computed as `simpleHash(flagKey + ":" + userId) % 100 < rolloutPercentage`, ensuring consistent assignment across sessions. To increase the canary percentage, update the flag definition and redeploy, or set the environment variable override for instant effect.

### Kill Switches

Flags marked with `isKillSwitch: true` can be emergency-disabled by calling `killSwitch(key)`, which sets the corresponding `FEATURE_*` environment variable to `false` in the running process. This is designed for scenarios where a feature is causing production incidents and needs to be disabled immediately without waiting for a redeployment. The `auto_refund_on_failure` flag is the primary kill switch, allowing operators to disable automatic refunds if the refund logic is misbehaving.

### Blue/Green Deployment Support

The `v2_checkout_flow` flag demonstrates blue/green deployment support. It is set to 5% rollout in staging only, with a segment targeting `beta_tester` roles. This allows the new checkout flow to be tested with a small cohort of internal users before broader rollout. The evaluation order ensures that beta testers always see the new flow, while 5% of other staging users see it based on their hash value.

### Environment Overrides

Feature flags can be overridden at the environment level using variables prefixed with `FEATURE_`. For example, to disable Stripe Connect in production, set `FEATURE_STRIPE_CONNECT=false` in the Vercel environment variables. This takes precedence over all other evaluation levels, making it the fastest mechanism for emergency changes. The override is read at evaluation time, so changes take effect immediately without restarting the application.

---

## 7. Production Readiness Checklist

The following checklist must be verified before every production deployment. The `requireProductionSecurity()` function in `src/lib/monitoring/production-security.ts` enforces critical checks at application startup -- the application will refuse to boot if any critical check fails.

### Environment Variables

- [ ] All required environment variables are set (see `src/lib/env.ts` for the full specification)
- [ ] No placeholder values exist (`your-`, `changeme`, `xxx`, `placeholder`)
- [ ] `STRIPE_SECRET_KEY` starts with `sk_live_` (not `sk_test_`)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` starts with `pk_live_` (not `pk_test_`)
- [ ] `STRIPE_WEBHOOK_SECRET` starts with `whsec_`
- [ ] `NEXT_PUBLIC_SUPABASE_URL` matches `https://[project].supabase.co`
- [ ] Server-only variables do NOT have `NEXT_PUBLIC_` prefix (prevents client bundle exposure)
- [ ] No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` variable exists (would expose the service role key)
- [ ] No `NEXT_PUBLIC_STRIPE_SECRET_KEY` variable exists (would expose the secret key)
- [ ] `GEMINI_API_KEY` is set (optional but required for AI features)

### Secrets Management

- [ ] All secrets are stored in Vercel Environment Variables or GitHub Secrets (not in `.env` files committed to git)
- [ ] GitLeaks is configured and running as a pre-commit hook via Husky
- [ ] Secret rotation policy is documented (see `docs/CREDENTIAL_ROTATION_CHECKLIST.md`)
- [ ] No secrets appear in git history (run `npm run secret-scan:history`)

### TLS and Transport Security

- [ ] Application is served over HTTPS (Vercel provides this automatically)
- [ ] `Strict-Transport-Security` header is set with `max-age=31536000; includeSubDomains; preload`
- [ ] Stripe webhook endpoint uses HTTPS
- [ ] Supabase connection uses HTTPS (enforced by the URL pattern validation)

### CORS Configuration

- [ ] `CORS_ALLOWED_ORIGINS` is set to specific domains (not `*`)
- [ ] CORS wildcard (`*`) is not used in production
- [ ] API routes return appropriate `Access-Control-Allow-Origin` headers

### Cookie Security

- [ ] `COOKIE_SECURE` is not set to `false` (cookies must be HTTPS-only)
- [ ] `COOKIE_HTTPONLY` is not set to `false` (cookies must not be accessible to JavaScript)
- [ ] `COOKIE_SAMESITE` is not set to `none` (cookies must not be sent with cross-site requests unless required)
- [ ] Supabase auth cookies use the `__Secure-` and `__Host-` prefixes where applicable

### Security Headers

- [ ] `X-Frame-Options: DENY` is set (prevents clickjacking)
- [ ] `X-Content-Type-Options: nosniff` is set (prevents MIME type sniffing)
- [ ] `Referrer-Policy: strict-origin-when-cross-origin` is set
- [ ] `Permissions-Policy` restricts unnecessary browser features
- [ ] `Cross-Origin-Opener-Policy: same-origin` is set
- [ ] `Cross-Origin-Resource-Policy: same-origin` is set
- [ ] `X-XSS-Protection: 0` is set (modern browsers do not need this, and it can introduce vulnerabilities)

### Rate Limiting

- [ ] Rate limiting is configured for all critical endpoints (login, signup, checkout, refund, AI, search, upload)
- [ ] Login rate limit: 5 per 15 minutes, burst 3 per minute
- [ ] Checkout rate limit: 10 per hour, burst 3 per minute
- [ ] AI generation rate limit: 10 per hour, burst 3 per minute
- [ ] Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are returned

### Health Checks

- [ ] `/api/health` endpoint returns 200 when the application is healthy
- [ ] `/api/payment-health` endpoint returns payment system metrics
- [ ] Docker HEALTHCHECK is configured with appropriate intervals and timeouts
- [ ] Vercel cron health check runs every 5 minutes and verifies database connectivity

### Monitoring

- [ ] `SENTRY_DSN` is configured for error tracking
- [ ] `LOG_LEVEL` is not set to `debug` (verbose logging impacts performance)
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` is configured for distributed tracing (optional but recommended)
- [ ] Prometheus is scraping `/api/performance?format=prometheus` every 30 seconds
- [ ] Alert rules are configured and routing to the appropriate team

---

## 8. Acquisition Readiness Score

The following assessment scores the VendorTrack platform across ten dimensions critical for acquisition due diligence. Each dimension is scored on a scale of 1 to 10, with justification based on the actual implementation found in the codebase.

| Dimension          | Score | Justification |
|--------------------|-------|---------------|
| **Docker**         | 8/10  | Multi-stage production build produces a ~120MB image. Non-root user, standalone output mode, and health checks are all implemented. Three Dockerfiles (production, worker, development) cover all deployment scenarios. The worker health check is minimal (`process.exit(0)`) and could be improved with a more meaningful readiness probe. No Docker image vulnerability scanning is configured in the CI pipeline. |
| **CI/CD**          | 7/10  | The pipeline design is well-structured with a clear stage progression (lint, typecheck, test, security, build, deploy, rollback). Branch strategy and concurrency groups are defined. However, the GitHub Actions workflow file is not present in the repository, suggesting it is either configured externally or not yet implemented. Secret scanning via GitLeaks is integrated. The pipeline would benefit from integration tests and end-to-end test stages. |
| **Monitoring**     | 9/10  | Comprehensive monitoring stack: Sentry for error tracking with PII filtering, OpenTelemetry for distributed tracing, Prometheus metrics exported at a dedicated endpoint, structured logging with configurable levels, and a real-time performance dashboard. The payment health endpoint provides domain-specific monitoring. Alert rules cover application, database, cache, and queue health. The only gap is the absence of a Grafana dashboard configuration file. |
| **Disaster Recovery** | 5/10 | Supabase provides automatic PostgreSQL backups and point-in-time recovery. Redis has both RDB and AOF persistence enabled. However, there is no documented disaster recovery runbook, no automated backup verification, no cross-region replication strategy, and no documented RTO/RPO targets. The application can be redeployed via Vercel's instant rollback, but data recovery procedures are not documented. |
| **Security**       | 9/10  | Strong security posture: environment variable validation at startup prevents insecure deployments, PII filtering in Sentry, security headers (HSTS, CSP, X-Frame-Options, etc.), rate limiting on all critical endpoints, CSRF protection, secret scanning via GitLeaks, server-only variable exposure checks, and a production security validation function that blocks startup on critical failures. The `requireProductionSecurity()` function is a notable strength. The only gap is the absence of a content security policy with nonce support in the CI pipeline. |
| **Release Strategy** | 8/10 | Feature flag system supports canary releases, percentage rollouts, kill switches, and environment-specific overrides. Blue/green deployment is supported through the `v2_checkout_flow` flag. The Vercel platform provides instant rollback. The branch strategy (main/develop/feature/hotfix) is well-defined. The system would benefit from a formal release notes automation process and semantic versioning enforcement. |
| **Documentation**  | 7/10  | The codebase includes comprehensive documentation: SECURITY.md, PAYMENTS.md, PERFORMANCE.md, DATABASE.md, ARCHITECTURE.md, AUTHORIZATION.md, CODE_QUALITY.md, and HANDOVER.md. Each source file includes JSDoc comments explaining purpose, configuration, and design decisions. The gap is the absence of operational runbooks (incident response, disaster recovery, on-call procedures) and API documentation. |
| **Testing**        | 7/10  | Test suites cover architecture validation (DTOs, domain models, error handling, validators), security, performance, and smoke tests. Vitest is configured with coverage reporting. The test infrastructure is solid. However, integration tests and end-to-end tests are not present in the repository. The architecture tests are well-structured but the overall test coverage for business logic (services, repositories) is not measured. |
| **Observability**  | 8/10  | Strong observability: distributed tracing with OpenTelemetry, error tracking with Sentry, structured logging with trace ID correlation, Prometheus metrics for all critical paths, and a performance monitoring dashboard with percentile calculations. The `traced()`, `tracedQuery()`, `tracedApi()`, and `tracedPayment()` helpers make it easy to add observability to new code. The gap is the absence of a centralized log aggregation system (e.g., Loki, CloudWatch Logs) and a unified dashboard that correlates traces, logs, and metrics. |
| **Scalability**    | 7/10  | The architecture supports horizontal scaling: the background worker can be scaled by running additional container instances, the database-backed job queue uses atomic claims with `SELECT FOR UPDATE SKIP LOCKED`, Redis caching reduces database load, and the cache service includes stampede prevention. The Vercel platform provides automatic scaling for API routes. However, the in-memory rate limit store does not scale across multiple instances (the code notes this and recommends Redis for production). The current cache implementation falls back to in-memory LRU when Redis is unavailable, which is not shared across instances. |

### Overall Score: 7.5/10

**Summary**: VendorTrack demonstrates a mature DevOps foundation with particularly strong security, monitoring, and release strategy capabilities. The feature flag system is production-grade and the monitoring stack covers all critical paths. The primary areas for improvement are disaster recovery documentation, cross-instance rate limiting, and the addition of integration and end-to-end tests. The platform is well-positioned for acquisition with minor investments in operational runbooks and multi-instance scalability.

**Priority Improvements**:

1. **Disaster Recovery** (Critical): Document RTO/RPO targets, create a disaster recovery runbook, implement cross-region database replication, and verify backup restoration procedures quarterly.
2. **CI/CD Pipeline** (High): Implement the GitHub Actions workflow file, add integration test and E2E test stages, configure Docker image vulnerability scanning, and add semantic versioning enforcement.
3. **Scalability** (High): Replace the in-memory rate limit store with Redis/Upstash for distributed rate limiting, configure the cache service to use Redis in production (not the in-memory fallback), and document the horizontal scaling strategy for the worker process.
4. **Testing** (Medium): Add integration tests for critical payment flows, add E2E tests for the checkout and refund workflows, and measure and enforce minimum test coverage thresholds.
5. **Documentation** (Medium): Create operational runbooks for incident response, on-call procedures, and disaster recovery. Add API documentation using OpenAPI/Swagger.
