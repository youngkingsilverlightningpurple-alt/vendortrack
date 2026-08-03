# VendorTrack Operations Manual

**Version:** 1.0
**Last Updated:** 2025-01-15
**Classification:** Internal -- Operations Engineering
**Audience:** Operations engineers responsible for daily platform maintenance

---

## Table of Contents

1. [Daily Operations](#1-daily-operations)
2. [Weekly Maintenance](#2-weekly-maintenance)
3. [Monthly Maintenance](#3-monthly-maintenance)
4. [Monitoring](#4-monitoring)
5. [Scaling](#5-scaling)
6. [Backups](#6-backups)
7. [Recovery](#7-recovery)
8. [Operational Checklists](#8-operational-checklists)

---

## 1. Daily Operations

Daily operations are the foundation of VendorTrack reliability. Every morning, the on-call operations engineer must complete the health check sequence before 10:00 UTC. This ensures that any overnight degradation is caught before peak traffic hours begin. The entire daily operations routine should take approximately 30 to 45 minutes and covers application health, payment system integrity, performance metrics, queue processing, database status, cache effectiveness, and backup verification.

### 1.1 Morning Health Check

The morning health check is the single most important operational task. It validates that all system components are functioning correctly after the overnight low-traffic period. Start by verifying the public health endpoint, which confirms that the Next.js application is responding, the Supabase connection is live, and the Redis cache is reachable.

```bash
# Check primary health endpoint
curl -sf https://app.vendortrack.com/api/health | jq .

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2025-01-15T08:00:00.000Z",
#   "database": { "status": "ok", "latencyMs": 12 },
#   "cache": { "status": "ok" }
# }
```

If the health endpoint returns `degraded` or `error`, immediately check the Sentry dashboard for correlated errors and review the Docker container logs. The application container runs a health check every 30 seconds with a 10-second timeout and 3 retries, so a failure at the HTTP level means the internal health checks have already exhausted their retries.

```bash
# Check Docker container health (self-hosted deployments)
docker inspect --format='{{.State.Health.Status}}' vendortrack-app

# Check container logs for errors
docker logs --since 1h vendortrack-app 2>&1 | grep -i "error\|fatal\|crash"
```

### 1.2 Payment Health Check

VendorTrack handles real money through Stripe Connect, making payment health a fiduciary concern. The payment health endpoint provides real-time metrics on payment processing, refund rates, and circuit breaker status. This endpoint is admin-only and requires authentication.

```bash
# Check payment health (requires admin auth token)
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/payment-health | jq .
```

Review the following metrics in the payment health response:

| Metric | Healthy Range | Warning | Critical |
|--------|--------------|---------|----------|
| `successfulPayments` (24h) | > 0 | 0 | N/A |
| `failedSessions` (24h) | < 5% of successful | 5-10% | > 10% |
| `refundRate` (7d) | < 2% | 2-5% | > 5% |
| `pendingRefunds` | < 10 | 10-50 | > 50 |
| `criticalEvents` (24h) | 0 | 1-3 | > 3 |
| `queue.pending` | < 100 | 100-1000 | > 1000 |
| `queue.dead` | 0 | 1-10 | > 10 |

If any circuit breaker is in the `open` state, it means the payment system is actively refusing requests to prevent cascading failures. Check the Stripe status page and review recent webhook deliveries in the Stripe Dashboard.

### 1.3 Monitoring Dashboard Review

Open the Grafana dashboard and review the following panels:

1. **API Overview** -- Request rate, error rate, and latency percentiles (p50, p95, p99) over the last 24 hours
2. **Database Health** -- Connection pool usage, query latency distribution, slow query count
3. **Cache Performance** -- Hit rate trend, key count, memory usage over time
4. **Queue Depth** -- Pending jobs, processing jobs, dead letter queue growth
5. **Memory Usage** -- Heap usage, RSS, and external memory trends

Look for any anomalies compared to the previous day's baseline. A sudden drop in request rate often indicates an upstream problem (DNS, CDN, or load balancer), while a gradual increase in latency suggests a database or cache issue.

### 1.4 Error Rate Review

Review the Sentry dashboard for new and recurring errors. Focus on the following:

- **New errors** introduced in the last 24 hours that have not been seen before
- **Recurring errors** with frequency above 10 occurrences per hour
- **Payment-related errors** (any error in the payment flow, regardless of frequency)
- **Authentication errors** that may indicate a security issue

```bash
# Check performance endpoint for recent errors
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '.recentErrors'
```

For each error, determine whether it is a known issue with a fix in progress, a new regression requiring investigation, or a transient error that can be dismissed. All payment errors must be triaged within one hour of detection.

### 1.5 Queue Depth Review

The background job queue is critical for payment processing, notifications, analytics, and reconciliation. Review the queue depth using the performance endpoint or directly from the database.

```bash
# Check queue status via performance endpoint
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '.snapshot.queue'
```

The VendorTrack system maintains two queue tables: `payment_job_queue` for payment-specific jobs and `background_jobs` for general-purpose tasks. Both use atomic job claiming with compare-and-swap semantics to prevent duplicate processing across multiple workers.

| Queue Status | Action |
|--------------|--------|
| `pending` < 100 | Normal -- no action needed |
| `pending` 100-1000 | Investigate -- check worker health and error logs |
| `pending` > 1000 | Escalate -- scale workers, check for systemic failures |
| `dead` > 0 | Review dead jobs, determine root cause, retry if safe |
| `processing` stuck > 10 min | Check for stuck workers, may need manual intervention |

If the dead letter queue is growing, use the `retryDeadJobs` function to re-queue jobs after identifying the root cause:

```sql
-- Check dead letter jobs
SELECT id, job_type, error_message, attempts, created_at
FROM background_jobs
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;
```

### 1.6 Database Health Check

The Supabase PostgreSQL database is the primary data store for all VendorTrack data. Use the database monitoring views to check for slow queries, cache hit rates, table bloat, and connection usage.

```bash
# Check database health via the monitoring service
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '.snapshot.database'
```

Key database health indicators:

| Indicator | Healthy | Warning | Critical |
|-----------|---------|---------|----------|
| Index cache hit rate | > 99% | 95-99% | < 95% |
| Table cache hit rate | > 99% | 95-99% | < 95% |
| Active connections | < 60% of max | 60-80% | > 80% |
| Slow query count | 0 | 1-10 | > 10 |
| Table bloat (any table) | < 10% | 10-20% | > 20% |

Review the slow queries list from the performance endpoint. Any query exceeding 1000ms is recorded in the slow query buffer. If slow queries are detected, capture the query text and plan for index optimization during the weekly maintenance window.

### 1.7 Cache Hit Rate Review

The Redis cache layer is essential for maintaining low API latency. Review the cache statistics to ensure the hit rate is above the target threshold.

```bash
# Check cache stats
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '.cache'
```

Cache hit rate targets:

| Cache Type | Target Hit Rate | TTL (seconds) |
|------------|----------------|----------------|
| Product listings | > 80% | 300 |
| Product detail | > 75% | 120 |
| Search results | > 70% | 60 |
| Marketplace stats | > 85% | 300 |
| Seller analytics | > 80% | 180 |
| Categories | > 90% | 600 |

If the cache hit rate drops below 50%, the alert `VendorTrackLowCacheHitRate` will fire. Common causes include Redis restarts, cache warming failures, or a sudden influx of unique queries. The cache warming cron runs every 6 hours to pre-populate featured products and categories.

### 1.8 Daily Backup Verification

Verify that the daily backup completed successfully. The backup script runs at 03:00 UTC and creates a full backup of the database, Redis, and environment configuration.

```bash
# Check latest backup manifest
LATEST=$(ls -td /var/backups/vendortrack/2* | head -1)
cat "$LATEST/manifest.json" | jq .

# Verify backup file exists and has reasonable size
ls -lh "$LATEST/database.dump"
ls -lh "$LATEST/redis-dump.rdb"

# Check backup log for errors
rg -i "error|failed" "$LATEST/backup.log"
```

The backup manifest contains the timestamp, type, version, and component status. If any component shows `false` in the manifest, investigate immediately. The backup retention period is 30 days by default, configurable via `RETENTION_DAYS`.

---

## 2. Weekly Maintenance

Weekly maintenance tasks are performed every Monday between 06:00 and 08:00 UTC, during the lowest-traffic window. These tasks go beyond the daily health checks to address security, performance trends, dependencies, database optimization, backup integrity, and feature flag management. Each task should be documented in the operations log with the date, engineer, and any findings.

### 2.1 Security Review

The weekly security review covers audit logs, failed authentication attempts, and rate limit violations. VendorTrack maintains an audit log table that records all significant actions, and the security logger tracks authentication events and rate limit violations.

```bash
# Review failed authentication attempts from the past week
psql "$SUPABASE_DB_URL" -c "
  SELECT count(*), date_trunc('day', created_at) AS day
  FROM audit_logs
  WHERE action LIKE 'auth%'
    AND status = 'failed'
    AND created_at > now() - interval '7 days'
  GROUP BY day
  ORDER BY day DESC;
"

# Review rate limit violations
psql "$SUPABASE_DB_URL" -c "
  SELECT count(*), date_trunc('day', created_at) AS day
  FROM audit_logs
  WHERE action = 'rate_limit_violation'
    AND created_at > now() - interval '7 days'
  GROUP BY day
  ORDER BY day DESC;
"
```

Investigate any spike in failed authentication attempts. A small number of failures is normal (users mistyping passwords), but a sudden increase may indicate a credential stuffing attack. If rate limit violations exceed 100 per day, consider tightening the rate limit configuration or adding additional IP blocking rules.

Review the security-specific items:

- [ ] No new critical or high-severity vulnerabilities in `npm audit`
- [ ] No suspicious patterns in the authentication failure logs
- [ ] Rate limit violations are within expected range
- [ ] No unauthorized access attempts to admin endpoints
- [ ] Webhook endpoint signatures are validating correctly
- [ ] No expired or soon-to-expire SSL certificates

### 2.2 Performance Trend Analysis

Analyze performance trends over the past week to identify degradation before it becomes critical. Use the Grafana dashboards to compare this week's metrics against the previous week.

```bash
# Get current performance snapshot
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '.performanceTargets'
```

Key performance trend indicators to track:

| Metric | Weekly Trend | Action if Degrading |
|--------|-------------|---------------------|
| API p95 latency | Should be stable or decreasing | Check for new slow queries, cache issues |
| API p99 latency | Should be < 500ms | Investigate outlier requests |
| Database p95 latency | Should be < 50ms | Review query plans, add indexes |
| Cache hit rate | Should be > 80% | Check cache warming, Redis health |
| Error rate | Should be < 1% | Review Sentry for new errors |
| Queue depth | Should be < 100 at peak | Scale workers, optimize job processing |

If any metric shows a degrading trend over two or more consecutive weeks, create a performance improvement task and prioritize it for the next sprint.

### 2.3 Dependency Updates

Review and apply dependency updates weekly. This includes npm packages, Docker base images, and any system-level libraries.

```bash
# Check for npm security vulnerabilities
npm audit --production

# Check for outdated packages
npm outdated 2>/dev/null | head -30

# Review package-lock.json for unexpected changes
git diff HEAD~7 package-lock.json | head -50
```

Dependency update procedure:

1. Run `npm audit` and address all critical and high-severity vulnerabilities
2. Review the changelog for any major version updates
3. Test updates in the staging environment before deploying to production
4. Update Docker base images if security patches are available
5. Document all dependency changes in the release notes

Never apply dependency updates directly to production without staging validation. The `package-lock.json` file must be committed to version control, and any changes to it must go through the full CI/CD pipeline.

### 2.4 Database Maintenance

PostgreSQL requires regular maintenance to prevent bloat, update statistics, and optimize query plans. The weekly database maintenance window is the time to perform these tasks.

```sql
-- Run VACUUM ANALYZE on high-traffic tables
VACUUM ANALYZE products;
VACUUM ANALYZE orders;
VACUUM ANALYZE payment_sessions;
VACUUM ANALYZE payment_job_queue;
VACUUM ANALYZE background_jobs;
VACUUM ANALYZE profiles;
VACUUM ANALYZE audit_logs;

-- Check for tables that need VACUUM FULL (high bloat)
SELECT table_name, row_count, dead_rows, bloat_percentage
FROM v_table_stats
WHERE bloat_percentage > 20
ORDER BY bloat_percentage DESC;
```

For tables with bloat above 50%, schedule a `VACUUM FULL` during the next maintenance window. Note that `VACUUM FULL` acquires an exclusive lock on the table, so it must only be run during the low-traffic maintenance window.

```sql
-- Review index usage (identify unused indexes)
SELECT table_name, index_name, index_scans, index_size, usage_status
FROM v_index_usage
WHERE usage_status = 'UNUSED'
ORDER BY index_size DESC;
```

Unused indexes waste disk space and slow down writes. Review each unused index before dropping it, as some indexes (unique constraints, foreign key indexes) may be needed for data integrity even if they are rarely scanned by the query planner.

### 2.5 Backup Restore Test

Weekly backup restore tests verify that backups are not only created but also functional. This is critical for disaster recovery confidence.

```bash
# Restore the latest backup to a test database
# This creates a temporary test restore without affecting production
LATEST=$(ls -td /var/backups/vendortrack/2* | head -1)

# Create a test database
psql "$SUPABASE_DB_URL" -c "CREATE DATABASE vendortrack_restore_test;"

# Restore the backup to the test database
pg_restore "${SUPABASE_DB_URL}_vendortrack_restore_test" \
  --no-owner \
  --no-privileges \
  --verbose \
  "$LATEST/database.dump" 2>&1 | tail -20

# Verify key tables have data
psql "${SUPABASE_DB_URL}_vendortrack_restore_test" -c "
  SELECT 'profiles' AS table_name, count(*) FROM profiles
  UNION ALL
  SELECT 'products', count(*) FROM products
  UNION ALL
  SELECT 'orders', count(*) FROM orders;
"

# Clean up the test database
psql "$SUPABASE_DB_URL" -c "DROP DATABASE vendortrack_restore_test;"
```

Document the restore test results including the time to restore, the data integrity checks performed, and any issues encountered. If the restore test fails, the backup is unreliable and must be investigated immediately.

### 2.6 Feature Flag Review

VendorTrack uses a feature flag system stored in the database, environment variables, and code-level defaults. Review the current state of all feature flags weekly to ensure they are set correctly for the current deployment.

```bash
# List all feature flags and their current state
# This requires querying the application or database directly
```

Active feature flags in the VendorTrack system:

| Flag Key | Default | Rollout | Environments | Kill Switch |
|----------|---------|---------|--------------|-------------|
| `stripe_connect` | true | 100% | dev, staging, prod | No |
| `auto_refund_on_failure` | true | 100% | dev, staging, prod | Yes |
| `payment_reconciliation` | true | 100% | prod | No |
| `ai_product_descriptions` | true | 100% | dev, staging, prod | No |
| `ai_chat_assistant` | false | 10% | dev, staging | No |
| `full_text_search` | true | 100% | dev, staging, prod | No |
| `search_suggestions` | true | 50% | dev, staging, prod | No |
| `new_dashboard` | false | 20% | dev, staging | No |
| `dark_mode` | false | N/A | dev | No |
| `redis_caching` | true | 100% | prod | No |
| `opentelemetry_tracing` | false | 10% | staging, prod | No |
| `sentry_error_tracking` | true | 100% | staging, prod | No |
| `v2_checkout_flow` | false | 5% | staging | No |

Review criteria for each flag:

- [ ] Flags at 100% rollout for more than 2 weeks should be removed (hardcoded)
- [ ] Flags at 0% rollout for more than 2 weeks should be cleaned up
- [ ] Kill switch flags should be tested to ensure they work
- [ ] Canary flags should be reviewed for graduation or rollback decisions
- [ ] Environment-specific flags should be consistent across environments

---

## 3. Monthly Maintenance

Monthly maintenance tasks are performed on the first Saturday of each month. These tasks address long-term operational concerns including key rotation, capacity planning, cost optimization, security audits, documentation, incident review, and load testing. Each task should take between 30 minutes and 2 hours, and the full monthly maintenance window should be scheduled as a 4-hour block.

### 3.1 Key Rotation Check

All API keys and secrets follow a 90-day rotation schedule. The key rotation script (`scripts/rotate-keys.sh`) automates the rotation procedure for Stripe, Supabase, Gemini, and Redis credentials. The dual-credential pattern is used: create the new key, deploy with the new key, verify functionality, then revoke the old key.

```bash
# Run the key rotation procedure
./scripts/rotate-keys.sh stripe    # Rotate Stripe API keys
./scripts/rotate-keys.sh supabase  # Rotate Supabase service role key
./scripts/rotate-keys.sh gemini    # Rotate Gemini API key
./scripts/rotate-keys.sh redis     # Rotate Redis password
```

Key rotation schedule:

| Key | Rotation Frequency | Owner | Last Rotated |
|-----|--------------------|-------|-------------|
| `STRIPE_SECRET_KEY` | 90 days | Operations | Record date |
| `STRIPE_WEBHOOK_SECRET` | On webhook change | Operations | Record date |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | 90 days | Operations | Record date |
| `SUPABASE_SERVICE_ROLE_KEY` | 90 days | Operations | Record date |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 90 days | Operations | Record date |
| `GEMINI_API_KEY` | 90 days | Operations | Record date |
| `REDIS_URL` (password) | 90 days | Operations | Record date |
| `CRON_SECRET` | 90 days | Operations | Record date |
| `SENTRY_DSN` | On change | Operations | Record date |

Rotation procedure for each key:

1. Generate a new key in the provider dashboard
2. Update the environment variable in Vercel (or Docker `.env`)
3. Deploy the application with the new key
4. Verify the system is functioning correctly via health endpoints
5. Monitor for 1 hour using `/api/health` and `/api/payment-health`
6. Revoke the old key in the provider dashboard
7. Document the rotation in the operations log

Never revoke the old key before verifying that the new key is working. If the rotation fails, the old key must remain active until the issue is resolved.

### 3.2 Capacity Planning Review

Review current resource utilization against projected load growth. This ensures that the system can handle expected traffic increases without performance degradation.

```bash
# Get current resource utilization
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq '{
    api: .snapshot.api,
    database: .snapshot.database,
    cache: .snapshot.cache,
    memory: .snapshot.memory
  }'
```

Capacity planning checklist:

| Resource | Current Utilization | Projected (30 days) | Projected (90 days) | Action Threshold |
|----------|--------------------|--------------------|--------------------|-----------------|
| Vercel function invocations | Check dashboard | +20% growth | +50% growth | 80% of plan limit |
| Supabase database size | Check dashboard | +15% growth | +40% growth | 80% of plan limit |
| Supabase connection pool | Check dashboard | Stable | +10% growth | 60% of max connections |
| Redis memory usage | Check dashboard | +10% growth | +30% growth | 80% of max memory |
| Stripe API calls | Check dashboard | +20% growth | +50% growth | 80% of rate limit |
| Background job throughput | Check queue depth | +15% growth | +40% growth | Queue backlog > 1000 |

If any resource is projected to exceed the action threshold within the next 30 days, create a scaling plan and submit it for approval.

### 3.3 Cost Optimization Review

Review the monthly costs for all VendorTrack infrastructure components and identify optimization opportunities.

| Service | Cost Driver | Optimization Strategy |
|---------|------------|----------------------|
| Vercel | Function invocations, bandwidth | Edge caching, static generation, ISR |
| Supabase | Database size, bandwidth, compute | Archival of old data, query optimization |
| Redis (Upstash) | Commands, memory, bandwidth | TTL tuning, cache key pruning |
| Stripe | Transaction volume | Cannot optimize (percentage-based) |
| Sentry | Events, attachments | Error filtering, sampling rate |
| Google Gemini | API calls | Cache AI responses, reduce prompt size |

```bash
# Review Vercel usage
vercel inspect --scope vendortrack

# Review Supabase usage
# Available in Supabase Dashboard > Settings > Billing

# Review Upstash Redis usage
# Available in Upstash Dashboard > Usage
```

Common cost optimization actions:

- Reduce cache TTL for rarely-accessed data to free Redis memory
- Increase cache TTL for stable data (categories, seller profiles) to reduce API calls
- Archive completed orders older than 6 months to reduce database size
- Implement log sampling for high-frequency, low-value errors in Sentry
- Use Vercel Edge functions for static content delivery instead of Serverless functions

### 3.4 Security Audit

Perform a monthly security audit based on the OWASP Top 10 checklist, adapted for the VendorTrack architecture.

Security audit checklist:

- [ ] **Injection** -- Verify all database queries use parameterized queries via Supabase client
- [ ] **Broken Authentication** -- Review Supabase Auth configuration, session timeouts, MFA enforcement
- [ ] **Sensitive Data Exposure** -- Verify no secrets in client-side code, no PII in logs
- [ ] **XML External Entities** -- Not applicable (no XML processing)
- [ ] **Broken Access Control** -- Verify RLS policies in Supabase, test RBAC permissions
- [ ] **Security Misconfiguration** -- Review security headers, CORS settings, rate limits
- [ ] **Cross-Site Scripting** -- Verify React output encoding, review dangerouslySetInnerHTML usage
- [ ] **Insecure Deserialization** -- Not applicable (no custom deserialization)
- [ ] **Using Components with Known Vulnerabilities** -- Review `npm audit` results
- [ ] **Insufficient Logging** -- Verify all security events are logged to audit_logs table

Additional VendorTrack-specific security checks:

- [ ] Stripe webhook signature validation is active
- [ ] CSRF protection is enabled on all mutation endpoints
- [ ] Rate limiting is active on authentication and payment endpoints
- [ ] File upload restrictions are enforced (type, size)
- [ ] AI prompt injection protections are in place
- [ ] No service role keys are exposed to the client

### 3.5 Documentation Review and Update

Review and update all operational documentation to ensure accuracy. This includes the operations manual, runbook, deployment guide, and any architecture diagrams.

Documentation review checklist:

- [ ] OPERATIONS_MANUAL.md reflects current procedures
- [ ] RUNBOOK.md reflects current incident response procedures
- [ ] DEPLOYMENT.md reflects current deployment process
- [ ] ARCHITECTURE.md reflects current system architecture
- [ ] API_REFERENCE.md reflects current API endpoints
- [ ] SECURITY.md reflects current security measures
- [ ] All environment variable documentation is current
- [ ] All contact information and escalation paths are current
- [ ] All diagrams and flowcharts are up to date

### 3.6 Incident Review

Review all incidents from the past month and verify that postmortem action items have been completed.

```bash
# Review incident log (maintain in operations documentation)
# For each incident, verify:
#   - Root cause was identified
#   - Fix was implemented and deployed
#   - Postmortem was written and shared
#   - Action items were created and tracked
#   - Monitoring/alerting was improved to prevent recurrence
```

Incident review template:

| Field | Description |
|-------|-------------|
| Incident ID | Unique identifier |
| Date/Time | When the incident occurred |
| Severity | SEV1, SEV2, or SEV3 |
| Duration | Time from detection to resolution |
| Root Cause | Technical root cause |
| Impact | User-facing impact description |
| Resolution | How the incident was resolved |
| Action Items | Preventive measures (with owner and due date) |
| Status | Open, In Progress, or Complete |

### 3.7 Load Test Execution

Execute the load testing suite monthly to validate that the system meets performance targets under expected load. The load test script (`scripts/load-test.ts`) supports multiple scales and scenarios.

```bash
# Run load test at 100-user scale
npx tsx scripts/load-test.ts --scale=100

# Run load test at 1000-user scale
npx tsx scripts/load-test.ts --scale=1000

# Run specific scenario
npx tsx scripts/load-test.ts --scale=1000 --scenario=checkout

# Run all scenarios at all scales
npx tsx scripts/load-test.ts --all
```

Load test scenarios:

| Scenario | Description | Concurrency |
|----------|-------------|-------------|
| `browsing` | Product listing, detail, seller profile | 50 |
| `search` | Product search, category filtering, suggestions | 50 |
| `dashboard` | Analytics RPCs, marketplace stats, seller revenue | 20 |
| `health` | Database health check, monitoring queries | 1 |
| `checkout` | Cart operations, checkout flow | 10 |

Performance targets:

| Metric | Target | Critical Threshold |
|--------|--------|--------------------|
| API p95 latency | < 250ms | > 500ms |
| API p99 latency | < 500ms | > 1000ms |
| Database p95 latency | < 50ms | > 100ms |
| Cache hit rate | > 80% | < 50% |
| Error rate | < 1% | > 5% |
| Throughput | > 100 rps | < 50 rps |

If any load test fails to meet the target thresholds, create a performance improvement task and schedule it for the next sprint. Document the load test results in the monthly operations report.

---

## 4. Monitoring

### 4.1 Health Endpoints

VendorTrack exposes three health endpoints, each serving a different purpose and audience. Understanding the distinction between these endpoints is critical for effective monitoring and incident response.

#### `/api/health` -- Public Health Endpoint

This is a lightweight, unauthenticated endpoint used by load balancers, Docker health checks, and uptime monitors. It verifies that the application is responding, the database connection is functional, and the Redis cache is reachable. The Docker health check uses this endpoint with a 30-second interval, 10-second timeout, and 3 retries.

```bash
curl -sf https://app.vendortrack.com/api/health | jq .
```

Response structure:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T08:00:00.000Z",
  "database": {
    "status": "ok",
    "latencyMs": 12
  },
  "cache": {
    "status": "ok"
  }
}
```

Possible `status` values: `ok`, `degraded`, `error`.

#### `/api/payment-health` -- Admin Payment Health Endpoint

This admin-only endpoint provides detailed payment system metrics including payment success rates, refund rates, queue depth, circuit breaker status, and GMV. It uses a single optimized RPC call (`get_payment_health`) that replaces 9+ separate queries, reducing database round-trips by approximately 90%.

```bash
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/payment-health | jq .
```

Response structure:

```json
{
  "timestamp": "2025-01-15T08:00:00.000Z",
  "healthy": true,
  "metrics": {
    "successfulPayments": 150,
    "failedSessions": 2,
    "refundRate": 0.015,
    "pendingRefunds": 3,
    "criticalEvents": 0,
    "gmv24h": 1500000,
    "commission24h": 150000,
    "ledgerEntries24h": 300,
    "totalOrders7d": 1050,
    "refundedOrders7d": 15
  },
  "queue": {
    "pending": 5,
    "processing": 2,
    "dead": 0
  },
  "circuitBreakers": {
    "stripe": "closed"
  }
}
```

#### `/api/performance` -- Admin Performance Endpoint

This admin-only endpoint provides the full performance snapshot including API latency histograms, database latency, cache stats, slow queries, recent errors, and Prometheus-formatted metrics. It supports both JSON and Prometheus output formats.

```bash
# JSON format (default)
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq .

# Prometheus format
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://app.vendortrack.com/api/performance?format=prometheus"
```

### 4.2 Prometheus Metrics

VendorTrack exposes Prometheus metrics through the `/api/performance?format=prometheus` endpoint. Prometheus scrapes this endpoint every 30 seconds using the configuration defined in `monitoring/prometheus.yml`. All metrics are prefixed with `vt_` to avoid collision with other services.

| Metric Name | Type | Description |
|-------------|------|-------------|
| `vt_api_request_count` | counter | Total API requests processed |
| `vt_api_error_rate` | gauge | Current API error rate (0-1) |
| `vt_api_latency_avg_ms` | gauge | Average API latency in milliseconds |
| `vt_api_latency_p95_ms` | gauge | P95 API latency in milliseconds |
| `vt_api_latency_p99_ms` | gauge | P99 API latency in milliseconds |
| `vt_db_query_count` | counter | Total database queries executed |
| `vt_db_latency_avg_ms` | gauge | Average database latency in milliseconds |
| `vt_db_latency_p95_ms` | gauge | P95 database latency in milliseconds |
| `vt_db_slow_query_count` | counter | Number of slow queries detected |
| `vt_cache_hit_rate` | gauge | Cache hit rate (0-1) |
| `vt_cache_key_count` | gauge | Number of cached keys |
| `vt_queue_pending` | gauge | Pending background jobs |
| `vt_queue_dead` | counter | Dead letter queue count |
| `vt_memory_heap_used_mb` | gauge | Node.js heap used in MB |
| `vt_memory_rss_mb` | gauge | Node.js RSS memory in MB |

The performance monitor uses a circular buffer with a capacity of 5000 entries for API and database latencies, ensuring that metrics are computed from a bounded window of recent data. This prevents unbounded memory growth and ensures that the monitoring system itself has minimal performance impact (less than 1% CPU overhead).

### 4.3 Alert Rules

VendorTrack defines 10 alert rules across 4 groups in `monitoring/alerts.yml`. These rules are evaluated by Prometheus every 15 seconds.

#### Application Alerts (Group: `vendortrack_app`)

| Alert Name | Condition | For | Severity | Description |
|------------|-----------|-----|----------|-------------|
| `VendorTrackAppDown` | `up{job="vendortrack"} == 0` | 2m | critical | Application unreachable for 2 minutes |
| `VendorTrackHighErrorRate` | `vt_api_error_rate > 0.05` | 5m | warning | API error rate exceeds 5% |
| `VendorTrackHighLatency` | `vt_api_latency_p95_ms > 500` | 5m | warning | P95 latency exceeds 500ms |
| `VendorTrackCriticalLatency` | `vt_api_latency_p95_ms > 1000` | 2m | critical | P95 latency exceeds 1 second |
| `VendorTrackHighMemoryUsage` | `vt_memory_heap_used_mb / vt_memory_rss_mb > 0.9` | 5m | warning | Memory usage above 90% |

#### Database Alerts (Group: `vendortrack_database`)

| Alert Name | Condition | For | Severity | Description |
|------------|-----------|-----|----------|-------------|
| `VendorTrackHighDBLatency` | `vt_db_latency_p95_ms > 100` | 5m | warning | Database P95 latency exceeds 100ms |
| `VendorTrackSlowQueries` | `vt_db_slow_query_count > 10` | 10m | warning | More than 10 slow queries detected |

#### Cache Alerts (Group: `vendortrack_cache`)

| Alert Name | Condition | For | Severity | Description |
|------------|-----------|-----|----------|-------------|
| `VendorTrackLowCacheHitRate` | `vt_cache_hit_rate < 0.5` | 10m | warning | Cache hit rate below 50% |

#### Queue Alerts (Group: `vendortrack_queue`)

| Alert Name | Condition | For | Severity | Description |
|------------|-----------|-----|----------|-------------|
| `VendorTrackQueueBacklog` | `vt_queue_pending > 1000` | 10m | warning | Queue backlog exceeds 1000 jobs |
| `VendorTrackDeadLetterQueueGrowing` | `increase(vt_queue_dead[1h]) > 10` | 5m | critical | Dead letter queue growing rapidly |

### 4.4 Grafana Dashboards

The Grafana deployment is managed through `docker-compose.monitoring.yml` and scrapes metrics from the VendorTrack application, Redis exporter, and Node exporter. The recommended dashboard layout includes:

- **Overview Panel** -- System status, uptime, request rate, error rate
- **API Latency Panel** -- P50, P95, P99 latency trends over time
- **Database Panel** -- Query latency, connection pool, slow query count
- **Cache Panel** -- Hit rate, key count, memory usage
- **Queue Panel** -- Pending, processing, dead letter queue trends
- **Memory Panel** -- Heap usage, RSS, external memory over time

### 4.5 Sentry Error Tracking

Sentry is enabled in staging and production environments (controlled by the `sentry_error_tracking` feature flag). The Sentry DSN is configured via the `SENTRY_DSN` environment variable, and the environment is set via `SENTRY_ENVIRONMENT`. All unhandled errors and payment-related errors are reported to Sentry with full stack traces and context.

Key Sentry configuration:

- **Environment** -- Set via `SENTRY_ENVIRONMENT` (staging or production)
- **Traces sample rate** -- Controlled by OpenTelemetry tracing feature flag
- **Release tracking** -- Tag each deployment with the git commit hash
- **Alert rules** -- Notify on-call for any error with frequency > 10/hour

### 4.6 Structured Logging

In production, all application logs are emitted as structured JSON for machine parsing. The log level is controlled by the `LOG_LEVEL` environment variable (default: `info`) and the client-side log level is controlled by `NEXT_PUBLIC_LOG_LEVEL` (default: `warn`).

Log format in production:

```json
{
  "timestamp": "2025-01-15T08:00:00.000Z",
  "level": "info",
  "service": "vendortrack",
  "traceId": "abc123",
  "action": "payment_completed",
  "message": "Payment session completed",
  "context": {
    "sessionId": "sess_xyz",
    "amount": 5000,
    "currency": "usd"
  }
}
```

---

## 5. Scaling

### 5.1 Horizontal Scaling

VendorTrack is deployed on Vercel with a Docker-based self-hosted fallback. Vercel provides automatic horizontal scaling based on incoming request volume, with no configuration required. Each serverless function invocation runs in an isolated context, and Vercel automatically scales the number of concurrent instances to match demand.

For self-hosted deployments using Docker, horizontal scaling is achieved by increasing the number of application container replicas:

```yaml
# docker-compose.yml -- Scale application replicas
services:
  app:
    deploy:
      replicas: 3  # Increase from 1 to 3
```

When scaling application replicas, ensure that:

- The load balancer is configured to distribute traffic across all replicas
- Each replica has its own health check endpoint configured
- The Redis connection pool is sized appropriately for the number of replicas
- The Supabase connection pool can handle the combined connection count from all replicas

### 5.2 Database Scaling

Supabase manages the PostgreSQL database, including connection pooling through PgBouncer. The connection pool configuration is critical for performance under load.

Current connection pool configuration:

| Parameter | Value | Notes |
|-----------|-------|-------|
| Max connections | 100 | Supabase default (varies by plan) |
| Pool mode | Transaction | Best for serverless functions |
| Reserve pool size | 10 | For admin operations |
| Connection timeout | 30s | Maximum wait for a connection |

Scaling strategies for the database:

1. **Connection pooling** -- Ensure PgBouncer is configured in transaction mode for serverless functions. Each Vercel function invocation creates a short-lived connection, and transaction mode ensures connections are returned to the pool immediately after the transaction completes.

2. **Read replicas** -- For read-heavy workloads, configure Supabase read replicas to offload analytics and reporting queries from the primary database. The `getDatabaseHealth()` function and analytics RPCs are candidates for read replica routing.

3. **Supabase plan upgrade** -- If the current plan is hitting connection or compute limits, upgrade to a higher plan with more resources. The Supabase Pro plan provides 8GB database size and 100 concurrent connections, while the Team plan provides 16GB and more connections.

4. **Query optimization** -- Before scaling hardware, optimize slow queries using the index review and query plan analysis from the weekly maintenance tasks. The `v_table_stats` and `v_index_usage` views provide the data needed for optimization decisions.

### 5.3 Redis Scaling

VendorTrack uses Redis for caching with three modes: Redis (production), Upstash REST (serverless/Vercel), and in-memory LRU (development/fallback). The cache layer uses the `vt:` key prefix and enforces TTLs at the cache level.

For Upstash Redis, scaling is managed through the Upstash plan:

| Upstash Plan | Max Memory | Max Commands/day | Max Bandwidth |
|--------------|-----------|-----------------|---------------|
| Free | 256 MB | 10,000 | 1 GB/day |
| Pay-as-you-go | Configurable | Unlimited | Unlimited |
| Enterprise | Custom | Custom | Custom |

Redis configuration in the Docker deployment:

```yaml
# docker-compose.yml
redis:
  image: redis:7-alpine
  command: >
    redis-server
    --maxmemory 256mb
    --maxmemory-policy allkeys-lru
    --save 60 1000
    --save 300 100
    --appendonly yes
    --appendfsync everysec
```

Scaling strategies:

- **Increase maxmemory** -- If the cache hit rate is below target due to eviction, increase the `maxmemory` setting
- **Cluster mode** -- For high-availability, configure Redis Cluster with multiple nodes
- **Upstash tier upgrade** -- If hitting command or bandwidth limits, upgrade the Upstash plan
- **TTL tuning** -- Reduce TTL for rarely-accessed data to free memory for hot data

### 5.4 CDN Optimization

Vercel provides a global CDN with Edge Network caching. Static assets are automatically cached at the edge, and Server-Side Generated (SSG) pages benefit from `stale-while-revalidate` caching.

CDN optimization strategies:

- **Static Generation** -- Use `generateStaticParams` for product listing pages that change infrequently
- **ISR (Incremental Static Regeneration)** -- Use `revalidate` for pages that need periodic updates without full rebuilds
- **Edge caching** -- Use `Cache-Control` headers with `s-maxage` for API responses that can be cached at the CDN layer
- **Asset optimization** -- Ensure all images use Next.js `<Image>` component for automatic WebP conversion and lazy loading
- **Vercel Edge Functions** -- Use Edge Functions for geo-routing and A/B testing at the CDN layer

```typescript
// Example: Cache headers for product listing API
import { getCacheHeaders } from '@/lib/cache/redis-client';

export async function GET() {
  const products = await getProducts();
  return NextResponse.json(products, {
    headers: getCacheHeaders(300, 150), // 5min cache, 2.5min stale-while-revalidate
  });
}
```

### 5.5 Worker Scaling

The background worker processes jobs from both the `payment_job_queue` and `background_jobs` tables. The worker configuration is defined in `docker-compose.yml` using the `Dockerfile.worker` image.

Worker configuration parameters:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `pollIntervalMs` | 1000 | How often the worker polls for new jobs |
| `maxConcurrentJobs` | 1 | Maximum concurrent job processing (per worker) |
| `maxDurationMs` | 60000 | Maximum worker run duration before restart |
| `maxJobs` | 100 | Maximum jobs to process before restart |

Scaling strategies:

```yaml
# Scale workers by increasing replicas
services:
  worker:
    deploy:
      replicas: 3  # Process 3x more jobs concurrently
```

When scaling workers, ensure that:

- The database connection pool can handle the additional connections from each worker
- The job claiming mechanism (CAS / SELECT FOR UPDATE SKIP LOCKED) prevents duplicate processing
- The `maxConcurrentJobs` setting is appropriate for the available resources
- The `pollIntervalMs` is not too aggressive (causing unnecessary database load) or too conservative (causing delayed processing)

---

## 6. Backups

### 6.1 Backup Strategy

VendorTrack uses a multi-layer backup strategy that covers the database, Redis cache, and application configuration. The backup script (`scripts/backup.sh`) runs daily at 03:00 UTC via cron and supports three modes: `--full`, `--db-only`, and `--redis-only`.

| Component | Backup Method | Frequency | Retention |
|-----------|--------------|-----------|-----------|
| Database (Supabase) | `pg_dump` with custom format, compression level 9 | Daily | 30 days |
| Redis | `BGSAVE` + RDB file copy | Daily | 30 days |
| Environment config | Variable name manifest (values redacted) | Daily | 30 days |
| Supabase automated | Supabase managed daily backup | Daily | 7 days (Pro plan) |

The backup script creates a timestamped directory under `BACKUP_DIR` (default: `/var/backups/vendortrack/`) containing:

- `database.dump` -- Compressed PostgreSQL custom-format dump
- `redis-dump.rdb` -- Redis RDB snapshot (local Redis only)
- `env-manifest.txt` -- Environment variable names (values redacted)
- `backup.log` -- Full log of the backup process
- `manifest.json` -- Machine-readable backup metadata

```bash
# Run full backup
./scripts/backup.sh --full

# Run database-only backup
./scripts/backup.sh --db-only

# Run Redis-only backup
./scripts/backup.sh --redis-only

# Custom backup directory
BACKUP_DIR=/mnt/backups ./scripts/backup.sh --full
```

### 6.2 Backup Verification

Backups must be verified daily (as part of the daily operations) and tested weekly (as part of the weekly maintenance). Verification confirms that the backup files exist and have reasonable sizes. Testing confirms that the backup can be restored to a functional database.

```bash
# Quick verification: check latest backup
LATEST=$(ls -td /var/backups/vendortrack/2* | head -1)
cat "$LATEST/manifest.json" | jq .

# Verify database dump size (should be > 1MB for a production database)
DB_SIZE=$(stat --format="%s" "$LATEST/database.dump" 2>/dev/null || stat -f "%z" "$LATEST/database.dump")
if [ "$DB_SIZE" -lt 1048576 ]; then
  echo "WARNING: Database backup is suspiciously small ($DB_SIZE bytes)"
fi
```

### 6.3 Restore Procedures

The restore script (`scripts/restore.sh`) restores the database from a backup with safety checks. It always creates a safety backup of the current database before restoring, and requires explicit confirmation before proceeding.

```bash
# Restore from a specific backup
./scripts/restore.sh 20260731_030000

# The script will:
# 1. Verify the backup exists
# 2. Verify the database dump exists
# 3. Verify the Supabase connection
# 4. Ask for confirmation (type 'CONFIRM')
# 5. Create a safety backup of the current database
# 6. Restore the database using pg_restore
# 7. Restore Redis (if local)
# 8. Verify the restore
```

Restore procedure steps in detail:

1. **Pre-flight checks** -- Verify the backup exists, the database dump is present, and the Supabase connection string is configured
2. **Safety backup** -- Create a backup of the current database before overwriting it (stored as `pre_restore_<timestamp>`)
3. **Database restore** -- Run `pg_restore` with `--clean --if-exists` to drop existing objects and restore from the backup
4. **Redis restore** -- For local Redis, stop the server, replace the RDB file, and restart. For remote Redis (Upstash), use the provider's restore functionality
5. **Verification** -- Test database connectivity and basic data integrity

### 6.4 RPO/RTO Targets

| Metric | Target | Current Capability |
|--------|--------|--------------------|
| **RPO (Recovery Point Objective)** | 24 hours | Daily backup at 03:00 UTC |
| **RTO (Recovery Time Objective)** | 2 hours | Restore script + verification |
| **RTO (Application)** | 30 minutes | Redeploy from Vercel or Docker |
| **RTO (Cache)** | 5 minutes | Cache warming cron re-populates |

The current RPO of 24 hours means that in the worst case, up to 24 hours of data could be lost. If this is unacceptable for your business requirements, consider implementing continuous WAL archiving or point-in-time recovery through Supabase's paid plans.

---

## 7. Recovery

### 7.1 Database Recovery

Database recovery is the most critical recovery procedure, as it involves restoring the primary data store. This procedure should only be performed by experienced operations engineers, and the incident commander must be notified before any database recovery begins.

#### Partial Recovery (Single Table)

If only a single table is corrupted or needs to be rolled back, use a targeted restore approach:

```bash
# 1. Create a safety backup
./scripts/backup.sh --db-only

# 2. Restore only the affected table from the backup
LATEST=$(ls -td /var/backups/vendortrack/2* | head -1)
pg_restore "$SUPABASE_DB_URL" \
  --data-only \
  --table=products \
  --no-owner \
  --no-privileges \
  "$LATEST/database.dump"

# 3. Verify the restored data
psql "$SUPABASE_DB_URL" -c "SELECT count(*) FROM products;"
```

#### Full Database Recovery

If the entire database needs to be restored, use the restore script:

```bash
# 1. Notify the incident commander
# 2. Create a safety backup of the current state
# 3. Run the restore script
./scripts/restore.sh <backup-timestamp>

# 4. Verify the application health
curl -sf https://app.vendortrack.com/api/health | jq .

# 5. Verify payment health
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/payment-health | jq .

# 6. Monitor for 1 hour before declaring the incident resolved
```

### 7.2 Cache Recovery

Cache recovery is less critical than database recovery because the cache is a derived data store. All cached data can be re-computed from the database. However, a cold cache will result in higher latency for the first requests after recovery.

#### Redis Restart Recovery

If Redis is restarted or crashes, the AOF (Append-Only File) persistence will automatically restore the data on startup:

```bash
# Check Redis persistence status
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO Persistence

# Verify the last BGSAVE was successful
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO Persistence | grep "rdb_last_bgsave_status"
```

#### Cache Warming

After a cache recovery, trigger the cache warming cron to pre-populate frequently accessed data:

```bash
# Trigger cache warming manually
curl -sf -H "Authorization: Bearer $CRON_SECRET" \
  https://app.vendortrack.com/api/cron/cache-warming | jq .
```

The cache warming cron populates featured products, categories, and seller profiles. This reduces the latency impact of a cold cache by pre-loading the most frequently accessed data.

#### Full Cache Clear

If the cache contains stale or corrupted data, clear it entirely and allow it to re-populate:

```bash
# Clear all cache entries (via Redis CLI)
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHDB

# Trigger cache warming
curl -sf -H "Authorization: Bearer $CRON_SECRET" \
  https://app.vendortrack.com/api/cron/cache-warming | jq .
```

### 7.3 Application Recovery

Application recovery involves redeploying the application or rolling back to a known-good version.

#### Redeploy on Vercel

```bash
# Redeploy the current production deployment
vercel --prod

# Or redeploy a specific commit
vercel --prod --build-id <commit-hash>
```

#### Rollback on Vercel

```bash
# List recent deployments
vercel ls --prod

# Promote a previous deployment to production
vercel --prod <deployment-url>
```

#### Redeploy on Docker

```bash
# Pull the latest image and restart
docker compose pull app
docker compose up -d app

# Check container health
docker inspect --format='{{.State.Health.Status}}' vendortrack-app
```

#### Rollback on Docker

```bash
# Rollback to a specific image version
docker compose down app
# Edit docker-compose.yml to use the previous image tag
docker compose up -d app
```

### 7.4 Full Disaster Recovery Procedure

In the event of a complete system failure (database, cache, and application all down), follow this procedure in order:

**Step 1: Assess the situation (5 minutes)**

- Determine the scope of the failure (single component or full system)
- Check the status pages for Vercel, Supabase, Upstash, and Stripe
- Notify the incident commander and declare an incident

**Step 2: Restore the database (30-60 minutes)**

```bash
# Find the most recent valid backup
ls -td /var/backups/vendortrack/2* | head -5

# Verify the backup manifest
cat /var/backups/vendortrack/<timestamp>/manifest.json | jq .

# Run the restore
./scripts/restore.sh <timestamp>
```

**Step 3: Restore the cache (5-10 minutes)**

```bash
# Start Redis (if using Docker)
docker compose up -d redis

# Wait for Redis to be healthy
docker inspect --format='{{.State.Health.Status}}' vendortrack-redis

# Trigger cache warming
curl -sf -H "Authorization: Bearer $CRON_SECRET" \
  https://app.vendortrack.com/api/cron/cache-warming
```

**Step 4: Restore the application (10-15 minutes)**

```bash
# Redeploy the application
vercel --prod
# OR
docker compose up -d app worker

# Verify the application health
curl -sf https://app.vendortrack.com/api/health | jq .
```

**Step 5: Verify all systems (10-15 minutes)**

```bash
# Verify application health
curl -sf https://app.vendortrack.com/api/health | jq .

# Verify payment health
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/payment-health | jq .

# Verify performance
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://app.vendortrack.com/api/performance | jq .

# Verify database health
# Check key table counts
psql "$SUPABASE_DB_URL" -c "
  SELECT 'profiles' AS t, count(*) FROM profiles
  UNION ALL SELECT 'products', count(*) FROM products
  UNION ALL SELECT 'orders', count(*) FROM orders;
"
```

**Step 6: Monitor and declare resolution (60 minutes)**

- Monitor all health endpoints for 1 hour
- Verify that payment processing is working (test a small transaction)
- Check that background jobs are being processed
- Verify that the error rate is below 1%
- Declare the incident resolved and write the postmortem

---

## 8. Operational Checklists

### 8.1 Daily Checklist

Complete by 10:00 UTC every day.

- [ ] Check `/api/health` endpoint returns `ok`
- [ ] Check `/api/payment-health` for payment system metrics
- [ ] Review Grafana dashboard for anomalies
- [ ] Review Sentry for new and recurring errors
- [ ] Review error rate from `/api/performance`
- [ ] Review background job queue depth (pending, processing, dead)
- [ ] Review payment job queue depth
- [ ] Check database health (slow queries, connection pool, cache hit rate)
- [ ] Check Redis cache hit rate (target > 80%)
- [ ] Verify daily backup completed successfully
- [ ] Review backup manifest and file sizes
- [ ] Check Docker container health (self-hosted deployments)
- [ ] Review Stripe Dashboard for failed payments
- [ ] Verify cron health check is running (`/api/cron/health-check`)
- [ ] Log daily operations status in the operations channel

### 8.2 Weekly Checklist

Complete every Monday between 06:00 and 08:00 UTC.

- [ ] Review audit logs for suspicious activity
- [ ] Review failed authentication attempts
- [ ] Review rate limit violations
- [ ] Analyze API latency trends (p95, p99) over the past week
- [ ] Analyze database latency trends over the past week
- [ ] Run `npm audit` and address critical/high vulnerabilities
- [ ] Review and apply dependency updates (after staging validation)
- [ ] Run `VACUUM ANALYZE` on high-traffic tables
- [ ] Review table bloat from `v_table_stats` view
- [ ] Review unused indexes from `v_index_usage` view
- [ ] Test backup restore to a temporary database
- [ ] Document restore test results
- [ ] Review all feature flags and their rollout states
- [ ] Remove flags at 100% rollout for more than 2 weeks
- [ ] Clean up flags at 0% rollout for more than 2 weeks
- [ ] Test kill switch flags
- [ ] Log weekly maintenance status in the operations channel

### 8.3 Monthly Checklist

Complete on the first Saturday of each month.

- [ ] Check key rotation schedule for keys approaching 90-day age
- [ ] Rotate Stripe API keys if due
- [ ] Rotate Supabase service role key if due
- [ ] Rotate Gemini API key if due
- [ ] Rotate Redis password if due
- [ ] Verify all rotated keys are functioning
- [ ] Review resource utilization vs projected load
- [ ] Create scaling plan if any resource is approaching threshold
- [ ] Review Vercel costs and optimization opportunities
- [ ] Review Supabase costs and optimization opportunities
- [ ] Review Upstash Redis costs and optimization opportunities
- [ ] Review Sentry costs and optimization opportunities
- [ ] Perform OWASP Top 10 security audit
- [ ] Review CSRF protection, rate limiting, and security headers
- [ ] Verify Stripe webhook signature validation
- [ ] Review and update all operational documentation
- [ ] Review all incidents from the past month
- [ ] Verify postmortem action items are completed
- [ ] Execute load test at 100-user scale
- [ ] Execute load test at 1000-user scale
- [ ] Document load test results
- [ ] Log monthly maintenance status in the operations channel

### 8.4 Pre-Deployment Checklist

Complete before every production deployment.

- [ ] All CI/CD pipeline checks pass (build, lint, test, security scan)
- [ ] No open Sentry issues with frequency above 10 occurrences per hour
- [ ] All database migrations tested on staging Supabase project
- [ ] Stripe webhook endpoint configured for the target environment
- [ ] Feature flags are set to the desired state for the new deployment
- [ ] Environment variables updated in Vercel dashboard (or Docker `.env`)
- [ ] `package-lock.json` has not changed since last successful build (unless intentional)
- [ ] Breaking API changes are documented and communicated
- [ ] Deployment is scheduled during low-traffic window (06:00-08:00 UTC)
- [ ] On-call engineer is available and acknowledged
- [ ] Rollback plan is documented and tested
- [ ] Monitoring and alerting are active and verified

### 8.5 Post-Deployment Checklist

Complete within 30 minutes after every production deployment.

- [ ] Verify `/api/health` returns `ok`
- [ ] Verify `/api/payment-health` metrics are normal
- [ ] Verify `/api/performance` metrics are within targets
- [ ] Check Sentry for new errors introduced by the deployment
- [ ] Verify key user flows (login, browse, search, add to cart, checkout)
- [ ] Verify background job processing is working
- [ ] Verify Stripe webhook processing is working
- [ ] Verify AI features (product description generation) if applicable
- [ ] Check database migration was applied successfully
- [ ] Monitor error rate for 15 minutes (must remain below 1%)
- [ ] Monitor latency for 15 minutes (p95 must remain below 500ms)
- [ ] Document deployment in the operations log with version, time, and changes
- [ ] If any issues detected, initiate rollback immediately

---

## Appendix A: Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-only) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | Stripe publishable key (client-safe) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (server-only) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `GEMINI_API_KEY` | No | Google Gemini AI API key |
| `REDIS_URL` | No | Redis connection URL (default: `redis://redis:6379`) |
| `SENTRY_DSN` | No | Sentry project DSN |
| `SENTRY_ENVIRONMENT` | No | Sentry environment label |
| `CRON_SECRET` | No | Secret for cron endpoint authentication |
| `LOG_LEVEL` | No | Server-side log level (default: `info`) |
| `NEXT_PUBLIC_LOG_LEVEL` | No | Client-side log level (default: `warn`) |
| `APP_PORT` | No | Application port (default: `9002`) |
| `FEATURE_*` | No | Feature flag overrides |

## Appendix B: Key Contacts and Escalation

| Role | Responsibility | Escalation |
|------|---------------|------------|
| On-call Engineer | First responder for all alerts | 15-minute response SLA |
| Incident Commander | Coordinates SEV1/SEV2 incidents | Notified immediately for SEV1 |
| Platform Lead | Architecture and scaling decisions | Consulted for major changes |
| Security Lead | Security incidents and audits | Notified for all security alerts |
| Database Admin | Database operations and optimization | Consulted for complex DB issues |

## Appendix C: Useful Commands Quick Reference

```bash
# Health checks
curl -sf https://app.vendortrack.com/api/health | jq .
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" https://app.vendortrack.com/api/payment-health | jq .
curl -sf -H "Authorization: Bearer $ADMIN_TOKEN" https://app.vendortrack.com/api/performance | jq .

# Backup and restore
./scripts/backup.sh --full
./scripts/restore.sh <timestamp>

# Key rotation
./scripts/rotate-keys.sh stripe
./scripts/rotate-keys.sh supabase
./scripts/rotate-keys.sh gemini
./scripts/rotate-keys.sh redis
./scripts/rotate-keys.sh all

# Load testing
npx tsx scripts/load-test.ts --scale=100
npx tsx scripts/load-test.ts --scale=1000
npx tsx scripts/load-test.ts --scale=10000 --scenario=checkout

# Docker operations
docker compose up -d
docker compose down
docker compose logs -f app
docker compose logs -f worker
docker compose restart app
docker compose restart worker

# Database operations
psql "$SUPABASE_DB_URL" -c "VACUUM ANALYZE products;"
psql "$SUPABASE_DB_URL" -c "SELECT * FROM v_table_stats WHERE bloat_percentage > 20;"
psql "$SUPABASE_DB_URL" -c "SELECT * FROM v_index_usage WHERE usage_status = 'UNUSED';"

# Redis operations
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" PING
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO Memory
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" DBSIZE
redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" FLUSHDB

# Cron endpoints
curl -sf -H "Authorization: Bearer $CRON_SECRET" https://app.vendortrack.com/api/cron/health-check
curl -sf -H "Authorization: Bearer $CRON_SECRET" https://app.vendortrack.com/api/cron/cache-warming
curl -sf -H "Authorization: Bearer $CRON_SECRET" https://app.vendortrack.com/api/cron/reconciliation
```

---

*This operations manual is a living document. Submit updates via pull request to the operations repository. All changes must be reviewed by the platform lead before merging.*
