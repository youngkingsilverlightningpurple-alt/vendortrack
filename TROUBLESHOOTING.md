# VendorTrack Troubleshooting Guide

This document provides systematic diagnosis and resolution procedures for production issues in VendorTrack, a Next.js multi-vendor marketplace powered by Supabase, Stripe, Redis, and Gemini AI.

**Audience**: On-call engineers, DevOps, backend developers.

**How to use this guide**: Each issue is structured as Symptoms, Root Cause, Diagnosis Steps, Resolution, and Prevention. Use the tables below to quickly locate your issue by symptom.

---

## Quick Reference: Symptom-to-Section Mapping

| Symptom | Section |
|---|---|
| Build fails with TypeScript/ESLint errors | [1.1 Build Failures](#11-build-failures) |
| Docker build fails at dependency stage | [1.2 Docker Build Failures](#12-docker-build-failures) |
| Vercel deployment times out | [1.3 Vercel Deployment Failures](#13-vercel-deployment-failures) |
| Health check returns 503 after deploy | [1.4 Health Check Failures](#14-health-check-failures-after-deployment) |
| App crashes on startup with env validation error | [1.5 Application Won't Start](#15-application-wont-start) |
| "too many connections" from Supabase | [2.1 Connection Pool Exhaustion](#21-connection-pool-exhaustion) |
| Queries taking seconds instead of milliseconds | [2.2 Slow Queries](#22-slow-queries) |
| "new row violates row-level security policy" | [2.3 RLS Policy Violations](#23-rls-policy-violations) |
| Migration applied partially, schema broken | [2.4 Migration Failures](#24-migration-failures) |
| "deadlock detected" in Postgres logs | [2.5 Deadlocks](#25-deadlocks) |
| Connection timeouts to Supabase | [2.6 Connection Timeouts](#26-connection-timeouts) |
| Database disk full | [2.7 Disk Space Issues](#27-disk-space-issues) |
| Webhook signature verification failed | [3.1 Webhook Signature Verification Failures](#31-webhook-signature-verification-failures) |
| Same webhook processed twice | [3.2 Duplicate Webhook Processing](#32-duplicate-webhook-processing) |
| Payment succeeded but order not fulfilled | [3.3 Payment Intent Succeeded But Order Not Fulfilled](#33-payment-intent-succeeded-but-order-not-fulfilled) |
| Auto-refund triggered incorrectly | [3.4 Auto-Refund Triggered Incorrectly](#34-auto-refund-triggered-incorrectly) |
| Stripe API rate limit errors | [3.5 Stripe API Errors](#35-stripe-api-errors) |
| Circuit breaker open, all payments rejected | [3.6 Circuit Breaker Open](#36-circuit-breaker-open) |
| Reconciliation shows discrepancies | [3.7 Payment Reconciliation Discrepancies](#37-payment-reconciliation-discrepancies) |
| Refund stuck in processing | [3.8 Refund Processing Failures](#38-refund-processing-failures) |
| Dead letter queue growing | [3.9 Dead Letter Queue Growing](#39-dead-letter-queue-growing) |
| Redis connection refused | [4.1 Connection Refused](#41-connection-refused) |
| Cache miss rate above 40% | [4.2 Cache Miss Rate High](#42-cache-miss-rate-high) |
| Redis maxmemory exceeded | [4.3 Memory Limit Exceeded](#43-memory-limit-exceeded) |
| Keys expiring too fast or never | [4.4 Key Expiration Issues](#44-key-expiration-issues) |
| Redis cluster slot errors | [4.5 Redis Cluster Issues](#45-redis-cluster-issues) |
| Login returns 401 unexpectedly | [5.1 Login Failures](#51-login-failures) |
| Session expired immediately after login | [5.2 Session Expired](#52-session-expired-jwt-refresh) |
| CSRF token mismatch on form submit | [5.3 CSRF Token Mismatch](#53-csrf-token-mismatch) |
| 429 Too Many Requests on login | [5.4 Rate Limiting Triggered](#54-rate-limiting-triggered) |
| 403 Permission denied for valid role | [5.5 RBAC Permission Denied](#55-rbac-permission-denied) |
| Seller cannot access dashboard | [5.6 Seller Not Approved](#56-seller-not-approved) |
| API p95 latency above 250ms | [6.1 High API Latency](#61-high-api-latency) |
| Database p95 above 50ms | [6.2 High Database Latency](#62-high-database-latency) |
| Node heap growing unbounded | [6.3 Memory Leaks](#63-memory-leaks) |
| Cache hit rate below 80% | [6.4 Cache Hit Rate Low](#64-cache-hit-rate-low) |
| Queue backlog not shrinking | [6.5 Queue Backlog Growing](#65-queue-backlog-growing) |
| LCP above 2.5s | [6.6 Slow Page Loads](#66-slow-page-loads) |
| Error rate above 1% | [6.7 High Error Rate](#67-high-error-rate) |
| Search returns zero results | [7.1 No Search Results](#71-no-search-results) |
| Search queries taking seconds | [7.2 Slow Search Queries](#72-slow-search-queries) |
| Search suggestions empty | [7.3 Search Suggestions Not Working](#73-search-suggestions-not-working) |
| Gemini API 429 errors | [8.1 Gemini API Errors](#81-gemini-api-errors) |
| Prompt injection detected in logs | [8.2 Prompt Injection Detected](#82-prompt-injection-detected) |
| AI description generation fails | [8.3 AI Product Description Generation Failures](#83-ai-product-description-generation-failures) |
| Sentry not receiving errors | [9.1 Sentry Not Receiving Errors](#91-sentry-not-receiving-errors) |
| Prometheus metrics not scraping | [9.2 Prometheus Metrics Not Scraping](#92-prometheus-metrics-not-scraping) |
| Grafana dashboard stale | [9.3 Grafana Dashboard Not Updating](#93-grafana-dashboard-not-updating) |
| Health check returning 503 | [9.4 Health Check Returning 503](#94-health-check-returning-503) |

---

## 1. Deployment Issues

### 1.1 Build Failures

**Symptoms**

- `next build` exits with non-zero code
- CI/CD pipeline fails at the build step
- TypeScript compilation errors in logs
- ESLint violations blocking the build

**Root Cause**

Build failures are most commonly caused by type errors introduced by recent code changes, ESLint rule violations that are treated as errors, or missing environment variables that are required at build time. VendorTrack uses strict TypeScript checking and the `requireEnvironment()` function from `src/lib/env.ts` which validates all required variables at startup.

**Diagnosis Steps**

1. Check the build log for the specific error:

```bash
# Run the build locally to reproduce
npm run build 2>&1 | tee build-output.log

# Check for TypeScript errors specifically
npx tsc --noEmit 2>&1 | head -100

# Check for ESLint errors
npx eslint src/ --max-warnings=0 2>&1 | head -100
```

2. Verify environment variables are present for the build:

```bash
# List all required env vars
node -e "
  const { validateEnvironment } = require('./src/lib/env');
  const results = validateEnvironment();
  results.filter(r => r.status !== 'ok').forEach(r => console.log(r));
"
```

3. Check for stale build cache:

```bash
rm -rf .next
rm -rf node_modules/.cache
```

**Resolution**

| Error Type | Resolution |
|---|---|
| TypeScript errors | Fix type errors. Run `npx tsc --noEmit` locally before pushing. For urgent deploys, check if `next.config.js` has `ignoreBuildErrors` set (not recommended for production). |
| ESLint errors | Fix lint violations. For urgent deploys, temporarily set `eslint.ignoreDuringBuilds: true` in `next.config.js`, but create a ticket to fix. |
| Missing env vars | Add the missing variable to the deployment environment. Required vars: `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. |
| Invalid env var format | Check `src/lib/env.ts` for expected patterns. For example, `STRIPE_SECRET_KEY` must match `/^sk_(test|live)_/`. |

**Prevention**

- Add `npx tsc --noEmit` as a pre-commit hook
- Run `npm run lint` in CI before the build step
- Use `requireEnvironment()` at startup to fail fast on missing variables
- Maintain a `.env.example` file with all required variables documented

---

### 1.2 Docker Build Failures

**Symptoms**

- `docker build` fails at the `deps` or `builder` stage
- `npm ci` fails with dependency resolution errors
- Multi-stage build fails with "file not found" errors

**Root Cause**

VendorTrack uses a multi-stage Dockerfile (defined in `Dockerfile`) with three stages: `deps` (installs all dependencies), `builder` (runs `npm run build`), and `runner` (production runtime). Failures typically occur when `package-lock.json` is out of sync with `package.json`, when native dependencies fail to compile on Alpine Linux, or when the standalone output is misconfigured.

**Diagnosis Steps**

1. Identify which stage failed:

```bash
docker build --progress=plain --no-cache . 2>&1 | tee docker-build.log

# Check which stage failed
grep -E "^(#[0-9]+ )" docker-build.log | tail -20
```

2. Verify `package-lock.json` is in sync:

```bash
# Regenerate lockfile
npm install --package-lock-only
git diff package-lock.json | head -50
```

3. Test standalone output configuration:

```bash
# Verify next.config.js has standalone output
grep -A2 "output" next.config.js
# Expected: output: 'standalone'
```

4. Check for Alpine-specific native module issues:

```bash
# Build with verbose output
docker build --progress=plain --build-arg NODE_ENV=production . 2>&1 | rg "ERR!" -A5
```

**Resolution**

| Failure Point | Resolution |
|---|---|
| `npm ci` fails | Delete `node_modules` and regenerate `package-lock.json` with `npm install`. Ensure `package-lock.json` is committed. |
| Alpine build fails on native module | Add `RUN apk add --no-cache python3 make g++` to the deps stage before `npm ci`. |
| Standalone output missing | Ensure `next.config.js` has `output: 'standalone'`. The runner stage copies from `.next/standalone`. |
| Build succeeds but runtime fails | Ensure the runner stage copies both `.next/static` and `.next/server` directories. |
| Out of memory during build | Increase Docker build memory: `docker build --memory=4g .` or set `NODE_OPTIONS=--max-old-space-size=4096` as a build arg. |

**Prevention**

- Pin Node.js version in Dockerfile (`FROM node:20-alpine`)
- Always commit `package-lock.json` alongside `package.json`
- Test Docker build in CI before merging
- Use `.dockerignore` to exclude unnecessary files (`.git`, `node_modules`, `.next`)

---

### 1.3 Vercel Deployment Failures

**Symptoms**

- Vercel build times out (exceeds 10 minutes)
- Function size exceeds 50MB limit
- Deployment succeeds but routes return 500

**Root Cause**

Vercel imposes build timeouts and serverless function size limits. VendorTrack's dependencies (Stripe SDK, Supabase client, Sentry, etc.) can cause the function bundle to exceed the 50MB limit. Build timeouts occur when the build step takes too long, often due to heavy TypeScript compilation or large dependency trees.

**Diagnosis Steps**

1. Check Vercel build logs for timeout or size errors:

```bash
# Install Vercel CLI
npm i -g vercel

# Pull deployment logs
vercel logs <deployment-url> --output raw
```

2. Analyze function bundle size:

```bash
# Build locally and check output
npm run build
du -sh .next/server/pages/api/*
du -sh .next/server/chunks/*
```

3. Check for large dependencies:

```bash
npx bundlewatch --config bundlewatch.config.js
# Or manually inspect
npx webpack-bundle-analyzer .next/static/chunks/*.js
```

**Resolution**

| Issue | Resolution |
|---|---|
| Build timeout | Move heavy computations to build-time. Use `generateStaticParams` for static pages. Split large API routes into separate files. |
| Function size limit | Use `output: 'standalone'` in `next.config.js`. Add external packages to `serverExternalPackages`. Remove unused dependencies. |
| Route 500 after deploy | Check that all environment variables are set in Vercel project settings. Verify the `STRIPE_WEBHOOK_SECRET` matches the Vercel deployment URL. |
| Node.js version mismatch | Set `NODE_VERSION` in environment or `.nvmrc` to match the version used in Docker. |

**Prevention**

- Monitor bundle size in CI with `bundlewatch` or `size-limit`
- Use Vercel's build cache (`vercel.json` build settings)
- Keep dependencies minimal; use tree-shakeable imports

---

### 1.4 Health Check Failures After Deployment

**Symptoms**

- Docker health check fails (`HEALTHCHECK` in Dockerfile)
- `/api/cron/health-check` returns 503 or 500
- Load balancer marks the instance as unhealthy

**Root Cause**

The Dockerfile defines a health check at `http://localhost:9002/api/health` with a 30-second interval, 10-second timeout, and 40-second start period. If the health endpoint is slow or returns errors, the container is marked unhealthy. The health check cron (defined in `src/app/api/cron/health-check/route.ts`) queries the `profiles` table to verify database connectivity. If the database is unreachable or the `CRON_SECRET` is misconfigured, the health check fails.

**Diagnosis Steps**

1. Check Docker container health status:

```bash
docker inspect --format='{{.State.Health.Status}}' <container-id>
docker inspect --format='{{json .State.Health}}' <container-id> | jq
```

2. Manually call the health endpoint:

```bash
curl -v http://localhost:9002/api/health
curl -v http://localhost:9002/api/cron/health-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

3. Check application logs for startup errors:

```bash
docker logs <container-id> --tail 200
```

4. Verify database connectivity:

```bash
# Test Supabase connection directly
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Health endpoint returns 500 | Check if `requireEnvironment()` is failing. Look for the "ENVIRONMENT VALIDATION FAILED" banner in logs. |
| Database unreachable | Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are correct. Check Supabase project status. |
| CRON_SECRET mismatch | Ensure the `CRON_SECRET` environment variable matches the one used in the health check request. In production, `CRON_SECRET` must be set. |
| Health check timeout | Increase the `--start-period` in the Dockerfile if the application needs more time to start. The current value is 40 seconds. |
| Port mismatch | Verify the `PORT` environment variable matches the Dockerfile's `EXPOSE` directive (default: 9002). |

**Prevention**

- Use the `--start-period` flag to give the application time to warm up
- Set `CRON_SECRET` in all environments
- Monitor health check success rate in Grafana

---

### 1.5 Application Won't Start

**Symptoms**

- Container exits immediately after starting
- Log shows "VENDORTRACK -- ENVIRONMENT VALIDATION FAILED" banner
- Application crashes with "Missing required environment variable" error

**Root Cause**

The `requireEnvironment()` function in `src/lib/env.ts` validates all required environment variables at startup. If any required variable is missing, invalid, or contains a placeholder value, the application will not start. The function also checks for security violations such as server-only secrets exposed with `NEXT_PUBLIC_` prefixes.

**Diagnosis Steps**

1. Read the container logs for the exact validation failure:

```bash
docker logs <container-id> 2>&1 | grep -A20 "ENVIRONMENT VALIDATION FAILED"
```

2. Run the environment validation manually:

```bash
node -e "
  const { validateEnvironment } = require('./src/lib/env');
  const results = validateEnvironment();
  for (const r of results) {
    if (r.status !== 'ok') console.log('[%s] %s: %s', r.status.toUpperCase(), r.name, r.message);
  }
"
```

3. Check for placeholder values:

```bash
# The env validator rejects common placeholders
grep -E "(your-|placeholder|changeme|xxx+)" .env.local
```

4. Check for security violations (server-only vars with NEXT_PUBLIC_ prefix):

```bash
# These should NOT exist
env | grep "NEXT_PUBLIC_STRIPE_SECRET"
env | grep "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE"
env | grep "NEXT_PUBLIC_STRIPE_WEBHOOK"
```

**Resolution**

| Validation Status | Resolution |
|---|---|
| `MISSING` | Add the required variable to `.env.local` or the deployment environment. Required vars are listed in `src/lib/env.ts` `ENV_SPEC`. |
| `INVALID` | Fix the format. For example, `STRIPE_SECRET_KEY` must match `/^sk_(test|live)_/`, `NEXT_PUBLIC_SUPABASE_URL` must match `/^https:\/\/[a-z]+\.supabase\.co$/`. |
| `UNSAFE` | Remove the `NEXT_PUBLIC_` prefix from server-only secrets. `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `GEMINI_API_KEY` must never be exposed to the client bundle. |
| `WARNING` | Placeholder values detected. Replace with real credentials. |

**Prevention**

- Copy `.env.example` to `.env.local` and fill in all values before starting
- Run `requireEnvironment()` in CI to catch issues before deployment
- Never commit `.env.local` to version control

---

## 2. Database Issues

### 2.1 Connection Pool Exhaustion

**Symptoms**

- Supabase returns "too many connections" or "remaining connection slots are reserved"
- API requests return 503 with database connection errors
- `pg_stat_activity` shows many idle connections

**Root Cause**

Supabase manages a connection pool (PgBouncer) with a configurable limit. When the application opens more connections than the pool allows, new requests are rejected. This commonly happens when: serverless functions each create their own Supabase client, long-running queries hold connections, or the application does not properly release connections after use.

**Diagnosis Steps**

1. Check current connection count on Supabase:

```sql
-- Run in Supabase SQL Editor
SELECT count(*), state
FROM pg_stat_activity
GROUP BY state
ORDER BY count DESC;
```

2. Identify long-running queries:

```sql
SELECT pid, now() - pg_stat_activity.query_start AS duration,
       query, state, usename
FROM pg_stat_activity
WHERE state != 'idle'
ORDER BY duration DESC
LIMIT 20;
```

3. Check connection pool settings in Supabase Dashboard:

```
Supabase Dashboard > Project Settings > Database > Connection Pooling
- Pool Size: default is 15-20
- Max Client Connections: varies by plan
```

4. Monitor from the application:

```bash
# Check the performance monitor snapshot
curl -s http://localhost:9002/api/performance | jq '.database.activeConnections'
```

**Resolution**

| Issue | Resolution |
|---|---|
| Too many idle connections | Ensure `createRouteHandlerClient` is used per-request (not globally). Check for singleton Supabase clients that hold connections. |
| Long-running queries | Add query timeouts. Use `statement_timeout` in Supabase: `ALTER ROLE postgres SET statement_timeout = '30s';` |
| Serverless function connection spam | Use Supabase's connection pooling (PgBouncer in transaction mode). Ensure the `supabase-js` client uses the pooled connection URL. |
| Missing connection cleanup | Ensure `supabase.auth.getUser()` is called with the proper cookie-based client, not creating new admin clients for each request. |

**Prevention**

- Use PgBouncer in transaction mode for serverless deployments
- Monitor `pg_stat_activity` with alerts when connections exceed 80% of pool size
- Set `statement_timeout` to prevent runaway queries
- Use `getSupabaseAdmin()` sparingly (it bypasses RLS and uses a direct connection)

---

### 2.2 Slow Queries

**Symptoms**

- API response times exceed 250ms at p95
- Dashboard loads take several seconds
- `pg_stat_statements` shows queries with high mean execution time
- Performance monitor reports `slowQueryCount` increasing

**Root Cause**

Slow queries in VendorTrack typically result from missing indexes on frequently queried columns, unoptimized JOINs across large tables, or full table scans caused by `ilike` patterns in search queries. The `measureDbLatency` function in `src/lib/performance/monitor.ts` records queries exceeding 1000ms as slow queries.

**Diagnosis Steps**

1. Enable and query `pg_stat_statements`:

```sql
-- Enable if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slowest queries
SELECT query, calls, mean_exec_time, total_exec_time,
       rows, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

2. Check for missing indexes:

```sql
-- Find sequential scans on large tables
SELECT schemaname, relname, seq_scan, idx_scan,
       seq_scan::float / NULLIF(idx_scan, 0) AS ratio
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY ratio DESC;
```

3. Use EXPLAIN ANALYZE on suspected slow queries:

```sql
EXPLAIN ANALYZE
SELECT * FROM products
WHERE status = 'active' AND deleted_at IS NULL
  AND title ILIKE 'laptop%'
ORDER BY created_at DESC
LIMIT 20;
```

4. Check the application's slow query log:

```bash
curl -s http://localhost:9002/api/performance | jq '.slowQueries'
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing index on `products.status` | `CREATE INDEX idx_products_status ON products(status) WHERE deleted_at IS NULL;` |
| Missing index on `orders.created_at` | `CREATE INDEX idx_orders_created_at ON orders(created_at DESC);` |
| `ILIKE` causing full scan | Use PostgreSQL full-text search (GIN index) instead of `ILIKE`. See `docs/supabase-performance-migration.sql` for FTS index setup. |
| Missing composite index | `CREATE INDEX idx_products_seller_status ON products(seller_id, status) WHERE deleted_at IS NULL;` |
| N+1 query pattern | Use Supabase's `select` with foreign key joins instead of separate queries. |

**Prevention**

- Run `docs/supabase-performance-migration.sql` to add recommended indexes
- Monitor `pg_stat_statements` weekly
- Set up alerts for queries exceeding 500ms mean execution time
- Use `measureDbLatency` wrapper for all database operations

---

### 2.3 RLS Policy Violations

**Symptoms**

- "new row violates row-level security policy" error in API responses
- Users cannot read or modify data they should have access to
- Supabase returns empty result sets when data exists

**Root Cause**

VendorTrack uses Row-Level Security (RLS) policies defined in `docs/supabase-rls-migration.sql`. RLS policies control which rows a user can access based on their authenticated role. Errors occur when: the anon key is used instead of the authenticated user's token, RLS policies are missing for a table, or policies are too restrictive.

**Diagnosis Steps**

1. Check which tables have RLS enabled:

```sql
SELECT schemaname, relname, rowsecurity
FROM pg_stat_user_tables
JOIN pg_class ON pg_class.relname = pg_stat_user_tables.relname
WHERE rowsecurity = true;
```

2. List all RLS policies:

```sql
SELECT schemaname, tablename, policyname, permissive,
       roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

3. Test a specific policy as the authenticated user:

```sql
-- Run as the authenticated user (not service role)
SET request.jwt.claims = '{"sub": "user-uuid-here", "role": "seller"}';
SELECT * FROM products WHERE seller_id = 'user-uuid-here' LIMIT 5;
```

4. Check if the API route is using the correct Supabase client:

```bash
# The service role key BYPASSES RLS
# The anon key RESPECTS RLS
# Ensure user-facing routes use the anon key with user auth
rg "getSupabaseAdmin" src/app/api/ --files-with-matches
```

**Resolution**

| Issue | Resolution |
|---|---|
| Using admin client for user-facing queries | Replace `getSupabaseAdmin()` with `createRouteHandlerClient({ cookies })` for user-facing API routes. The admin client bypasses RLS. |
| Missing RLS policy | Add the policy in `docs/supabase-rls-migration.sql`. Example: `CREATE POLICY "Sellers can view own products" ON products FOR SELECT USING (seller_id = auth.uid());` |
| RLS policy too restrictive | Review the policy's `USING` clause. Ensure it accounts for the correct role hierarchy. |
| Anonymous access returning empty | Add a policy for anonymous reads: `CREATE POLICY "Anyone can view active products" ON products FOR SELECT USING (status = 'active' AND deleted_at IS NULL);` |

**Prevention**

- Always enable RLS on new tables: `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;`
- Use the anon key for user-facing routes, admin key only for server-to-server operations
- Test RLS policies in the test suite before deploying

---

### 2.4 Migration Failures

**Symptoms**

- Migration fails partway through, leaving the schema in an inconsistent state
- Application returns "column does not exist" or "relation does not exist" errors
- Supabase migration history shows failed migrations

**Root Cause**

Migration failures occur when a migration contains an error (e.g., referencing a column that does not exist yet), when a migration is not idempotent (running it twice causes errors), or when the migration is interrupted by a connection timeout.

**Diagnosis Steps**

1. Check migration history in Supabase:

```sql
SELECT version, name, statement, partial
FROM supabase_migrations.schema_migrations
ORDER BY version DESC;
```

2. Identify which migration failed:

```bash
# Using Supabase CLI
supabase migration list
```

3. Check the current schema state against expected:

```sql
-- Compare table structure
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

**Resolution**

| Issue | Resolution |
|---|---|
| Partial migration (some statements applied) | Manually revert the applied statements. Then fix the migration and re-run. |
| Migration not idempotent | Wrap statements in `IF NOT EXISTS` / `IF EXISTS` checks. Example: `CREATE TABLE IF NOT EXISTS ...` |
| Column reference error | Fix the migration SQL to reference columns in the correct order (dependencies first). |
| Need to rollback | Use `supabase migration repair <version> --status reverted` and then re-apply. |

**Prevention**

- Always test migrations on a staging database first
- Make migrations idempotent with `IF NOT EXISTS` guards
- Use transactions for related DDL statements where possible
- Keep a rollback script for every migration

---

### 2.5 Deadlocks

**Symptoms**

- "deadlock detected" error in PostgreSQL logs
- Transactions fail with "could not obtain lock on row"
- Periodic 500 errors with deadlock-related messages

**Root Cause**

Deadlocks occur when two transactions hold locks on resources the other needs. In VendorTrack, this commonly happens when: the webhook handler and the order fulfillment logic try to update the same payment session row simultaneously, or when concurrent checkout sessions try to update inventory for the same product.

**Diagnosis Steps**

1. Check for recent deadlocks in PostgreSQL:

```sql
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.query AS blocked_query,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.query AS blocking_query
FROM pg_locks blocked_locks
JOIN pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE blocked_locks.granted = false;
```

2. Enable deadlock logging:

```sql
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET deadlock_timeout = '1s';
SELECT pg_reload_conf();
```

3. Check the application's `fulfillOrder` RPC for lock ordering:

```sql
-- Check the function definition
SELECT prosrc FROM pg_proc WHERE proname = 'fulfill_order';
```

**Resolution**

| Issue | Resolution |
|---|---|
| Concurrent webhook + order update | Ensure consistent lock ordering. Always lock the payment_session row before the order row. |
| Inventory update deadlock | Use `SELECT ... FOR UPDATE SKIP LOCKED` to skip locked rows rather than waiting. |
| Deadlock in queue processing | The `claim_next_queue_job` RPC already uses `SKIP LOCKED`. Verify it is working. |

**Prevention**

- Always acquire locks in a consistent order across all transactions
- Use `SELECT ... FOR UPDATE SKIP LOCKED` for concurrent queue processing
- Keep transactions short and avoid long-running operations inside transactions
- Set `lock_timeout` to prevent indefinite waits: `SET lock_timeout = '5s';`

---

### 2.6 Connection Timeouts

**Symptoms**

- "connection timeout" errors from Supabase client
- API requests take longer than expected and return 504
- Intermittent database connectivity loss

**Root Cause**

Connection timeouts occur when the network path to Supabase is slow or congested, when the Supabase instance is under heavy load, or when the client's connection timeout is set too low. Serverless environments (Vercel) are particularly susceptible because cold starts create new connections.

**Diagnosis Steps**

1. Test raw connection latency to Supabase:

```bash
# Measure TCP connection time
time curl -s -o /dev/null -w "TCP: %{time_connect}s\n" \
  "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/"

# Test a simple query
time curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

2. Check Supabase status:

```bash
curl -s https://status.supabase.com/api/v2/status.json | jq
```

3. Review application-level timeout settings:

```typescript
// Check supabase client configuration
const supabase = createClient(url, key, {
  db: { schema: 'public' },
  global: { headers: {} },
  realtime: { params: { eventsPerSecond: 10 } },
});
```

**Resolution**

| Issue | Resolution |
|---|---|
| Cold start timeouts | Increase the Supabase client timeout. Use connection pooling (PgBouncer) to reduce connection setup time. |
| Network latency | Deploy the application in the same region as the Supabase instance. Check for DNS resolution delays. |
| Supabase overloaded | Check Supabase Dashboard for CPU/memory usage. Consider upgrading the plan. |
| DNS resolution timeout | Use the Supabase IP address directly, or configure a DNS cache. |

**Prevention**

- Deploy in the same region as the Supabase instance
- Use PgBouncer for connection pooling
- Implement retry logic with exponential backoff for transient timeouts
- Monitor connection latency with the health check cron

---

### 2.7 Disk Space Issues

**Symptoms**

- "could not extend file" or "no space left on device" errors
- Supabase Dashboard shows storage usage near 100%
- Writes fail intermittently

**Root Cause**

Disk space issues arise from unbounded table growth (audit logs, payment job queue, reconciliation reports), large numbers of product images, or insufficient vacuuming causing table bloat.

**Diagnosis Steps**

1. Check database size:

```sql
SELECT pg_database.datname,
       pg_size_pretty(pg_database_size(pg_database.datname)) AS size
FROM pg_database
WHERE datname = current_database();
```

2. Find largest tables:

```sql
SELECT relname AS table_name,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
       pg_size_pretty(pg_relation_size(relid)) AS table_size,
       pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 20;
```

3. Check for dead tuples (bloat):

```sql
SELECT relname, n_dead_tup, n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) AS bloat_pct
FROM pg_stat_user_tables
WHERE n_dead_tup > 10000
ORDER BY n_dead_tup DESC;
```

**Resolution**

| Issue | Resolution |
|---|---|
| Audit logs growing | Run `DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days';` and set up a cron job. |
| Payment job queue growing | Run the `cleanupOldJobs()` function from `src/lib/payment/queue.ts`. This deletes completed/failed jobs older than 30 days. |
| Reconciliation reports | Archive old reports to cold storage. |
| Table bloat | Run `VACUUM (VERBOSE, ANALYZE) <table_name>;` for heavily bloated tables. For extreme bloat, use `VACUUM FULL` (requires exclusive lock). |
| Product images | Implement image cleanup for deleted products. Use Supabase Storage lifecycle policies. |

**Prevention**

- Set up automated VACUUM in PostgreSQL (autovacuum is on by default)
- Implement data retention policies for audit logs and job queue
- Monitor disk usage with alerts at 80% threshold
- Use `cleanupOldJobs()` regularly via cron

---

## 3. Payment Issues

### 3.1 Webhook Signature Verification Failures

**Symptoms**

- Stripe webhook returns 400 "Invalid signature"
- `PaymentLogger.critical` logs `WEBHOOK_SIGNATURE_INVALID`
- Payments are processed in Stripe but not reflected in VendorTrack

**Root Cause**

The webhook handler in `src/app/api/webhooks/stripe/route.ts` calls `stripe.webhooks.constructEvent(body, signature, requireEnv('STRIPE_WEBHOOK_SECRET'))`. Signature verification fails when: the `STRIPE_WEBHOOK_SECRET` does not match the endpoint's signing secret in the Stripe Dashboard, the raw request body has been modified by middleware (e.g., body parsing), or the `stripe-signature` header is missing.

**Diagnosis Steps**

1. Verify the webhook secret matches:

```bash
# Check the current env var
echo $STRIPE_WEBHOOK_SECRET
# Should start with "whsec_"

# Compare with Stripe Dashboard
# Stripe Dashboard > Developers > Webhooks > [endpoint] > Signing secret
```

2. Check if middleware is modifying the request body:

```bash
# The webhook route reads the raw body with req.text()
# Ensure no body parser middleware is running before this
rg "bodyParser\|body-parser\|urlencoded" src/middleware/
```

3. Test the webhook endpoint with Stripe CLI:

```bash
# Install Stripe CLI, then:
stripe listen --forward-to localhost:9002/api/webhooks/stripe
stripe trigger payment_intent.succeeded
```

4. Check Stripe Dashboard for failed webhook deliveries:

```
Stripe Dashboard > Developers > Webhooks > [endpoint] > Attempts
```

**Resolution**

| Issue | Resolution |
|---|---|
| Wrong webhook secret | Update `STRIPE_WEBHOOK_SECRET` in the deployment environment. Must match the signing secret shown in Stripe Dashboard. |
| Body modified by middleware | Ensure the webhook route reads the raw body with `req.text()`, not `req.json()`. The Next.js middleware must not parse the body before the webhook handler. |
| Missing stripe-signature header | Verify the Stripe webhook URL is correct and accessible. Check that the endpoint is not behind auth middleware that rejects the request before the signature header is read. |
| Test vs live mode mismatch | Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are from the same mode (test or live). Mixing test keys with live webhook secrets causes verification failures. |

**Prevention**

- Use Stripe CLI to test webhooks locally before deploying
- Store the webhook secret in a secrets manager, not in code
- Set up monitoring for `WEBHOOK_SIGNATURE_INVALID` log events
- Ensure the webhook URL in Stripe Dashboard is always up to date

---

### 3.2 Duplicate Webhook Processing

**Symptoms**

- Same order appears twice in the system
- Duplicate notifications sent to buyers/sellers
- Reconciliation reports show duplicate payment entries

**Root Cause**

Stripe retries webhooks if it does not receive a 2xx response within 20 seconds. If the webhook handler takes too long to respond, Stripe will retry, potentially causing duplicate processing. The idempotency check in the webhook handler uses `auditLogRepository.insertProcessedEvent(event.id)` which is supposed to be atomic, but race conditions can occur if multiple instances process the same event simultaneously.

**Diagnosis Steps**

1. Check the `processed_events` table for duplicate entries:

```sql
SELECT event_id, count(*)
FROM processed_events
GROUP BY event_id
HAVING count(*) > 1;
```

2. Check for duplicate orders:

```sql
SELECT payment_intent_id, count(*)
FROM orders
WHERE payment_intent_id IS NOT NULL
GROUP BY payment_intent_id
HAVING count(*) > 1;
```

3. Review Stripe webhook delivery attempts:

```
Stripe Dashboard > Developers > Webhooks > [endpoint] > Attempts
Look for events with multiple successful deliveries
```

4. Check the webhook handler response time:

```bash
# Look for slow webhook processing in logs
rg "webhook_received" --no-heading -A5 logs/ | grep -E "duration|latency"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Race condition in idempotency check | Ensure `insertProcessedEvent` uses an `INSERT ... ON CONFLICT DO NOTHING` pattern with a unique constraint on `event_id`. The `{ inserted }` return value must be checked before processing. |
| Slow webhook processing | Move expensive operations (notifications, analytics) to background jobs via `enqueueJob()`. The webhook handler should respond quickly after the idempotency check. |
| Duplicate orders found | Use `auditLogRepository.insertProcessedEvent` to prevent reprocessing. For existing duplicates, manually merge the duplicate orders and update the ledger. |

**Prevention**

- Ensure `processed_events` table has a unique constraint on `event_id`
- Keep webhook processing fast (under 10 seconds) by delegating to background jobs
- Monitor the `processed_events` table for anomalies
- Return 200 immediately after idempotency check, before business logic

---

### 3.3 Payment Intent Succeeded But Order Not Fulfilled

**Symptoms**

- Buyer's payment went through but no order appears
- Stripe shows a successful PaymentIntent, but VendorTrack has no corresponding order
- Reconciliation reports show "missing_order" discrepancies

**Root Cause**

The webhook handler in `src/app/api/webhooks/stripe/route.ts` processes `payment_intent.succeeded` events through `handlePaymentIntentSucceeded`. If the fulfillment step (`orderRepository.fulfillOrder`) fails, the handler initiates a safety refund. However, if the webhook itself was never received (e.g., endpoint was down), the payment succeeds in Stripe but no order is created in VendorTrack.

**Diagnosis Steps**

1. Check if the webhook was received:

```bash
# Search logs for the specific PaymentIntent ID
rg "payment_intent_id" logs/ | grep "pi_xxx"
```

2. Check the payment session status:

```sql
SELECT id, status, amount_total_cents, expires_at, created_at
FROM payment_sessions
WHERE id = 'cs_xxx';
```

3. Check the audit log for the event:

```sql
SELECT event_type, severity, payload, created_at
FROM audit_logs
WHERE payload->>'pi' = 'pi_xxx'
   OR payload->>'paymentIntentId' = 'pi_xxx'
ORDER BY created_at DESC;
```

4. Check if the payment was auto-refunded:

```sql
SELECT event_type, amount_cents, metadata
FROM payment_ledger
WHERE payment_intent_id = 'pi_xxx'
ORDER BY created_at;
```

**Resolution**

| Issue | Resolution |
|---|---|
| Webhook never received | Manually trigger the webhook from Stripe Dashboard: Developers > Webhooks > [endpoint] > "Send test webhook". Or use the Stripe CLI to resend: `stripe events resend evt_xxx`. |
| Fulfillment failed (auto-refund triggered) | Check the audit log for the `SYSTEM_FAILURE_REFUND` event. The `failure_reason` field in the refund metadata explains why fulfillment failed. Fix the underlying issue and create the order manually. |
| Session expired | If the payment session expired before the webhook arrived, the handler auto-refunds. Verify the `expires_at` value in `payment_sessions`. If the session was valid, the auto-refund was incorrect. |
| No order created | Use `orderRepository.fulfillOrder` manually with the correct session ID and payment intent ID. |

**Prevention**

- Monitor Stripe webhook delivery success rate
- Set up alerts for `webhook_fulfillment_failure` log events
- Run reconciliation daily to catch missing orders
- Ensure the webhook endpoint is highly available

---

### 3.4 Auto-Refund Triggered Incorrectly

**Symptoms**

- Customer reports being refunded after a successful payment
- Audit logs show `SYSTEM_FAILURE_REFUND` or `AUTO_REFUND_ON_SYSTEM_FAILURE`
- Seller reports not receiving payment for a completed order

**Root Cause**

The webhook handler in `src/app/api/webhooks/stripe/route.ts` implements a safety-first approach: any failure during `handlePaymentIntentSucceeded` triggers an automatic Stripe refund. This is by design to prevent the customer from being charged without receiving their order. However, transient failures (database timeouts, temporary connection issues) can trigger incorrect auto-refunds.

**Diagnosis Steps**

1. Check the audit log for the auto-refund:

```sql
SELECT event_type, severity, payload, created_at
FROM audit_logs
WHERE event_type IN ('SYSTEM_FAILURE_REFUND', 'AUTO_REFUND_FAILED_MANUAL_INTERVENTION_REQUIRED')
  AND payload->>'pi' = 'pi_xxx'
ORDER BY created_at DESC;
```

2. Check the refund metadata for the failure reason:

```sql
SELECT metadata->>'failure_reason' AS reason,
       metadata->>'recovery_action' AS action,
       metadata->>'error_code' AS error_code
FROM payment_ledger
WHERE payment_intent_id = 'pi_xxx'
  AND event_type = 'refund_completed'
  AND metadata->>'type' = 'auto_refund_on_failure';
```

3. Check if the underlying issue was transient:

```bash
# Look for database timeout errors around the same time
rg "timeout\|ETIMEDOUT\|connection" logs/ --before-context=5 --after-context=5
```

**Resolution**

| Issue | Resolution |
|---|---|
| Transient database timeout | The auto-refund was a false positive. Re-create the order manually using `orderRepository.fulfillOrder`. Charge the customer again via Stripe (or create a new payment intent). |
| Session data mismatch | The `PAYMENT_PRICE_MISMATCH` or `PAYMENT_CART_MISMATCH` error indicates the cart was modified between checkout and payment. Investigate the cart modification and fix the root cause. |
| Session expired | The `PAYMENT_SESSION_EXPIRED` error means the checkout session timed out. Increase the session expiry time or investigate why the webhook was delayed. |
| Auto-refund itself failed | The audit log shows `AUTO_REFUND_FAILED_MANUAL_INTERVENTION_REQUIRED`. You must manually issue a refund in Stripe Dashboard and update the payment session status. |

**Prevention**

- Add retry logic for transient failures before triggering the auto-refund
- Increase database connection timeouts for webhook processing
- Set up alerts for `SYSTEM_FAILURE_REFUND` events
- Review the auto-refund threshold and add a grace period for transient errors

---

### 3.5 Stripe API Errors

**Symptoms**

- `STRIPE_RATE_LIMIT` errors in payment logs
- `STRIPE_CONNECTION_ERROR` errors
- `STRIPE_API_ERROR` errors with 5xx status codes

**Root Cause**

Stripe enforces rate limits (100 reads/sec and 100 writes/sec in live mode). Exceeding these limits results in 429 responses. Connection errors occur when the Stripe API is unreachable from the application's network. The retry system in `src/lib/payment/retry.ts` handles these with exponential backoff.

**Diagnosis Steps**

1. Check Stripe API rate limit headers:

```bash
# Stripe returns rate limit headers
# Look for these in your HTTP client logs
# X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
```

2. Check the circuit breaker status:

```bash
# The circuit breaker tracks repeated Stripe failures
node -e "
  const { getCircuitBreakerStatus } = require('./src/lib/payment/retry');
  console.log(JSON.stringify(getCircuitBreakerStatus(), null, 2));
"
```

3. Check Stripe service status:

```bash
curl -s https://status.stripe.com/api/v2/status.json | jq
```

4. Review application logs for rate limit errors:

```bash
rg "STRIPE_RATE_LIMIT\|rate_limit\|429" logs/ --no-heading
```

**Resolution**

| Issue | Resolution |
|---|---|
| Rate limit exceeded | Reduce the frequency of Stripe API calls. Batch operations where possible. Use webhooks instead of polling. The retry system already handles 429s with exponential backoff. |
| Connection error | Check network connectivity. Ensure the application can reach `api.stripe.com`. Check for firewall rules or proxy issues. |
| Stripe API error (5xx) | Stripe is experiencing issues. The retry system will handle this automatically. Monitor Stripe status page. |
| Authentication error | Verify `STRIPE_SECRET_KEY` is valid and not expired. Ensure it matches the correct mode (test/live). |

**Prevention**

- Use webhooks instead of polling for payment status updates
- Batch Stripe API calls where possible
- Implement the circuit breaker pattern (already in place via `src/lib/payment/retry.ts`)
- Monitor Stripe API error rates in Grafana

---

### 3.6 Circuit Breaker Open

**Symptoms**

- All payment operations fail immediately with "Circuit breaker open" error
- `PaymentLogger.warn` logs `circuit_open` for webhook, refund, or transfer operations
- No new payments can be processed

**Root Cause**

The circuit breaker in `src/lib/payment/retry.ts` opens after 5 consecutive failures (threshold defined by `CIRCUIT_BREAKER_THRESHOLD`). Once open, it rejects all operations for 60 seconds (`CIRCUIT_BREAKER_RESET_MS`). This is a safety mechanism to prevent cascading failures. The circuit breaker opens when the underlying system (Stripe, database, etc.) is consistently failing.

**Diagnosis Steps**

1. Check the circuit breaker status:

```bash
node -e "
  const { getCircuitBreakerStatus } = require('./src/lib/payment/retry');
  const status = getCircuitBreakerStatus();
  for (const [key, breaker] of Object.entries(status)) {
    if (breaker.state === 'open') {
      console.log('OPEN: %s (failures: %d, last: %s)', key, breaker.failures, new Date(breaker.lastFailureTime).toISOString());
    }
  }
"
```

2. Identify what caused the failures:

```bash
rg "circuit_open\|retries_exhausted\|non_retryable" logs/ --no-heading | tail -20
```

3. Check the underlying system health:

```bash
# Check Stripe connectivity
curl -s -o /dev/null -w "%{http_code}" https://api.stripe.com/v1/balance \
  -H "Authorization: Bearer $STRIPE_SECRET_KEY"

# Check database connectivity
curl -s http://localhost:9002/api/cron/health-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Stripe is down | Wait for Stripe to recover. The circuit breaker will automatically transition to half-open after 60 seconds, allowing one test request. |
| Database is down | Fix the database issue first. The circuit breaker will not reset until the underlying operations succeed. |
| Cascading failure from one bad deployment | Roll back the deployment. The circuit breaker state is in-memory and will reset on restart. |
| Need immediate payment processing | Restart the application to reset the circuit breaker state. This is a temporary fix; the underlying issue must be resolved. |

**Prevention**

- Monitor circuit breaker status in the admin dashboard
- Set up alerts when circuit breakers open
- Investigate root causes immediately when circuit breakers open
- Consider increasing `CIRCUIT_BREAKER_THRESHOLD` if transient failures are common

---

### 3.7 Payment Reconciliation Discrepancies

**Symptoms**

- Reconciliation report shows discrepancies (missing orders, amount mismatches, etc.)
- `quickReconciliationCheck()` returns `healthy: false`
- Stripe balance does not match VendorTrack's ledger

**Root Cause**

The reconciliation service in `src/lib/payment/reconciliation-service.ts` compares Stripe data against the VendorTrack database. Discrepancies arise from: webhook processing failures (missing orders), race conditions during concurrent processing (duplicate payments), incorrect commission calculations (commission mismatches), and timing differences between Stripe and the database.

**Diagnosis Steps**

1. Run a reconciliation report:

```bash
# Trigger via the admin API
curl -s -X POST http://localhost:9002/api/cron/reconciliation \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

2. Check the `reconciliation_reports` table:

```sql
SELECT id, status, healthy, summary, started_at
FROM reconciliation_reports
ORDER BY started_at DESC
LIMIT 5;
```

3. Review specific discrepancies:

```sql
SELECT jsonb_pretty(discrepancies) AS discrepancies
FROM reconciliation_reports
WHERE healthy = false
ORDER BY started_at DESC
LIMIT 1;
```

**Resolution**

| Discrepancy Type | Resolution |
|---|---|
| `missing_order` | Create the missing order manually using `orderRepository.fulfillOrder`. Verify the payment session exists. |
| `duplicate_payment` | Identify the duplicate order and refund one. Update the ledger to reflect the correct state. |
| `amount_mismatch` | Investigate the root cause. This is a security concern (potential price manipulation). Check the cart modification history. |
| `commission_mismatch` | Recalculate the commission. The expected rate is 10% (`COMMISSION_RATE = 0.10`). If the order was created with a different rate, update the order. |
| `orphan_refund` | The refund exists in the database but not in Stripe. Issue the refund in Stripe or remove the refund record from the database. |
| `failed_transfer` | The seller did not receive their payout. Manually create the transfer in Stripe. |

**Prevention**

- Run reconciliation daily (via the cron job)
- Set up alerts for `healthy: false` reconciliation reports
- Monitor the `quickReconciliationCheck()` result in Grafana
- Ensure webhook processing is reliable to prevent missing orders

---

### 3.8 Refund Processing Failures

**Symptoms**

- Refund request submitted but not processed
- `STRIPE_REFUND_FAILED` error in payment logs
- Order shows `refund_status: 'pending'` indefinitely

**Root Cause**

Refund processing involves calling the Stripe API to create a refund. Failures occur when: the `STRIPE_SECRET_KEY` is invalid, the PaymentIntent has already been fully refunded, the Stripe API is unavailable, or the application's circuit breaker is open for refund operations.

**Diagnosis Steps**

1. Check the refund service logs:

```bash
rg "refund_create\|STRIPE_REFUND_FAILED\|refund_completed" logs/ --no-heading | tail -20
```

2. Check the Stripe Dashboard for the refund:

```
Stripe Dashboard > Payments > [payment] > Refunds
```

3. Check the order's refund status:

```sql
SELECT id, status, refund_status, payment_intent_id, amount_total_cents
FROM orders
WHERE id = 'order-uuid';
```

4. Check the payment ledger:

```sql
SELECT event_type, amount_cents, stripe_refund_id, metadata
FROM payment_ledger
WHERE payment_intent_id = 'pi_xxx'
  AND event_type = 'refund_completed'
ORDER BY created_at;
```

**Resolution**

| Issue | Resolution |
|---|---|
| Stripe API failure | The retry system will attempt up to 3 times with exponential backoff. If all retries fail, the refund enters the dead letter queue. Process it manually. |
| Already fully refunded | Check Stripe Dashboard. If the refund was already issued, update the order's `refund_status` to 'approved' in the database. |
| Circuit breaker open | See [3.6 Circuit Breaker Open](#36-circuit-breaker-open). |
| Invalid PaymentIntent | The payment intent may have been disputed or expired. Check Stripe Dashboard for the payment status. |

**Prevention**

- Implement retry logic for refund operations (already in place via `RETRY_CONFIGS.refund`)
- Monitor the refund dead letter queue
- Set up alerts for `STRIPE_REFUND_FAILED` errors
- Verify refund eligibility before processing

---

### 3.9 Dead Letter Queue Growing

**Symptoms**

- `payment_job_queue` table has many rows with `status: 'dead'`
- Background jobs (notifications, analytics) are not being processed
- `getQueueStatus()` shows increasing `dead` count

**Root Cause**

Jobs enter the dead letter queue when they exceed their `max_attempts` (default: 3). This happens when the job handler consistently fails. Common causes include: database connectivity issues, missing job handlers, invalid job payloads, or external service failures (email provider down, analytics service unavailable).

**Diagnosis Steps**

1. Check the dead letter queue:

```sql
SELECT job_type, count(*), max(error_message) AS last_error
FROM payment_job_queue
WHERE status = 'dead'
GROUP BY job_type
ORDER BY count DESC;
```

2. Review specific dead job errors:

```sql
SELECT id, job_type, error_message, attempts, created_at, trace_id
FROM payment_job_queue
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;
```

3. Check if job handlers are registered:

```bash
# Search for registerJobHandler calls
rg "registerJobHandler" src/ --no-heading
```

4. Check the queue processor status:

```bash
# Check if the queue processor is running
rg "queue_processor_started\|queue_processor_stopped" logs/ --no-heading | tail -5
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing job handler | Register the handler using `registerJobHandler(jobType, handler)`. Without a handler, the job is immediately marked as dead. |
| External service failure | Fix the external service. Then re-process dead jobs by updating their status: `UPDATE payment_job_queue SET status = 'pending', attempts = 0 WHERE id = 'job-uuid';` |
| Invalid payload | Fix the data issue. Then either update the payload or delete the job. |
| Database error during processing | Fix the database issue. Re-process dead jobs by resetting their status. |

**Prevention**

- Register all job handlers at application startup
- Monitor the dead letter queue size with alerts
- Run `cleanupOldJobs()` to prevent unbounded growth
- Implement dead job re-processing with manual approval

---

## 4. Redis Issues

### 4.1 Connection Refused

**Symptoms**

- "ECONNREFUSED" errors when connecting to Redis
- Cache operations return errors or fall back to in-memory cache
- Application logs show "Redis connection refused" or "Connection timeout"

**Root Cause**

VendorTrack's cache service (`src/lib/cache/redis-client.ts`) operates in three modes: Redis (production), Upstash REST (serverless), and in-memory LRU (development/fallback). When the Redis server is not running or the connection URL is incorrect, the service falls back to the in-memory LRU cache, which is not shared across instances.

**Diagnosis Steps**

1. Check if Redis is running:

```bash
# Direct connection test
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
# Expected: PONG

# Check if the process is running
docker ps | grep redis
systemctl status redis
```

2. Check Redis connection configuration:

```bash
echo $REDIS_URL
echo $UPSTASH_REDIS_REST_URL
```

3. Test from the application:

```bash
node -e "
  const { cacheService } = require('./src/lib/cache/redis-client');
  cacheService.set('test', 'hello', { ttlSeconds: 60 }).then(() => {
    return cacheService.get('test');
  }).then(v => console.log('Cache value:', v))
    .catch(e => console.error('Cache error:', e.message));
"
```

4. Check if the application is falling back to in-memory cache:

```bash
rg "in-memory\|LRU\|fallback" logs/ --no-heading | tail -10
```

**Resolution**

| Issue | Resolution |
|---|---|
| Redis not running | Start Redis: `docker compose up -d redis` or `systemctl start redis`. |
| Wrong connection URL | Update `REDIS_URL` or `UPSTASH_REDIS_REST_URL` in the environment. |
| Firewall blocking | Open the Redis port (default: 6379) in the firewall. Check security groups. |
| Redis authentication | Set `REDIS_PASSWORD` if the Redis instance requires authentication. |
| In-memory fallback active | This is expected behavior when Redis is unavailable. The LRU cache works but is not shared across instances. Fix the Redis connection for production. |

**Prevention**

- Use Docker Compose health checks for Redis: `test: ["CMD", "redis-cli", "ping"]`
- Monitor Redis availability with the health check endpoint
- Set up alerts for Redis connection failures
- Use Upstash Redis for serverless deployments (HTTP-based, no connection issues)

---

### 4.2 Cache Miss Rate High

**Symptoms**

- Cache hit rate below 80% (threshold defined in monitoring)
- Database query count is higher than expected
- Page load times are slow despite cache layer

**Root Cause**

High cache miss rates occur when: the cache is not being warmed on application startup, cache TTLs are too short (entries expire before they can be reused), cache invalidation is too aggressive (invalidating entire tag groups), or the cache is not being populated because the data is not being accessed through the `getOrSet` pattern.

**Diagnosis Steps**

1. Check cache statistics:

```bash
node -e "
  const { cacheService } = require('./src/lib/cache/redis-client');
  const stats = cacheService.getStats();
  console.log('Hit rate:', (stats.hitRate * 100).toFixed(1) + '%');
  console.log('Hits:', stats.hits);
  console.log('Misses:', stats.misses);
  console.log('Key count:', stats.keyCount);
  console.log('Memory:', (stats.memoryUsageBytes / 1024 / 1024).toFixed(2) + ' MB');
"
```

2. Check cache warming cron:

```bash
# The cache warming cron runs at /api/cron/cache-warming
curl -s http://localhost:9002/api/cron/cache-warming \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

3. Review cache TTL settings:

```bash
# Check CACHE_DURATIONS in src/lib/cache/redis-client.ts
rg "CACHE_DURATIONS" src/lib/cache/redis-client.ts -A1
```

4. Check for aggressive invalidation:

```bash
rg "invalidateTag\|invalidatePattern\|clear" src/ --no-heading | rg -v "test\|spec\|\.d\.ts"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Cache not warmed | Ensure the cache warming cron is running. It pre-populates popular product listings, categories, and seller profiles. |
| TTL too short | Increase `CACHE_DURATIONS` values. Products (300s) and categories (600s) rarely change and can be cached longer. |
| Aggressive invalidation | Use targeted invalidation (`invalidateTag` with specific tags) instead of broad invalidation (`clear`). |
| Not using getOrSet | Replace `get` + `set` patterns with `getOrSet` which prevents cache stampede and auto-populates the cache. |

**Prevention**

- Run cache warming on deployment and at regular intervals
- Monitor cache hit rate in Grafana with alerts below 80%
- Use `getOrSet` for all read-through cache patterns
- Review cache invalidation patterns to ensure they are not too broad

---

### 4.3 Memory Limit Exceeded

**Symptoms**

- Redis returns "OOM command not allowed when used memory > 'maxmemory'"
- Redis evicting keys unexpectedly
- Cache entries disappearing before their TTL expires

**Root Cause**

Redis has a `maxmemory` configuration that limits how much memory it can use. When the limit is reached, Redis evicts keys based on the `maxmemory-policy`. If the policy is `noeviction`, Redis returns errors instead of evicting keys. The default policy in many Redis configurations is `allkeys-lru`, which evicts the least recently used keys.

**Diagnosis Steps**

1. Check Redis memory usage:

```bash
redis-cli info memory | grep -E "used_memory_human|maxmemory_human|maxmemory_policy"
```

2. Check the number of keys and their sizes:

```bash
redis-cli dbsize
redis-cli --scan --pattern "vt:*" | wc -l
```

3. Analyze key memory usage:

```bash
redis-cli --bigkeys
```

4. Check the eviction policy:

```bash
redis-cli config get maxmemory-policy
```

**Resolution**

| Issue | Resolution |
|---|---|
| Maxmemory too low | Increase `maxmemory` in Redis configuration: `redis-cli config set maxmemory 512mb`. |
| No eviction policy | Set an eviction policy: `redis-cli config set maxmemory-policy allkeys-lru`. This evicts the least recently used keys when memory is full. |
| Too many cached keys | Reduce the number of cached items. Use shorter TTLs. Remove unused cache keys. |
| Large values in cache | Check if large objects (product images, full order histories) are being cached. Only cache lightweight data. |

**Prevention**

- Set appropriate `maxmemory` based on available system memory
- Use `allkeys-lru` eviction policy for cache use cases
- Monitor Redis memory usage with alerts at 80% of maxmemory
- Use VendorTrack's `vt:` key prefix to identify all application keys

---

### 4.4 Key Expiration Issues

**Symptoms**

- Cached data disappears before the expected TTL
- Data persists in the cache after the TTL should have expired
- Inconsistent cache behavior across different keys

**Root Cause**

Key expiration issues can arise from: incorrect TTL values being passed to `set()`, the `maxmemory-policy` evicting keys before their TTL, clock skew between the application and Redis server, or the in-memory LRU cache's TTL implementation not matching Redis behavior.

**Diagnosis Steps**

1. Check the TTL of specific keys:

```bash
# Check remaining TTL
redis-cli ttl "vt:products:listing:all:p1:s20"
# Returns seconds remaining, -1 if no expiry, -2 if key doesn't exist
```

2. Verify the TTL being set by the application:

```bash
# Check the CACHE_DURATIONS values
node -e "
  const { CACHE_DURATIONS } = require('./src/lib/cache/redis-client');
  console.log(JSON.stringify(CACHE_DURATIONS, null, 2));
"
```

3. Check for clock skew:

```bash
# Check Redis server time
redis-cli time
# Compare with system time
date +%s
```

**Resolution**

| Issue | Resolution |
|---|---|
| TTL too short | Increase the TTL in `CACHE_DURATIONS`. For example, `PRODUCTS: 300` (5 minutes) can be increased to `600` (10 minutes) if products rarely change. |
| TTL too long | Reduce the TTL for frequently changing data. Payment health should remain at 30 seconds. |
| Eviction before TTL | Increase `maxmemory` or switch to `volatile-lru` eviction policy (only evicts keys with TTL). |
| Clock skew | Synchronize system clocks using NTP. This is critical for Redis cluster deployments. |

**Prevention**

- Use the `CACHE_DURATIONS` constants for all TTL values
- Monitor TTL distribution of cached keys
- Ensure NTP is configured on all servers

---

### 4.5 Redis Cluster Issues

**Symptoms**

- "MOVED" or "ASK" redirection errors
- "CLUSTERDOWN" errors
- Some keys work but others return errors

**Root Cause**

Redis Cluster distributes keys across multiple nodes using hash slots. If a node is down or the cluster is not properly configured, requests for keys on that node's hash slots will fail. VendorTrack's `vt:` key prefix is not a hash tag, so keys with the same prefix may be on different nodes.

**Diagnosis Steps**

1. Check cluster health:

```bash
redis-cli -c cluster info
redis-cli -c cluster nodes
```

2. Check if all slots are covered:

```bash
redis-cli -c cluster slots
```

3. Test key access:

```bash
redis-cli -c set "vt:test" "hello" EX 60
redis-cli -c get "vt:test"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Node down | Restart the failed node. If the node cannot be recovered, add a new node and reshard. |
| Slot not covered | Add the missing slot to a node: `redis-cli cluster addslots <slot>`. |
| Hash tag needed for related keys | Use hash tags to ensure related keys are on the same node: `vt:{product}:123`. This is needed for multi-key operations. |
| Cross-slot operation | Avoid multi-key operations (MGET, MSET) across different hash tags. Use separate GET/SET calls instead. |

**Prevention**

- Use at least 6 nodes for Redis Cluster (3 masters + 3 replicas)
- Monitor cluster health with `cluster info` alerts
- Use hash tags for related keys that need atomic operations
- Consider using Upstash Redis for serverless deployments (no cluster management)

---

## 5. Authentication Issues

### 5.1 Login Failures

**Symptoms**

- User cannot log in despite correct credentials
- Supabase auth returns "Invalid login credentials"
- Login page shows "Authentication system error"

**Root Cause**

Login failures in VendorTrack are processed through Supabase Auth. The `authenticateRequest()` function in `src/lib/auth.ts` calls `supabase.auth.getUser()` which validates the JWT token from the session cookie. Failures occur when: the user's email is not confirmed, the password is incorrect, the Supabase Auth service is down, or the session cookie is missing or invalid.

**Diagnosis Steps**

1. Check Supabase Auth logs:

```
Supabase Dashboard > Authentication > Logs
```

2. Test the login directly:

```bash
# Use Supabase client to test login
node -e "
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient('$NEXT_PUBLIC_SUPABASE_URL', '$NEXT_PUBLIC_SUPABASE_ANON_KEY');
  supabase.auth.signInWithPassword({ email: 'test@example.com', password: 'test' })
    .then(r => console.log(r))
    .catch(e => console.error(e));
"
```

3. Check if the user exists and is confirmed:

```sql
SELECT id, email, email_confirmed_at, created_at, last_sign_in_at
FROM auth.users
WHERE email = 'user@example.com';
```

4. Check the session cookie:

```bash
# Browser DevTools > Application > Cookies
# Look for: sb-<project-ref>-auth-token
```

**Resolution**

| Issue | Resolution |
|---|---|
| Email not confirmed | Resend the confirmation email from Supabase Dashboard. Or disable email confirmation for development. |
| Invalid password | Reset the user's password. Check Supabase Auth settings for password requirements. |
| Session cookie missing | Ensure the Supabase provider is configured correctly in `src/components/providers/supabase-provider.tsx`. |
| Auth system error | Check Supabase service status. Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct. |
| Profile not found | The `authenticateRequest()` function also checks the `profiles` table. If the user exists in `auth.users` but not in `profiles`, login fails with "User profile not found". Create the profile manually. |

**Prevention**

- Ensure the signup flow creates both `auth.users` and `profiles` entries
- Monitor Supabase Auth error rates
- Set up email confirmation for production
- Use `createRouteHandlerClient({ cookies })` for all server-side auth

---

### 5.2 Session Expired (JWT Refresh)

**Symptoms**

- User is logged out unexpectedly after a short period
- API returns 401 after the session should still be valid
- User has to re-login frequently

**Root Cause**

Supabase Auth uses JWT tokens with a configurable expiry (default: 1 hour). The refresh token is used to obtain a new JWT. If the refresh token is expired or invalid, the session is lost. In serverless environments, the refresh may not happen automatically because there is no persistent client to handle it.

**Diagnosis Steps**

1. Check JWT expiry settings:

```
Supabase Dashboard > Authentication > Settings > JWT expiry limit
```

2. Check the session in the browser:

```javascript
// Browser console
const supabase = window.__supabase;
const { data: { session } } = await supabase.auth.getSession();
console.log('Expires at:', new Date(session.expires_at * 1000));
console.log('Access token:', session.access_token.substring(0, 20) + '...');
```

3. Check if the refresh token is being used:

```bash
rg "refreshSession\|refresh_token\|onAuthStateChange" src/ --no-heading
```

**Resolution**

| Issue | Resolution |
|---|---|
| JWT expired but refresh failed | Ensure the `onAuthStateChange` listener in the Supabase provider is handling token refresh. The `supabase-provider.tsx` should call `supabase.auth.refreshSession()` automatically. |
| Refresh token expired | Supabase refresh tokens have a longer expiry (default: unlimited). Check if the user's refresh token was revoked. |
| Serverless environment | In serverless, the client-side `onAuthStateChange` listener is not running. Use middleware to refresh the session on each request. |
| Clock skew | Ensure the server and client clocks are synchronized. JWT expiry is based on the server's clock. |

**Prevention**

- Implement automatic session refresh in the Supabase provider
- Use middleware to check and refresh sessions on each request
- Set a reasonable JWT expiry (1 hour for access tokens, longer for refresh tokens)
- Monitor session expiry rates

---

### 5.3 CSRF Token Mismatch

**Symptoms**

- POST/PUT/PATCH/DELETE requests return 403 "CSRF token mismatch"
- Form submissions fail with "Invalid CSRF token"
- API requests from the frontend return 403

**Root Cause**

VendorTrack implements CSRF protection in `src/lib/security/csrf.ts` using a defense-in-depth approach: origin/referer verification, CSRF token double-submit cookie pattern, and content-type verification. Mismatches occur when: the CSRF token is missing from the request header, the token has expired (24-hour max age), the origin header does not match the allowed origins, or the `CSRF_SECRET` environment variable changed between token generation and verification.

**Diagnosis Steps**

1. Check the CSRF token in the request:

```bash
# The token should be in the X-CSRF-Token header
curl -v http://localhost:9002/api/checkout/create-session \
  -H "X-CSRF-Token: <token>" \
  -H "Cookie: __Host-csrf-token=<token>"
```

2. Check if the origin is allowed:

```bash
# Verify the request origin matches the host
# The csrfProtection function checks Origin and Referer headers
curl -v -X POST http://localhost:9002/api/test \
  -H "Origin: https://yourdomain.com" \
  -H "X-CSRF-Token: <token>"
```

3. Check the CSRF_SECRET environment variable:

```bash
# In production, CSRF_SECRET must be set
echo $CSRF_SECRET
# Should be a long random hex string
```

4. Check if the token was generated with a different secret:

```bash
# If CSRF_SECRET changed, all existing tokens are invalid
# This happens after a redeployment if CSRF_SECRET is not persistent
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing CSRF token | Add the `X-CSRF-Token` header to all state-changing API requests. The frontend should read the token from the `__Host-csrf-token` cookie. |
| Token expired | CSRF tokens have a 24-hour max age. The frontend should refresh the token before it expires. |
| Origin not allowed | Add the production domain to `ALLOWED_ORIGINS` in `src/lib/security/csrf.ts`. Or ensure the `Host` header matches the origin. |
| CSRF_SECRET changed | Make `CSRF_SECRET` a persistent environment variable. Generate one with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| Webhook path exempted | The `/api/webhooks/*` path is exempted from CSRF checks. Ensure other external API paths are also exempted if needed. |

**Prevention**

- Set `CSRF_SECRET` as a persistent environment variable in production
- Include the CSRF token in all API requests from the frontend
- Monitor CSRF rejection rates in logs
- Ensure the frontend reads the token from the cookie and sends it in the header

---

### 5.4 Rate Limiting Triggered

**Symptoms**

- 429 "Too Many Requests" response on login, signup, or other endpoints
- User cannot log in after multiple failed attempts
- Legitimate users are blocked from using the application

**Root Cause**

VendorTrack implements rate limiting in `src/lib/security/rate-limit.ts` with sliding window counters. Login is limited to 5 attempts per 15 minutes with a burst limit of 3 per minute. The rate limit is tracked per-user (authenticated) or per-IP (unauthenticated). In production, the in-memory store is per-process, so distributed deployments may have inconsistent rate limiting.

**Diagnosis Steps**

1. Check the rate limit headers in the response:

```bash
curl -v http://localhost:9002/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test"}'

# Look for headers:
# X-RateLimit-Limit: 5
# X-RateLimit-Remaining: 0
# X-RateLimit-Reset: 1700000000
# Retry-After: 900
```

2. Check the rate limit store:

```bash
node -e "
  const { RATE_LIMITS } = require('./src/lib/security/rate-limit');
  console.log('Login limits:', JSON.stringify(RATE_LIMITS.LOGIN, null, 2));
  console.log('Signup limits:', JSON.stringify(RATE_LIMITS.SIGNUP, null, 2));
"
```

3. Check if the user is behind a shared IP (NAT):

```bash
# If many users share the same IP, they share the rate limit
# Check X-Forwarded-For header
```

**Resolution**

| Issue | Resolution |
|---|---|
| Legitimate user rate limited | Wait for the rate limit window to reset. The `Retry-After` header indicates the wait time. |
| Shared IP (NAT) causing rate limiting | Migrate to Redis-based rate limiting for distributed deployments. Use user ID instead of IP for authenticated users. |
| Brute force attack | The rate limit is working as intended. Monitor for continued attacks and consider blocking the IP. |
| Rate limit store memory leak | The in-memory store cleans up expired entries every 60 seconds. If the store is growing, check for memory issues. |

**Prevention**

- Migrate to Redis-based rate limiting for production multi-instance deployments
- Use user ID for authenticated rate limiting instead of IP
- Monitor rate limit rejection rates
- Consider implementing CAPTCHA after repeated failures instead of hard blocking

---

### 5.5 RBAC Permission Denied

**Symptoms**

- User with a valid role gets 403 "Access denied" for a route they should have access to
- Seller cannot access seller dashboard
- Admin cannot access admin dashboard
- Error message shows "Required permission: X. Your role: Y."

**Root Cause**

VendorTrack's RBAC system in `src/lib/rbac.ts` defines roles (super_admin, admin, seller, buyer, guest) and permissions. The `resolveRole()` function maps the database role (`is_admin` flag + `role` field) to the canonical RBAC role. Permission denied errors occur when: the user's `profiles.role` does not match their actual role, the `is_admin` flag is not set correctly, or the route protection rule requires a permission the role does not have.

**Diagnosis Steps**

1. Check the user's role in the database:

```sql
SELECT id, email, role, is_admin
FROM profiles
WHERE id = 'user-uuid';
```

2. Verify the resolved role:

```bash
node -e "
  const { resolveRole, hasPermission, PERMISSIONS } = require('./src/lib/rbac');
  const role = resolveRole('seller', false);
  console.log('Resolved role:', role);
  console.log('Has products.write:', hasPermission(role, PERMISSIONS.PRODUCTS_WRITE));
  console.log('Has users.manage:', hasPermission(role, PERMISSIONS.USERS_MANAGE));
"
```

3. Check the route protection rules:

```bash
node -e "
  const { ROUTE_PROTECTION } = require('./src/lib/rbac');
  ROUTE_PROTECTION.forEach(r => {
    console.log('%s: role=%s, perms=%s', r.path, r.requiredRole, r.requiredPermissions?.join(','));
  });
"
```

4. Check the permission matrix:

```bash
node -e "
  const { PERMISSION_MATRIX, ROLES } = require('./src/lib/rbac');
  console.log('Permission matrix for seller:');
  for (const [perm, roles] of Object.entries(PERMISSION_MATRIX)) {
    if (roles[ROLES.SELLER] !== undefined) {
      console.log('  %s: %s', perm, roles[ROLES.SELLER]);
    }
  }
"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Wrong role in profiles table | Update the user's role: `UPDATE profiles SET role = 'seller' WHERE id = 'user-uuid';` |
| `is_admin` flag incorrect | Set or clear the admin flag: `UPDATE profiles SET is_admin = true WHERE id = 'user-uuid';` |
| Missing permission for role | Check the `ROLE_PERMISSIONS` map in `src/lib/rbac.ts`. If the permission is missing, add it to the role's permission list. |
| Route protection rule too restrictive | Review the `ROUTE_PROTECTION` array. Adjust the `requiredRole` or `requiredPermissions` for the route. |

**Prevention**

- Verify role assignments during user onboarding
- Use the `resolveRole()` function consistently for all role checks
- Test RBAC rules in the test suite
- Audit role assignments periodically

---

### 5.6 Seller Not Approved

**Symptoms**

- Seller cannot access the seller dashboard
- Seller sees "Access denied" or is redirected to the home page
- Seller account exists but dashboard is inaccessible

**Root Cause**

The seller dashboard route (`/seller-dashboard`) requires the `ROLES.SELLER` role and specific permissions. If the user's `profiles.role` is not set to `seller`, or if the `is_admin` flag is not set, the RBAC system will deny access. Additionally, some marketplaces require seller approval before granting dashboard access.

**Diagnosis Steps**

1. Check the user's profile:

```sql
SELECT id, email, role, is_admin, created_at
FROM profiles
WHERE id = 'user-uuid';
```

2. Check if the user exists in `auth.users`:

```sql
SELECT id, email, email_confirmed_at
FROM auth.users
WHERE id = 'user-uuid';
```

3. Check the seller onboarding status:

```bash
# Check if the seller has completed onboarding
rg "seller.*onboarding\|onboarding.*status" src/ --no-heading
```

**Resolution**

| Issue | Resolution |
|---|---|
| User role is 'buyer' | Update the role to 'seller': `UPDATE profiles SET role = 'seller' WHERE id = 'user-uuid';` |
| Email not confirmed | Resend the confirmation email from Supabase Dashboard. |
| Seller not approved | If your marketplace requires approval, approve the seller in the admin dashboard. Update the seller's status in the database. |
| Missing profile | Create the profile entry: `INSERT INTO profiles (id, email, role, is_admin) VALUES ('user-uuid', 'email', 'seller', false);` |

**Prevention**

- Implement a seller approval workflow in the admin dashboard
- Verify the seller's role is set correctly during onboarding
- Monitor seller access failures in the audit log

---

## 6. Performance Issues

### 6.1 High API Latency

**Symptoms**

- API p95 latency exceeds 250ms
- Performance monitor shows `p95LatencyMs` above threshold
- Users report slow page loads and API responses

**Root Cause**

High API latency in VendorTrack can be caused by: slow database queries, cache misses forcing database lookups, expensive AI operations blocking the request, large payload sizes, or insufficient server resources. The `measureApiLatency` wrapper in `src/lib/performance/monitor.ts` records all API latencies.

**Diagnosis Steps**

1. Check the performance snapshot:

```bash
curl -s http://localhost:9002/api/performance | jq '{
  api: { p95: .api.p95LatencyMs, p99: .api.p99LatencyMs, avg: .api.avgLatencyMs, errors: .api.errorRate },
  db: { p95: .database.p95LatencyMs, avg: .database.avgLatencyMs },
  cache: { hitRate: .cache.hitRate }
}'
```

2. Check the API latency histogram:

```bash
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const histogram = performanceMonitor.getApiLatencyHistogram();
  console.log('API Latency:', JSON.stringify(histogram, null, 2));
"
```

3. Check for slow endpoints:

```bash
# Look at recent errors
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const errors = performanceMonitor.getRecentErrors();
  console.log('Recent errors:', JSON.stringify(errors, null, 2));
"
```

4. Profile the specific endpoint:

```bash
# Use curl with timing
curl -w "DNS: %{time_namelookup}s\nConnect: %{time_connect}s\nTTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  -o /dev/null -s http://localhost:9002/api/products/search?q=laptop
```

**Resolution**

| Issue | Resolution |
|---|---|
| Slow database queries | See [2.2 Slow Queries](#22-slow-queries). Add indexes, optimize queries, use `measureDbLatency` to identify hotspots. |
| Cache misses | See [6.4 Cache Hit Rate Low](#64-cache-hit-rate-low). Warm the cache, increase TTLs. |
| AI operations blocking | Move AI operations to background jobs. The Gemini API call in `generateProductDescription` can take 5-10 seconds. |
| Large payloads | Implement pagination. Use field selection in API responses. Compress responses with gzip. |
| Insufficient resources | Scale up the server. Increase Node.js memory with `--max-old-space-size`. |

**Prevention**

- Monitor API latency with alerts at p95 > 250ms
- Use `measureApiLatency` wrapper for all API routes
- Implement caching for frequently accessed data
- Use pagination for large result sets

---

### 6.2 High Database Latency

**Symptoms**

- Database p95 latency exceeds 50ms
- Performance monitor shows `database.p95LatencyMs` above threshold
- API responses are slow due to database bottleneck

**Root Cause**

High database latency is typically caused by: missing indexes, slow queries (see [2.2 Slow Queries](#22-slow-queries)), connection pool exhaustion (see [2.1 Connection Pool Exhaustion](#21-connection-pool-exhaustion)), or Supabase instance being underpowered for the workload.

**Diagnosis Steps**

1. Check database latency histogram:

```bash
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const histogram = performanceMonitor.getDbLatencyHistogram();
  console.log('DB Latency:', JSON.stringify(histogram, null, 2));
"
```

2. Check slow queries:

```bash
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const slowQueries = performanceMonitor.getSlowQueries();
  console.log('Slow queries:', JSON.stringify(slowQueries, null, 2));
"
```

3. Run `EXPLAIN ANALYZE` on suspected slow queries (see [2.2 Slow Queries](#22-slow-queries)).

**Resolution**

| Issue | Resolution |
|---|---|
| Missing indexes | Add indexes for frequently queried columns. See `docs/supabase-performance-migration.sql`. |
| Connection pool exhaustion | See [2.1 Connection Pool Exhaustion](#21-connection-pool-exhaustion). |
| Supabase underpowered | Upgrade the Supabase plan. Consider a dedicated instance for production. |
| N+1 queries | Use Supabase's join syntax to fetch related data in a single query. |

**Prevention**

- Monitor database latency with alerts at p95 > 50ms
- Use `measureDbLatency` wrapper for all database operations
- Run `docs/supabase-performance-migration.sql` to add recommended indexes
- Review query patterns in code reviews

---

### 6.3 Memory Leaks

**Symptoms**

- Node.js heap memory grows continuously without releasing
- `performanceMonitor.getSnapshot().memory.heapUsedMb` increases over time
- Application becomes slow and eventually crashes with OOM

**Root Cause**

Memory leaks in VendorTrack can be caused by: the in-memory rate limit store growing without bounds, the circular buffer in the performance monitor retaining too many entries, the token usage tracker in `src/lib/security/ai-security.ts` accumulating entries, or event listeners not being cleaned up.

**Diagnosis Steps**

1. Check memory usage over time:

```bash
# Take multiple snapshots
for i in $(seq 1 5); do
  curl -s http://localhost:9002/api/performance | jq '.memory'
  sleep 60
done
```

2. Generate a heap snapshot:

```bash
# In the Node.js process
node -e "
  const v8 = require('v8');
  const fs = require('fs');
  const snapshot = v8.writeHeapSnapshot();
  console.log('Snapshot saved:', snapshot);
"
```

3. Analyze the heap snapshot:

```bash
# Load the snapshot in Chrome DevTools > Memory > Load
# Or use heapdump analysis tools
npx heapdump-analyze heapdump-*.heapsnapshot
```

4. Check the size of in-memory stores:

```bash
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const snapshot = performanceMonitor.getSnapshot();
  console.log('Memory:', JSON.stringify(snapshot.memory, null, 2));
  console.log('Cache key count:', snapshot.cache.keyCount);
  console.log('Queue pending:', snapshot.queue.pendingJobs);
"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Rate limit store growing | The store cleans up expired entries every 60 seconds. If entries are not being cleaned, check the `maybeCleanup` method. |
| Circular buffer at capacity | The performance monitor uses circular buffers with a fixed capacity (5000 entries for latencies, 500 for errors). This is bounded and should not cause leaks. |
| Token usage tracker | The `TokenUsageTracker.cleanup()` method should be called daily. If not, old entries accumulate. |
| Event listeners | Ensure all event listeners are removed when components unmount. Use `AbortController` for fetch cleanup. |

**Prevention**

- Monitor memory usage with alerts when heap exceeds 80% of allocated memory
- Run load tests before deployment to detect memory leaks
- Use `--max-old-space-size` to set appropriate memory limits
- Profile memory usage in staging before production deployment

---

### 6.4 Cache Hit Rate Low

**Symptoms**

- Cache hit rate below 80%
- Performance monitor shows `cache.hitRate` below threshold
- Database query count is higher than expected

**Root Cause**

See [4.2 Cache Miss Rate High](#42-cache-miss-rate-high) for Redis-specific issues. For the application-level cache, low hit rates are caused by: cache entries not being populated (missing `getOrSet` calls), aggressive invalidation, or cache warming not running.

**Diagnosis Steps**

1. Check cache statistics:

```bash
curl -s http://localhost:9002/api/performance | jq '.cache'
```

2. Check the cache warming cron:

```bash
curl -s http://localhost:9002/api/cron/cache-warming \
  -H "Authorization: Bearer $CRON_SECRET" | jq
```

3. Review cache usage patterns:

```bash
rg "cacheService\.(get|set|getOrSet)" src/ --no-heading | rg -v "test\|spec"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Cache not warmed | Ensure the cache warming cron runs after deployment. It pre-populates popular product listings, categories, and featured products. |
| Not using getOrSet | Replace raw `get` + `set` patterns with `getOrSet` which automatically populates the cache on miss. |
| Aggressive invalidation | Use targeted invalidation (`invalidateTag` with specific tags) instead of broad invalidation (`clear`). |
| Redis unavailable | If Redis is down, the application falls back to in-memory LRU cache, which is not shared across instances. Fix the Redis connection. |

**Prevention**

- Monitor cache hit rate with alerts below 80%
- Use `getOrSet` for all read-through cache patterns
- Run cache warming on deployment and at regular intervals
- Ensure Redis is highly available in production

---

### 6.5 Queue Backlog Growing

**Symptoms**

- `payment_job_queue` table has many rows with `status: 'pending'`
- Background jobs are not being processed
- Notifications and analytics are delayed

**Root Cause**

The queue processor (`runQueueProcessor` in `src/lib/payment/queue.ts`) must be running to process jobs. If the processor is not running, or if it is processing jobs slower than they are being enqueued, the backlog grows. This can happen when: the queue processor is not started, the processor is crashing repeatedly, or the database is slow causing job processing to be slow.

**Diagnosis Steps**

1. Check the queue status:

```bash
node -e "
  const { getQueueStatus } = require('./src/lib/payment/queue');
  getQueueStatus().then(status => console.log(JSON.stringify(status, null, 2)));
"
```

2. Check if the queue processor is running:

```bash
rg "queue_processor_started\|queue_processor_stopped" logs/ --no-heading | tail -5
```

3. Check the oldest pending job:

```sql
SELECT id, job_type, created_at, attempts, next_attempt_at
FROM payment_job_queue
WHERE status = 'pending'
ORDER BY created_at ASC
LIMIT 10;
```

**Resolution**

| Issue | Resolution |
|---|---|
| Queue processor not running | Start the processor. In production, it should be run as a background worker (see `Dockerfile.worker`). |
| Processor crashing | Check the logs for the crash reason. Fix the underlying issue. |
| Processing too slow | Scale up the number of workers. Each worker polls the queue independently using `SELECT ... FOR UPDATE SKIP LOCKED`. |
| Database slow | Fix the database performance issue. See [2.2 Slow Queries](#22-slow-queries). |

**Prevention**

- Monitor queue backlog size with alerts
- Run the queue processor as a dedicated worker process
- Ensure the worker is restarted automatically on failure
- Scale workers based on queue depth

---

### 6.6 Slow Page Loads

**Symptoms**

- Largest Contentful Paint (LCP) exceeds 2.5 seconds
- First Input Delay (FID) exceeds 100ms
- Cumulative Layout Shift (CLS) exceeds 0.1
- Core Web Vitals are poor in Google Search Console

**Root Cause**

Slow page loads in VendorTrack are caused by: unoptimized images, large JavaScript bundles, server-side rendering taking too long, missing cache headers, or too many API calls on page load.

**Diagnosis Steps**

1. Run Lighthouse audit:

```bash
npx lighthouse http://localhost:9002 --output json --output-path lighthouse-report.json
cat lighthouse-report.json | jq '.categories.performance.auditRefs'
```

2. Check Next.js build output for bundle sizes:

```bash
npm run build
# Check the output for route sizes
# Look for large pages and chunks
```

3. Check server-side rendering time:

```bash
# Add timing headers in next.config.js
curl -w "TTFB: %{time_starttransfer}s\nTotal: %{time_total}s\n" \
  -o /dev/null -s http://localhost:9002/
```

4. Check cache headers:

```bash
curl -I http://localhost:9002/api/products/search?q=laptop
# Look for Cache-Control headers
```

**Resolution**

| Issue | Resolution |
|---|---|
| Large images | Use Next.js `<Image>` component with automatic optimization. Set `sizes` prop for responsive images. |
| Large JavaScript bundle | Use dynamic imports for heavy components. Split the AI generator modal into a separate chunk. |
| Slow SSR | Cache SSR pages with `getCacheHeaders()`. Use `revalidate` for ISR. |
| Missing cache headers | Use `getCacheHeaders(duration)` from `src/lib/cache/redis-client.ts` for API responses. |
| Too many API calls | Combine API calls. Use server-side data fetching (getServerSideProps) instead of client-side fetching. |

**Prevention**

- Monitor Core Web Vitals with alerts
- Run Lighthouse audits in CI
- Use Next.js Image component for all images
- Implement caching at every layer (CDN, API, database)

---

### 6.7 High Error Rate

**Symptoms**

- Error rate exceeds 1% of all requests
- Performance monitor shows `api.errorRate` above 0.01
- Sentry reports increasing error volume

**Root Cause**

High error rates are caused by: application bugs, database failures, external service failures (Stripe, Gemini), or infrastructure issues. The error rate is calculated as `errorCount / requestCount` in the performance monitor.

**Diagnosis Steps**

1. Check the error rate:

```bash
curl -s http://localhost:9002/api/performance | jq '.api.errorRate'
```

2. Check recent errors:

```bash
node -e "
  const { performanceMonitor } = require('./src/lib/performance/monitor');
  const errors = performanceMonitor.getRecentErrors();
  console.log('Recent errors:', JSON.stringify(errors, null, 2));
"
```

3. Check Sentry for error details:

```
Sentry Dashboard > Issues > Most Recent
```

4. Check specific error patterns:

```bash
rg "500\|error\|failed\|timeout" logs/ --no-heading | tail -50
```

**Resolution**

| Issue | Resolution |
|---|---|
| Application bug | Fix the bug. Deploy a hotfix. |
| Database failure | See [2. Database Issues](#2-database-issues). |
| External service failure | Check the service status. Implement retry logic. Activate circuit breakers. |
| Infrastructure issue | Check server resources (CPU, memory, disk). Scale up if needed. |

**Prevention**

- Monitor error rate with alerts at 1% threshold
- Use Sentry for error tracking and alerting
- Implement health checks for all critical paths
- Run smoke tests in CI to catch regressions

---

## 7. Search Issues

### 7.1 No Search Results

**Symptoms**

- Search queries return zero results for valid queries
- Product search page shows "No products found"
- Search API returns empty `products` array

**Root Cause**

The search service in `src/services/search-service.ts` uses `productRepository.search()` which queries the `products` table with filters. Zero results occur when: the products table has no active products, the FTS (Full-Text Search) index is not configured, the `status` filter is too restrictive, or the `deleted_at` column is not properly set to `NULL`.

**Diagnosis Steps**

1. Check if products exist:

```sql
SELECT count(*), status
FROM products
WHERE deleted_at IS NULL
GROUP BY status;
```

2. Check the FTS index:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'products'
  AND indexdef LIKE '%gin%';
```

3. Test the search query directly:

```sql
-- Test basic search
SELECT id, title, status
FROM products
WHERE status = 'active'
  AND deleted_at IS NULL
  AND title ILIKE '%laptop%'
LIMIT 5;

-- Test FTS search (if configured)
SELECT id, title
FROM products
WHERE status = 'active'
  AND deleted_at IS NULL
  AND to_tsvector('english', title) @@ to_tsquery('english', 'laptop')
LIMIT 5;
```

4. Check the search API:

```bash
curl -s "http://localhost:9002/api/products/search?q=laptop" | jq '.products | length'
```

**Resolution**

| Issue | Resolution |
|---|---|
| No active products | Add products to the database. Ensure products have `status = 'active'` and `deleted_at IS NULL`. |
| Missing FTS index | Create the FTS index: `CREATE INDEX idx_products_fts ON products USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));` |
| Search query too specific | Relax the search query. Use partial matching (`ILIKE '%term%'`) or FTS with prefix matching. |
| All products deleted | Check `deleted_at` column. Soft-deleted products should have `deleted_at IS NOT NULL`. |

**Prevention**

- Run `docs/supabase-performance-migration.sql` to create FTS indexes
- Ensure product seeding creates active products
- Monitor search result counts in production
- Add a search integration test

---

### 7.2 Slow Search Queries

**Symptoms**

- Search queries take more than 500ms
- Search API times out
- Database shows high CPU usage during search

**Root Cause**

Slow search queries are caused by: missing FTS indexes forcing full table scans, `ILIKE` patterns that cannot use indexes, too many results requiring pagination, or complex filter combinations (category + price range + search term).

**Diagnosis Steps**

1. Run `EXPLAIN ANALYZE` on the search query:

```sql
EXPLAIN ANALYZE
SELECT * FROM products
WHERE status = 'active'
  AND deleted_at IS NULL
  AND title ILIKE '%laptop%'
  AND category = 'Electronics'
  AND price_cents BETWEEN 10000 AND 50000
ORDER BY created_at DESC
LIMIT 20;
```

2. Check for sequential scans:

```sql
SELECT relname, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE relname = 'products';
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing FTS index | Create a GIN index for full-text search. See `docs/supabase-performance-migration.sql`. |
| ILIKE causing full scan | Replace `ILIKE` with FTS. `ILIKE '%term%'` cannot use B-tree indexes. Use `to_tsvector` and `to_tsquery` instead. |
| Missing composite index | Create composite indexes for common filter combinations: `CREATE INDEX idx_products_search ON products(status, category) WHERE deleted_at IS NULL;` |
| Too many results | Implement cursor-based pagination instead of offset-based. Use `LIMIT` with a reasonable page size. |

**Prevention**

- Use FTS instead of ILIKE for all search queries
- Add indexes for common search patterns
- Monitor search query latency
- Set query timeouts for search endpoints

---

### 7.3 Search Suggestions Not Working

**Symptoms**

- Search autocomplete returns empty suggestions
- `getSearchSuggestions()` returns an empty array
- No suggestions appear as the user types

**Root Cause**

The `getSearchSuggestions` function in `src/services/search-service.ts` queries the `products` table with `ILIKE` for prefix matching. It requires at least 2 characters of input and caches results for 10 minutes (`CACHE_DURATIONS.SEARCH_SUGGESTIONS`). Suggestions fail when: there are no active products matching the prefix, the cache is not populated, or the `getSupabaseAdmin()` import is missing.

**Diagnosis Steps**

1. Test the suggestion query directly:

```sql
SELECT title
FROM products
WHERE status = 'active'
  AND deleted_at IS NULL
  AND title ILIKE 'lap%'
LIMIT 5;
```

2. Test the API:

```bash
curl -s "http://localhost:9002/api/products/search?q=la&suggestions=true" | jq
```

3. Check the cache:

```bash
node -e "
  const { cacheService } = require('./src/lib/cache/redis-client');
  cacheService.get('search-suggestions:la').then(v => console.log('Cached:', v));
"
```

**Resolution**

| Issue | Resolution |
|---|---|
| No matching products | Ensure there are active products with titles matching the prefix. Add seed data. |
| Prefix too short | The function requires at least 2 characters. This is by design. |
| Cache not populated | The cache is populated on first access. If the cache is empty, the first request will be slow. Run cache warming. |
| Missing import | Ensure `getSupabaseAdmin` is imported in the search service. The file uses it directly without a top-level import. |

**Prevention**

- Populate search suggestions during cache warming
- Monitor suggestion response times
- Add a fallback suggestion list for popular searches

---

## 8. AI Issues

### 8.1 Gemini API Errors

**Symptoms**

- AI product description generation fails with "The AI agent is currently unavailable"
- 429 "Resource exhausted" errors from Gemini API
- 403 "API key not valid" errors

**Root Cause**

The Gemini API is used via Genkit in `src/ai/flows/generate-product-description.ts`. Errors occur when: the `GEMINI_API_KEY` is missing or invalid, the API quota is exceeded, the API rate limit is hit, or the model is unavailable. Note that `GEMINI_API_KEY` is optional in VendorTrack (AI features degrade gracefully).

**Diagnosis Steps**

1. Check if the API key is configured:

```bash
echo $GEMINI_API_KEY
# Should be a non-empty string
```

2. Test the API key directly:

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Hello"}]}]}' | jq
```

3. Check the quota usage:

```
Google Cloud Console > APIs & Services > Gemini API > Quotas
```

4. Check the AI rate limit:

```bash
node -e "
  const { checkRateLimit, RATE_LIMITS } = require('./src/lib/security/rate-limit');
  const result = checkRateLimit(RATE_LIMITS.AI_GENERATE, 'user:test-user');
  console.log('Allowed:', result.allowed, 'Remaining:', result.remaining);
"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing API key | Set `GEMINI_API_KEY` in the environment. AI features are optional and will gracefully degrade if the key is missing. |
| Invalid API key | Regenerate the key in Google Cloud Console. Update the environment variable. |
| Rate limit exceeded | The application rate limits AI requests to 10 per hour per user. Wait for the limit to reset. The `Retry-After` header indicates the wait time. |
| Quota exceeded | Upgrade the Gemini API plan in Google Cloud Console. Reduce the number of AI requests per day. |
| Model unavailable | Gemini 2.5 Flash may be temporarily unavailable. Retry with exponential backoff. |

**Prevention**

- Monitor Gemini API usage and set budget alerts in Google Cloud Console
- Use the rate limiting system to prevent quota exhaustion
- Implement graceful degradation when the AI service is unavailable
- Cache AI-generated descriptions to reduce API calls

---

### 8.2 Prompt Injection Detected

**Symptoms**

- User receives "Input contains potentially malicious content" error
- Security logs show `PROMPT_INJECTION_ATTEMPT` events
- AI generation is blocked for legitimate user input

**Root Cause**

The `detectPromptInjection` function in `src/lib/security/ai-security.ts` uses a pattern-based heuristic to detect prompt injection attempts. It assigns a risk score based on the number of detected patterns (20 points per pattern) and additional heuristics (input length, multiple instructions, mixed language). A risk score of 60 or above blocks the request. False positives can occur when legitimate product descriptions contain patterns that match injection heuristics.

**Diagnosis Steps**

1. Check the security logs:

```sql
SELECT event_type, severity, metadata
FROM audit_logs
WHERE event_type = 'PROMPT_INJECTION_ATTEMPT'
ORDER BY created_at DESC
LIMIT 20;
```

2. Test the injection detector:

```bash
node -e "
  const { detectPromptInjection } = require('./src/lib/security/ai-security');
  const result = detectPromptInjection('Professional wireless headphones with active noise cancellation');
  console.log('Risk score:', result.riskScore);
  console.log('Suspicious:', result.isSuspicious);
  console.log('Patterns:', result.detectedPatterns);
"
```

3. Check the risk score threshold:

```bash
# The threshold is 60 for blocking, 40 for flagging
rg "riskScore >= 60\|riskScore >= 40" src/ --no-heading
```

**Resolution**

| Issue | Resolution |
|---|---|
| False positive (legitimate input blocked) | Review the detected patterns. If the input is safe, consider lowering the threshold or adding exceptions. The threshold is in `src/ai/flows/generate-product-description.ts` (line: `if (injectionCheck.isSuspicious && injectionCheck.riskScore >= 60)`). |
| Actual injection attempt | The system is working as intended. The attempt was blocked. Review the audit log for the user's activity. |
| Low-risk flags (score 40-59) | These are logged but not blocked. The input is sanitized and the request proceeds. No action needed. |

**Prevention**

- Monitor `PROMPT_INJECTION_ATTEMPT` events for patterns
- Adjust the risk score threshold based on false positive rates
- Keep the injection pattern list up to date
- Sanitize all AI output before rendering

---

### 8.3 AI Product Description Generation Failures

**Symptoms**

- "The AI agent is currently unavailable" error
- AI generation modal shows an error
- No output is produced despite valid input

**Root Cause**

The `generateProductDescription` function in `src/ai/flows/generate-product-description.ts` goes through 7 security gates before calling the Gemini API. Failures can occur at any gate: authentication (gate 1), rate limiting (gate 2), input size validation (gate 3), prompt injection detection (gate 4), input sanitization (gate 5), token budget (gate 6), or the API call itself (gate 7).

**Diagnosis Steps**

1. Identify which gate failed:

```bash
# Check the error message
# "Authentication required" -> Gate 1
# "rate limit exceeded" -> Gate 2
# "Input too long" -> Gate 3
# "potentially malicious content" -> Gate 4
# "AI request denied" -> Gate 5 or 6
# "AI agent is currently unavailable" -> Gate 7
```

2. Check the token budget:

```bash
node -e "
  const { checkTokenBudget, estimateTokenCount } = require('./src/lib/security/ai-security');
  const tokens = estimateTokenCount('test product name test category test features test audience');
  const budget = checkTokenBudget('user-uuid', tokens);
  console.log('Allowed:', budget.allowed, 'Used:', budget.used, 'Remaining:', budget.remaining);
"
```

3. Check the Gemini API status:

```bash
curl -s "https://status.cloud.google.com/" | grep -i gemini
```

**Resolution**

| Gate | Resolution |
|---|---|
| Gate 1 (Authentication) | User must be signed in. Ensure the Supabase session is valid. |
| Gate 2 (Rate limit) | Wait for the rate limit to reset. The limit is 10 per hour per user. |
| Gate 3 (Input size) | Reduce input length. Max 2000 characters combined. |
| Gate 4 (Prompt injection) | Review the input for suspicious patterns. Remove any instruction-like content. |
| Gate 5 (Input sanitization) | Fix field validation errors. Product name max 200 chars, category max 100, features max 1000, audience max 200. |
| Gate 6 (Token budget) | Daily token budget is 50,000 tokens per user. Wait for the next day or increase the budget. |
| Gate 7 (API call) | Check Gemini API status. Verify the API key. Retry the request. |

**Prevention**

- Implement graceful degradation when AI is unavailable
- Cache AI-generated descriptions to reduce API calls
- Monitor AI generation failure rates
- Set up alerts for Gemini API errors

---

## 9. Monitoring Issues

### 9.1 Sentry Not Receiving Errors

**Symptoms**

- No new errors appear in the Sentry dashboard
- Known production errors are not being reported
- `SENTRY_DSN` is configured but events are not reaching Sentry

**Root Cause**

The Sentry integration in `src/lib/monitoring/sentry.ts` initializes Sentry only when `SENTRY_DSN` is set. Errors may not be received when: the `SENTRY_DSN` is incorrect, the Sentry project is paused, the `beforeSend` hook is filtering out errors, the `ignoreErrors` list is too broad, or the application is not calling `initSentryServer()` or `initSentryClient()`.

**Diagnosis Steps**

1. Verify Sentry initialization:

```bash
# Check if SENTRY_DSN is set
echo $SENTRY_DSN
# Should be: https://xxx@xxx.ingest.sentry.io/xxx

# Check if Sentry is initialized
node -e "
  const Sentry = require('@sentry/nextjs');
  console.log('Sentry initialized:', Sentry.getCurrentHub().getClient() !== undefined);
"
```

2. Test error reporting:

```bash
# Send a test error
node -e "
  const { captureException } = require('./src/lib/monitoring/sentry');
  captureException(new Error('Test error from troubleshooting'), {
    tags: { test: 'true' },
    extra: { source: 'troubleshooting_guide' },
  });
"
```

3. Check the `ignoreErrors` list:

```bash
rg "ignoreErrors" src/lib/monitoring/sentry.ts -A15
```

4. Check the `beforeSend` hook:

```bash
rg "beforeSend" src/lib/monitoring/sentry.ts -A10
```

**Resolution**

| Issue | Resolution |
|---|---|
| Missing `SENTRY_DSN` | Set the `SENTRY_DSN` environment variable. Get it from Sentry Dashboard > Project Settings > Client Keys. |
| Invalid `SENTRY_DSN` | Verify the DSN format. It should be: `https://<key>@<host>/<project_id>` |
| `beforeSend` filtering errors | Review the `beforeSend` hook in `src/lib/monitoring/sentry.ts`. It strips PII but should not filter out errors. |
| `ignoreErrors` too broad | Review the `ignoreErrors` list. Currently ignored: `ResizeObserver`, `Network request failed`, `Failed to fetch`, `Load failed`, `AbortError`. Remove any that are too broad. |
| Sentry not initialized | Ensure `initSentryServer()` is called in `instrumentation.ts` and `initSentryClient()` is called in the client provider. |
| Network issue | Verify the application can reach `sentry.io`. Check firewall rules. |

**Prevention**

- Set `SENTRY_DSN` in all environments
- Test Sentry integration after deployment
- Monitor Sentry event volume for sudden drops
- Use `captureException` for all critical errors

---

### 9.2 Prometheus Metrics Not Scraping

**Symptoms**

- Prometheus targets show as "DOWN" in the targets page
- No metrics from VendorTrack appear in Prometheus
- Grafana dashboards show "No data"

**Root Cause**

The performance monitor in `src/lib/performance/monitor.ts` exposes metrics in Prometheus format via `exportPrometheus()`. Scraping fails when: the `/api/performance` endpoint is not accessible, the endpoint requires authentication that Prometheus does not have, the Prometheus configuration is incorrect, or the application is not running.

**Diagnosis Steps**

1. Check the metrics endpoint:

```bash
curl -s http://localhost:9002/api/performance | head -20
# Should show Prometheus-formatted metrics like:
# # HELP vt_api_request_count Total API requests
# # TYPE vt_api_request_count counter
# vt_api_request_count 1234
```

2. Check Prometheus configuration:

```bash
# Check the prometheus.yml configuration
cat monitoring/prometheus.yml
```

3. Check Prometheus targets:

```bash
# Open Prometheus UI
curl -s http://prometheus:9090/api/v1/targets | jq '.data.activeTargets[] | {health: .health, lastError: .lastError, scrapeUrl: .scrapeUrl}'
```

4. Check if the endpoint is behind authentication:

```bash
# If the endpoint requires admin auth, Prometheus needs credentials
curl -s http://localhost:9002/api/performance -H "Authorization: Bearer $CRON_SECRET"
```

**Resolution**

| Issue | Resolution |
|---|---|
| Endpoint not accessible | Ensure the application is running and the `/api/performance` endpoint is reachable. Check firewall rules. |
| Authentication required | Add basic auth or bearer token to the Prometheus scrape configuration. Update `monitoring/prometheus.yml` with `basic_auth` or `bearer_token`. |
| Wrong scrape URL | Update the `scrape_configs` in `monitoring/prometheus.yml` to point to the correct URL. |
| Prometheus cannot resolve DNS | Use IP addresses instead of hostnames, or configure DNS resolution in Prometheus. |
| SSL certificate issues | Set `insecure_skip_verify: true` in the Prometheus scrape config for self-signed certificates. |

**Prevention**

- Use the provided `monitoring/prometheus.yml` configuration
- Test the metrics endpoint after deployment
- Monitor Prometheus target health in Grafana
- Ensure the metrics endpoint is accessible from the Prometheus network

---

### 9.3 Grafana Dashboard Not Updating

**Symptoms**

- Grafana dashboard shows stale data
- Panels show "No data" or old timestamps
- Dashboard was working but stopped updating

**Root Cause**

Grafana dashboards query Prometheus for data. If Prometheus is not scraping (see [9.2 Prometheus Metrics Not Scraping](#92-prometheus-metrics-not-scraping)), the dashboard will not update. Other causes include: the dashboard's time range is incorrect, the Prometheus data source is misconfigured, or the query uses a metric name that has changed.

**Diagnosis Steps**

1. Check the Prometheus data source:

```bash
# Grafana API
curl -s http://grafana:3000/api/datasources | jq '.[] | {name: .name, type: .type, url: .url}'
```

2. Test a query directly in Prometheus:

```bash
curl -s "http://prometheus:9090/api/v1/query?query=vt_api_request_count" | jq
```

3. Check the Grafana dashboard configuration:

```bash
# Verify the dashboard JSON
ls monitoring/grafana/dashboards/
```

4. Check the time range in Grafana:

```
Grafana Dashboard > Time picker (top right)
Ensure the time range includes recent data
```

**Resolution**

| Issue | Resolution |
|---|---|
| Prometheus not scraping | See [9.2 Prometheus Metrics Not Scraping](#92-prometheus-metrics-not-scraping). |
| Data source misconfigured | Update the Prometheus URL in Grafana data source settings. Ensure the URL points to the correct Prometheus instance. |
| Wrong time range | Set the dashboard time range to "Last 5 minutes" or "Last 1 hour". |
| Metric name changed | Update the dashboard queries to use the correct metric names. The metrics are prefixed with `vt_` (e.g., `vt_api_latency_p95_ms`). |
| Grafana cache | Refresh the dashboard. Clear browser cache. |

**Prevention**

- Use the provided Grafana dashboard configuration
- Monitor the Grafana data source health
- Set up alerts for dashboard staleness
- Use consistent metric naming conventions

---

### 9.4 Health Check Returning 503

**Symptoms**

- `/api/cron/health-check` returns 503 or "degraded" status
- Load balancer marks the instance as unhealthy
- Docker health check fails

**Root Cause**

The health check endpoint in `src/app/api/cron/health-check/route.ts` queries the `profiles` table to verify database connectivity. It returns 503 when the database query fails, the Supabase URL or service role key is incorrect, or the `CRON_SECRET` authentication fails.

**Diagnosis Steps**

1. Call the health check directly:

```bash
curl -v http://localhost:9002/api/cron/health-check \
  -H "Authorization: Bearer $CRON_SECRET"
```

2. Check the database connectivity:

```bash
curl -s "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

3. Check the application logs:

```bash
docker logs <container-id> --tail 100 | grep -i "health\|error\|failed"
```

4. Check if the health check is authenticated:

```bash
# In production, CRON_SECRET must be set
echo $CRON_SECRET
# If empty, the health check will return 401 in production
```

**Resolution**

| Issue | Resolution |
|---|---|
| Database unreachable | Verify Supabase credentials. Check Supabase project status. Ensure the application can reach the Supabase URL. |
| CRON_SECRET missing | Set `CRON_SECRET` in the environment. In production, the health check requires `Authorization: Bearer $CRON_SECRET`. |
| CRON_SECRET mismatch | Ensure the `CRON_SECRET` used in the request matches the one set in the environment. |
| Health check timeout | The health check queries the database. If the database is slow, the health check may timeout. Increase the health check timeout in the Dockerfile. |
| Application not started | Check if the application is running. The health check requires the Next.js server to be listening on port 9002. |

**Prevention**

- Set `CRON_SECRET` in all environments
- Monitor health check success rate in Grafana
- Use the Docker health check with appropriate start period
- Set up alerts for health check failures

---

## Emergency Contacts and Escalation

| Service | Escalation Path |
|---|---|
| Supabase | Supabase Dashboard > Support > New Ticket |
| Stripe | Stripe Dashboard > Help > Contact Support |
| Redis / Upstash | Upstash Dashboard > Support |
| Gemini API | Google Cloud Console > Support |
| Sentry | Sentry Dashboard > Support |
| Vercel | Vercel Dashboard > Help > Contact Support |

---

## Appendix: Key File Paths

| Component | File Path |
|---|---|
| Environment validation | `src/lib/env.ts` |
| Redis cache client | `src/lib/cache/redis-client.ts` |
| Payment errors | `src/lib/payment/errors.ts` |
| Payment retry / circuit breaker | `src/lib/payment/retry.ts` |
| Payment queue | `src/lib/payment/queue.ts` |
| Payment reconciliation | `src/lib/payment/reconciliation-service.ts` |
| Payment refund | `src/lib/payment/refund-service.ts` |
| Stripe webhook handler | `src/app/api/webhooks/stripe/route.ts` |
| RBAC system | `src/lib/rbac.ts` |
| Auth utilities | `src/lib/auth.ts` |
| CSRF protection | `src/lib/security/csrf.ts` |
| Rate limiting | `src/lib/security/rate-limit.ts` |
| AI security | `src/lib/security/ai-security.ts` |
| AI product description | `src/ai/flows/generate-product-description.ts` |
| Sentry integration | `src/lib/monitoring/sentry.ts` |
| Performance monitor | `src/lib/performance/monitor.ts` |
| Search service | `src/services/search-service.ts` |
| Health check cron | `src/app/api/cron/health-check/route.ts` |
| Cache warming cron | `src/app/api/cron/cache-warming/route.ts` |
| Reconciliation cron | `src/app/api/cron/reconciliation/route.ts` |
| Dockerfile (production) | `Dockerfile` |
| Dockerfile (worker) | `Dockerfile.worker` |
| Docker Compose | `docker-compose.yml` |
| Prometheus config | `monitoring/prometheus.yml` |
| Prometheus alerts | `monitoring/alerts.yml` |
| Database migrations | `docs/supabase-*.sql` |
