# OPERATIONS.md -- VendorTrack Operations Documentation

## Table of Contents

1. [Operations Overview](#1-operations-overview)
2. [Monitoring Stack](#2-monitoring-stack)
3. [Alerting](#3-alerting)
4. [Disaster Recovery](#4-disaster-recovery)
5. [Key Rotation](#5-key-rotation)
6. [Incident Response](#6-incident-response)
7. [Performance Management](#7-performance-management)
8. [Capacity Planning](#8-capacity-planning)
9. [Maintenance Windows](#9-maintenance-windows)
10. [Operational Runbooks](#10-operational-runbooks)

---

## 1. Operations Overview

### Philosophy

VendorTrack operates on the principle of **observability-first operations**: every system component must emit structured telemetry before it ships to production. The operations team relies on proactive detection rather than reactive troubleshooting, ensuring that the multi-vendor marketplace remains available, performant, and financially consistent at all times. Because VendorTrack handles real money through Stripe payment processing and maintains a double-entry financial ledger, operational discipline is not optional -- it is a fiduciary requirement. Every deployment must be reversible, every data mutation must be auditable, and every incident must produce a postmortem that prevents recurrence.

The operations philosophy rests on four pillars: **automation over manual intervention**, **gradual rollouts over big-bang deployments**, **defense in depth over single points of failure**, and **blameless postmortems over fault assignment**. The team treats production incidents as learning opportunities, not punishable offenses. The goal is to reduce mean time to detection (MTTD) to under five minutes and mean time to resolution (MTTR) to under thirty minutes for SEV1 incidents.

### Team Responsibilities

| Role | Responsibility | Coverage |
|------|---------------|----------|
| Platform Engineer | Infrastructure, CI/CD, monitoring, deployments | 24/7 on-call rotation |
| Application Engineer | Application code, bug fixes, feature rollouts | Business hours + on-call |
| Database Operator | Supabase migrations, query optimization, backups | Business hours + escalation |
| Security Engineer | Credential rotation, vulnerability response, audit | Business hours + on-call |
| SRE Lead | Incident command, capacity planning, postmortems | 24/7 escalation point |

### On-Call Rotation

The on-call rotation follows a weekly primary/secondary model. The primary on-call engineer receives all pages and is responsible for initial triage and mitigation. The secondary on-call engineer serves as backup and escalates to the SRE Lead if the primary is unavailable after 15 minutes. The rotation schedule is published in the shared team calendar and managed through the on-call scheduling tool.

On-call expectations:
- Primary must acknowledge pages within 5 minutes during business hours and 15 minutes outside business hours.
- Secondary must be reachable within 15 minutes at all times.
- Handoff occurs every Monday at 09:00 UTC with a verbal or written handoff note covering open issues, ongoing incidents, and any watch items.
- On-call engineers must have laptop and internet access for the entire rotation period.
- Post-incident, the on-call engineer is responsible for filing the initial incident report within 24 hours.

---

## 2. Monitoring Stack

### Sentry Error Tracking

VendorTrack integrates Sentry for both server-side and client-side error tracking. The integration is configured in `src/lib/monitoring/sentry.ts` and initialized at application startup via `instrumentation.ts`. Sentry captures unhandled exceptions, records breadcrumbs for error tracing, and provides performance transaction sampling.

Configuration details:
- **DSN**: Set via `SENTRY_DSN` environment variable
- **Environment**: Set via `SENTRY_ENVIRONMENT` (production, staging, development)
- **Release**: Set via `SENTRY_RELEASE` (typically the Git SHA)
- **Traces sample rate**: 10% (configurable via `SENTRY_TRACES_SAMPLE_RATE`)
- **Profiles sample rate**: 10% (configurable via `SENTRY_PROFILES_SAMPLE_RATE`)
- **PII filtering**: All `beforeSend` hooks strip cookies, authorization headers, email addresses, IP addresses, and query parameters containing `token`, `key`, or `secret`
- **Noise filtering**: Known noisy errors (ResizeObserver, Network request failed, AbortError) are suppressed via `ignoreErrors`

### OpenTelemetry Tracing

Distributed tracing is implemented via OpenTelemetry in `src/lib/monitoring/opentelemetry.ts`. The SDK exports traces to any OTLP-compatible backend (Jaeger, Grafana Tempo, Honeycomb, or Datadog). The tracing layer provides specialized helpers for different operation types:

- `traced()` -- Generic async operation span
- `tracedQuery()` -- Database query span with `db.operation`, `db.table`, and `db.system` attributes
- `tracedApi()` -- API request span with `http.method` and `http.route` attributes
- `tracedPayment()` -- Payment operation span with `payment.operation` attributes

Configuration:
- **Endpoint**: `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable
- **Service name**: `OTEL_SERVICE_NAME` (default: `vendortrack`)
- **Sample rate**: `OTEL_TRACES_SAMPLER_RATE` (default: 0.1)

### Prometheus Metrics

The application exposes a Prometheus-compatible metrics endpoint at `/api/performance?format=prometheus`. The `PerformanceMonitor` class in `src/lib/performance/monitor.ts` maintains in-memory circular buffers for API latencies, database latencies, and error counts, and exports them in the Prometheus exposition format.

Exported metrics:

| Metric Name | Type | Description |
|-------------|------|-------------|
| `vt_api_request_count` | counter | Total API requests |
| `vt_api_error_rate` | gauge | API error rate (0-1) |
| `vt_api_latency_avg_ms` | gauge | Average API latency in ms |
| `vt_api_latency_p95_ms` | gauge | P95 API latency in ms |
| `vt_api_latency_p99_ms` | gauge | P99 API latency in ms |
| `vt_db_query_count` | counter | Total DB queries |
| `vt_db_latency_avg_ms` | gauge | Average DB latency in ms |
| `vt_db_latency_p95_ms` | gauge | P95 DB latency in ms |
| `vt_db_slow_query_count` | counter | Slow DB queries (>1s) |
| `vt_cache_hit_rate` | gauge | Cache hit rate (0-1) |
| `vt_cache_key_count` | gauge | Cached key count |
| `vt_queue_pending` | gauge | Pending queue jobs |
| `vt_queue_dead` | gauge | Dead letter queue count |
| `vt_memory_heap_used_mb` | gauge | Heap used in MB |
| `vt_memory_rss_mb` | gauge | RSS memory in MB |

The Prometheus scrape configuration (in `monitoring/prometheus.yml`) scrapes the application every 30 seconds, with Redis exporter on port 9121 and Node exporter on port 9100 as additional targets.

### Structured Logging

The structured logger in `src/lib/logger/index.ts` replaces all `console.log`/`console.error` calls with leveled, context-rich log entries. In production, all output is JSON-formatted for ingestion by log aggregation tools (ELK, Loki, CloudWatch Logs). In development, output is human-readable with timestamps, module names, and action tags.

Log levels (server-side default: `info`, client-side default: `warn`):
- `debug` -- Verbose diagnostic information
- `info` -- General operational messages
- `warn` -- Degraded but functional conditions
- `error` -- Failures requiring attention

Each log entry includes: `timestamp`, `level`, `message`, `module`, `action`, `traceId`, `data`, and `error` (name, message, stack). Module-scoped loggers can be created with `createLogger('module-name')` to automatically attach the module field to all entries.

### Health Endpoints

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /api/health` | Container health check (Docker) | No |
| `GET /api/cron/health-check` | Scheduled deep health check (DB + Redis) | CRON_SECRET |
| `GET /api/performance` | Full performance snapshot + Prometheus metrics | Admin (PERMISSIONS.ADMIN_READ) |
| `GET /api/payment-health` | Payment system health (circuit breaker, queue, GMV) | Admin (PERMISSIONS.ANALYTICS_READ) |

The Docker health check hits `/api/health` every 30 seconds with a 10-second timeout and 3 retries. The scheduled health check at `/api/cron/health-check` verifies database connectivity and records latency metrics.

### Dashboard Setup

The recommended observability dashboard stack:
1. **Grafana** -- Primary dashboard for Prometheus metrics and log correlation
2. **Sentry** -- Error tracking and performance transaction explorer
3. **Jaeger/Grafana Tempo** -- Distributed trace visualization
4. **Supabase Dashboard** -- Database metrics, connection pool, and query performance
5. **Stripe Dashboard** -- Payment success rates, webhook delivery, and dispute monitoring

Grafana should be configured with the following core dashboards:
- **Application Overview**: Request rate, error rate, p95 latency, uptime
- **Database Health**: Query latency histogram, slow queries, connection count
- **Cache Performance**: Hit rate, key count, memory usage, invalidation events
- **Payment Health**: Success rate, GMV, refund rate, circuit breaker status
- **Queue Health**: Pending jobs, processing rate, dead letter count, oldest pending age
- **Infrastructure**: Memory, CPU, Redis memory, disk usage

---

## 3. Alerting

### Prometheus Alert Rules

All alert rules are defined in `monitoring/alerts.yml` and evaluated by Prometheus every 15 seconds. The following alert rules are configured:

#### Application Alerts

| Alert Name | Expression | Duration | Severity | Description |
|-----------|-----------|----------|----------|-------------|
| `VendorTrackAppDown` | `up{job="vendortrack"} == 0` | 2m | Critical | Application unreachable for 2 minutes |
| `VendorTrackHighErrorRate` | `vt_api_error_rate > 0.05` | 5m | Warning | API error rate exceeds 5% |
| `VendorTrackHighLatency` | `vt_api_latency_p95_ms > 500` | 5m | Warning | P95 latency exceeds 500ms |
| `VendorTrackCriticalLatency` | `vt_api_latency_p95_ms > 1000` | 2m | Critical | P95 latency exceeds 1 second |
| `VendorTrackHighMemoryUsage` | `vt_memory_heap_used_mb / vt_memory_rss_mb > 0.9` | 5m | Warning | Heap usage exceeds 90% of RSS |

#### Database Alerts

| Alert Name | Expression | Duration | Severity | Description |
|-----------|-----------|----------|----------|-------------|
| `VendorTrackHighDBLatency` | `vt_db_latency_p95_ms > 100` | 5m | Warning | Database P95 latency exceeds 100ms |
| `VendorTrackSlowQueries` | `vt_db_slow_query_count > 10` | 10m | Warning | More than 10 slow queries in 10 minutes |

#### Cache Alerts

| Alert Name | Expression | Duration | Severity | Description |
|-----------|-----------|----------|----------|-------------|
| `VendorTrackLowCacheHitRate` | `vt_cache_hit_rate < 0.5` | 10m | Warning | Cache hit rate below 50% |

#### Queue Alerts

| Alert Name | Expression | Duration | Severity | Description |
|-----------|-----------|----------|----------|-------------|
| `VendorTrackQueueBacklog` | `vt_queue_pending > 1000` | 10m | Warning | Queue backlog exceeds 1000 pending jobs |
| `VendorTrackDeadLetterQueueGrowing` | `increase(vt_queue_dead[1h]) > 10` | 5m | Critical | More than 10 new dead letter jobs in 1 hour |

### Alert Routing

Alerts are routed based on the `team` label and severity:

- **Critical alerts** (`severity: critical`) are sent to the on-call primary via PagerDuty (or equivalent) with immediate phone notification. They are also posted to the `#incidents` Slack channel.
- **Warning alerts** (`severity: warning`) are sent to the `#platform-alerts` Slack channel and logged in the alert tracking system. They do not trigger phone notifications unless they persist for more than 30 minutes.
- **All alerts** are tagged with `team: platform` and include the `summary` and `description` annotations from the alert rule.

### Escalation Procedures

1. **0-5 minutes**: Alert fires. Primary on-call receives notification. Primary acknowledges the alert.
2. **5-15 minutes**: If unacknowledged, alert is escalated to secondary on-call.
3. **15-30 minutes**: If still unacknowledged, alert is escalated to SRE Lead.
4. **30+ minutes**: If still unacknowledged, alert is escalated to engineering manager.
5. **Critical alerts only**: If a critical alert is not mitigated within 60 minutes, the incident is escalated to the CTO.

For all escalation steps, the escalation is documented in the incident timeline with timestamps.

---

## 4. Disaster Recovery

### Backup Strategy

VendorTrack employs a multi-layered backup strategy that covers the database, cache, and application code. Each layer has independent backup mechanisms to ensure recovery is possible even when one layer fails.

#### Supabase Automated Daily Backups

Supabase provides automated daily backups of the entire PostgreSQL database, including all tables, indexes, stored procedures, and RLS policies. These backups are retained for 7 days on the free tier and up to 30 days on paid plans. The backups are stored in the same cloud region as the project and are encrypted at rest.

In addition to Supabase's automated backups, the team should configure:
- **Point-in-time recovery (PITR)**: Available on Supabase Pro plans, enabling recovery to any point within the retention window.
- **Weekly manual pg_dump**: Exported to a separate cloud storage bucket (S3, GCS) in a different region for geographic redundancy.
- **Pre-migration snapshots**: Before every database migration, a manual snapshot is taken via the Supabase Dashboard or `pg_dump`.

#### Redis AOF Persistence

The Redis instance is configured with Append-Only File (AOF) persistence in the Docker Compose configuration (`--appendonly yes --appendfsync everysec`). This ensures that every write operation is logged to disk and can be replayed on restart. The RDB snapshot is also configured (`--save 60 1000 --save 300 100`) to create point-in-time snapshots every 60 seconds when at least 1000 keys change, and every 5 minutes when at least 100 keys change.

Redis data is stored in a Docker volume (`redis-data`) that persists across container restarts. However, since Redis serves as a cache layer, full data loss is acceptable -- the cache can be rebuilt from the primary database. The AOF persistence is primarily for reducing cold-start latency after a Redis restart.

#### Code in Git

All application code, infrastructure configuration, and migration scripts are stored in Git. The repository is the authoritative source for code and is backed up by the Git hosting provider (GitHub, GitLab). The following are also version-controlled:
- `monitoring/prometheus.yml` and `monitoring/alerts.yml` -- monitoring configuration
- `docker-compose.yml` and `docker-compose.dev.yml` -- infrastructure definition
- `docs/supabase-*.sql` -- all database migration scripts
- `Dockerfile`, `Dockerfile.dev`, `Dockerfile.worker` -- container definitions

### Restore Procedures

#### Database Restore

1. **From Supabase Dashboard**: Navigate to Project Settings > Database > Backups. Select the desired backup and click "Restore." This replaces the entire database with the backup state. The restore typically takes 5-15 minutes depending on database size.
2. **From PITR**: Use the Supabase CLI or Dashboard to restore to a specific timestamp. This is the preferred method for surgical recovery of accidentally deleted data.
3. **From pg_dump**: Download the backup file from cloud storage, then restore using `pg_restore`:
   ```bash
   pg_restore --clean --if-exists -d "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" backup.dump
   ```
4. **Post-restore verification**: After any restore, verify that RLS policies are intact, all tables have expected row counts, and the application can connect and serve requests.

#### Cache Rebuild

Redis cache loss is non-critical. The cache will naturally repopulate as requests flow through the application. To accelerate cache warming:

1. Hit the `/api/cron/cache-warming` endpoint to trigger a manual cache warm cycle.
2. Verify cache hit rate via `/api/performance` -- it should climb back above 50% within 15 minutes and above 80% within 1 hour under normal traffic.
3. If the cache hit rate does not recover, investigate whether the application is writing to cache correctly by checking structured logs for cache-related errors.

#### Full Recovery

In the event of a complete system failure (all containers down, database unreachable, Redis lost):

1. **Restore database**: Use Supabase Dashboard to restore from the most recent backup.
2. **Redeploy application**: `docker compose up -d` from the latest tagged release.
3. **Wait for Redis**: The Redis container will start with an empty dataset. AOF replay will restore any persisted data.
4. **Verify health**: Hit `/api/health` and `/api/cron/health-check` to confirm all systems are operational.
5. **Verify payments**: Check `/api/payment-health` to confirm Stripe connectivity and circuit breaker status.
6. **Monitor**: Watch Prometheus metrics and Sentry for 30 minutes to catch any cascading failures.

### RPO and RTO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **Recovery Point Objective (RPO)** | 1 hour | Supabase PITR on Pro plan; 24 hours on free tier |
| **Recovery Time Objective (RTO)** | 30 minutes | For SEV1 incidents; 4 hours for SEV2 |
| **Cache RPO** | 0 (acceptable loss) | Cache is non-durable; rebuilds from database |
| **Code RPO** | 0 | All code is in Git; no data loss possible |

### Recovery Testing Schedule

- **Monthly**: Test database restore from Supabase automated backup to a staging environment. Verify data integrity and application functionality.
- **Quarterly**: Perform a full disaster recovery drill: simulate complete system failure, restore from backups, and verify end-to-end functionality including payment processing.
- **Annually**: Conduct a comprehensive DR exercise involving the entire engineering team, including failover to a different cloud region if applicable.
- **After every major migration**: Verify that the backup strategy still covers the new schema and that restore procedures work with the updated database structure.

---

## 5. Key Rotation

### Stripe Key Rotation

Stripe keys are the most sensitive credentials in VendorTrack because they control payment processing. The rotation procedure is as follows:

1. **Stripe Secret Key** (`STRIPE_SECRET_KEY`):
   - Navigate to Stripe Dashboard > Developers > API Keys.
   - Click "Roll key" on the existing secret key. A new key is generated immediately; the old key is invalidated.
   - Update `STRIPE_SECRET_KEY` in the hosting platform's environment variables.
   - Redeploy the application.
   - Verify: Process a test payment and confirm it succeeds.
   - Monitor Stripe Dashboard > Logs for 48 hours to detect any unauthorized API calls with the old key.

2. **Stripe Webhook Secret** (`STRIPE_WEBHOOK_SECRET`):
   - Navigate to Stripe Dashboard > Developers > Webhooks.
   - Select the webhook endpoint and click "Reset signing secret."
   - Update `STRIPE_WEBHOOK_SECRET` in the hosting platform.
   - Redeploy the application.
   - Verify: Send a test webhook event from the Stripe Dashboard and confirm it is processed.

3. **Stripe Publishable Key** (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`):
   - Rolling the secret key automatically rotates the publishable key.
   - Update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in the hosting platform.
   - Redeploy the application (required because the publishable key is embedded in the client bundle at build time).

### Supabase Key Rotation

1. **Supabase Service Role Key** (`SUPABASE_SERVICE_ROLE_KEY`):
   - Navigate to Supabase Dashboard > Project Settings > API.
   - Click "Reset" on the service_role key. This invalidates all existing admin connections immediately.
   - Update `SUPABASE_SERVICE_ROLE_KEY` in the hosting platform.
   - Redeploy the application.
   - Verify: Test API routes that use the admin client (e.g., `/api/performance`, `/api/payment-health`).
   - Check Supabase Dashboard > Logs for unauthorized queries.

2. **Supabase Anon Key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`):
   - Navigate to Supabase Dashboard > Project Settings > API.
   - Click "Reset" on the anon key. This invalidates all existing client connections.
   - Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the hosting platform.
   - Redeploy the application.
   - Verify: Test login, signup, and data browsing.

3. **Supabase Project URL** (`NEXT_PUBLIC_SUPABASE_URL`):
   - Cannot be rotated directly as it is tied to the project.
   - If compromise is suspected, create a new Supabase project, migrate data using `pg_dump`/`pg_restore`, and update all environment variables.

### Gemini API Key Rotation

1. Navigate to Google AI Studio > API Keys (https://aistudio.google.com/apikey).
2. Delete the existing key.
3. Create a new key.
4. Update `GEMINI_API_KEY` in the hosting platform.
5. Redeploy the application.
6. Verify: Test AI product description generation in the seller dashboard.
7. Note: The Gemini API key is optional; AI features degrade gracefully when it is not configured.

### Redis Password Rotation

1. Generate a new strong password: `openssl rand -base64 32`
2. Update the Redis configuration to require the new password:
   ```
   redis-server --requirepass <new-password>
   ```
3. Update the `REDIS_URL` environment variable in the application: `redis://:new-password@redis:6379`
4. Restart the application containers to pick up the new connection string.
5. Verify: Check that the application can connect to Redis by monitoring cache hit rate.

### Sentry DSN Rotation

1. Navigate to Sentry > Project Settings > Client Keys (DSN).
2. Generate a new DSN key.
3. Update `SENTRY_DSN` in the hosting platform.
4. Redeploy the application.
5. Verify: Trigger a test error and confirm it appears in Sentry.

### Credential Rotation Checklist

The following checklist must be completed for every rotation event. A detailed version is maintained in `docs/CREDENTIAL_ROTATION_CHECKLIST.md`.

| Step | Action | Verified |
|------|--------|----------|
| 1 | Rotate the credential in the provider's dashboard | |
| 2 | Update environment variable in hosting platform | |
| 3 | Redeploy the application | |
| 4 | Verify the application starts successfully | |
| 5 | Verify the specific feature works (payment, auth, AI, etc.) | |
| 6 | Monitor provider dashboard for 48 hours for unauthorized activity | |
| 7 | Check logs for errors related to the rotated credential | |
| 8 | Update SECURITY.md audit log with rotation date | |
| 9 | Notify all team members of the rotation | |
| 10 | Run `gitleaks detect` to confirm no old credentials remain in Git | |

**Rotation frequency**: All credentials must be rotated every 90 days, or immediately upon any suspected leak. See SECURITY.md for the full rotation schedule.

---

## 6. Incident Response

### Incident Severity Levels

| Level | Name | Definition | Examples | Response Time |
|-------|------|-----------|----------|---------------|
| SEV1 | Critical | Total system outage or data loss | Application down, payment processing halted, database corruption, security breach | < 5 minutes |
| SEV2 | High | Major feature degraded with significant user impact | Checkout failing for >10% of users, webhook processing stalled, search unavailable | < 15 minutes |
| SEV3 | Medium | Minor feature degraded with limited user impact | Slow page loads, AI description generation failing, cache hit rate low | < 1 hour |
| SEV4 | Low | Cosmetic or non-user-facing issue | Dashboard rendering glitch, minor log noise, non-critical alert firing | Next business day |

### Response Process

The incident response process follows five phases:

#### Phase 1: Detect

Incidents are detected through:
- Prometheus alert firing (automated)
- Sentry error spike (automated)
- User reports via support channels
- Manual observation during routine checks

Upon detection, the on-call engineer creates an incident record in the incident tracking system with a unique incident ID (e.g., `INC-2024-0042`).

#### Phase 2: Assess

The on-call engineer assesses the incident:
1. Determine the severity level (SEV1-SEV4).
2. Identify the blast radius (how many users are affected).
3. Determine if customer data is at risk.
4. Identify the likely root cause domain (application, database, cache, payments, infrastructure).
5. For SEV1 and SEV2, page additional responders as needed.

#### Phase 3: Mitigate

The goal is to restore service as quickly as possible, even if the root cause is not yet understood:
1. **If the issue is a deployment**: Roll back to the previous known-good version.
2. **If the issue is a database problem**: Scale up the Supabase instance or enable read-only mode.
3. **If the issue is a cache problem**: Flush the cache and allow it to rebuild.
4. **If the issue is a payment problem**: Enable circuit breaker fallback mode and queue payments for retry.
5. **If the issue is a third-party outage**: Switch to degraded mode (e.g., disable AI features if Gemini is down).

Document every mitigation action with timestamps in the incident timeline.

#### Phase 4: Resolve

Once the incident is mitigated, the team works on the permanent fix:
1. Identify the root cause through log analysis, tracing, and code review.
2. Implement the fix in a branch.
3. Deploy the fix through the standard CI/CD pipeline with canary testing.
4. Verify that the fix resolves the issue without introducing new problems.
5. Remove any temporary mitigation measures (e.g., disable circuit breaker overrides).

#### Phase 5: Postmortem

Within 48 hours of incident resolution, a blameless postmortem is written and shared with the team. The postmortem includes:
- Incident summary and timeline
- Root cause analysis
- Impact assessment (users affected, revenue lost, data impacted)
- What went well in the response
- What could be improved
- Action items with owners and due dates

### Communication Templates

#### SEV1/SEV2 Initial Notification (Slack: #incidents)

```
[INCIDENT] INC-XXXX-NNNN | SEV[N] | [Brief Title]
Status: INVESTIGATING
Impact: [Description of user impact]
Started: [Timestamp UTC]
On-call: [@on-call-engineer]
Actions: [Current mitigation attempts]
Next update: [Time, e.g., +15 minutes]
```

#### SEV1/SEV2 Resolution Notification (Slack: #incidents)

```
[RESOLVED] INC-XXXX-NNNN | SEV[N] | [Brief Title]
Status: RESOLVED
Duration: [Total duration]
Root cause: [Brief description]
Mitigation: [What fixed it]
Postmortem: [Link to postmortem document]
```

#### External Status Page Update

```
We are currently investigating reports of [issue description]. Some users may experience [impact].
We are working to resolve this as quickly as possible and will provide updates every 30 minutes.
```

### Escalation Matrix

| Condition | Escalation Target | Time Threshold |
|-----------|------------------|----------------|
| SEV1 not acknowledged | Secondary on-call | 5 minutes |
| SEV1 not mitigated | SRE Lead + Engineering Manager | 30 minutes |
| SEV1 not mitigated | CTO | 60 minutes |
| SEV2 not acknowledged | SRE Lead | 15 minutes |
| SEV2 not mitigated | Engineering Manager | 2 hours |
| Data breach suspected | Security Engineer + Legal | Immediately |
| Payment fund discrepancy | Finance + Engineering Manager | Immediately |

---

## 7. Performance Management

### Key Metrics

VendorTrack monitors the following performance metrics continuously, with targets derived from the performance monitoring configuration in `src/lib/performance/monitor.ts` and the `/api/performance` endpoint:

| Metric | Target | Critical Threshold | Source |
|--------|--------|--------------------|--------|
| Lighthouse Performance Score | >= 90 | < 70 | Lighthouse CI |
| TTFB (Time to First Byte) | < 200ms | > 500ms | Core Web Vitals |
| LCP (Largest Contentful Paint) | < 2500ms | > 4000ms | Core Web Vitals |
| CLS (Cumulative Layout Shift) | < 0.1 | > 0.25 | Core Web Vitals |
| INP (Interaction to Next Paint) | < 200ms | > 500ms | Core Web Vitals |
| API P95 Latency | < 250ms | > 500ms | PerformanceMonitor |
| API P99 Latency | < 500ms | > 1000ms | PerformanceMonitor |
| API Error Rate | < 1% | > 5% | PerformanceMonitor |
| DB P95 Latency | < 50ms | > 100ms | PerformanceMonitor |
| Cache Hit Rate | >= 80% | < 50% | CacheService |
| Queue Pending Jobs | < 100 | > 1000 | Queue Status |

### Performance Budget

The application enforces a performance budget at the CI/CD level. Any deployment that exceeds the budget is blocked from promotion to production:

| Resource | Budget | Measurement |
|----------|--------|-------------|
| JavaScript bundle (main) | < 200 KB gzipped | Next.js build output |
| JavaScript bundle (total) | < 500 KB gzipped | Next.js build output |
| CSS bundle | < 50 KB gzipped | Next.js build output |
| Largest image | < 200 KB | Lighthouse CI |
| Total page weight | < 1.5 MB | Lighthouse CI |
| Lighthouse Performance | >= 90 | Lighthouse CI |
| Lighthouse Accessibility | >= 90 | Lighthouse CI |

### Slow Query Analysis

The `PerformanceMonitor` class tracks slow queries (queries exceeding 1000ms) in a circular buffer with a capacity of 100 entries. Slow queries are accessible via:
- `/api/performance` endpoint (admin-only, returns last 10 slow queries)
- `performanceMonitor.getSlowQueries(limit)` (programmatic access)

When a slow query is detected:
1. Review the query in the Supabase Dashboard > SQL Editor and run `EXPLAIN ANALYZE`.
2. Check if appropriate indexes exist for the query's filter and sort columns.
3. Review the database migration scripts in `docs/supabase-performance-migration.sql` for existing indexes.
4. If a new index is needed, add it through a migration script and test in staging before applying to production.
5. If the query is fundamentally inefficient, refactor the repository method to use a more targeted query or an RPC call.

Common slow query patterns in VendorTrack:
- Product search without category index
- Order listing without composite index on `(seller_id, status, created_at)`
- Analytics aggregation without materialized views

### Cache Tuning

The cache layer uses a tiered TTL strategy based on data volatility. The following TTLs are configured in `src/lib/cache/redis-client.ts`:

| Cache Key Pattern | TTL | Rationale |
|-------------------|-----|-----------|
| Products (listing) | 300s (5 min) | Products rarely change |
| Product detail | 120s (2 min) | Stock might update |
| User profile | 120s (2 min) | Session-scoped |
| Marketplace stats | 300s (5 min) | Materialized views |
| Search results | 60s (1 min) | Search consistency |
| Categories | 600s (10 min) | Rarely changes |
| Payment health | 30s | Critical monitoring |
| Dashboard metrics | 120s (2 min) | Dashboard data |
| Featured products | 300s (5 min) | Curated content |

Cache tuning guidelines:
- If cache hit rate drops below 80%, check if invalidation is too aggressive (e.g., invalidating entire tag groups when only one key changed).
- If stale data is reported by users, reduce the TTL for the affected key pattern.
- If Redis memory usage approaches the 256MB limit, review key patterns for unexpectedly large values and reduce TTLs.
- Use `CACHE_TAGS` for targeted invalidation rather than broad `invalidatePattern` calls.

### Connection Pool Management

Supabase manages PostgreSQL connection pooling via PgBouncer on the server side. The application should:
- Use the Supabase connection pooler URL (port 6543) for transaction-mode pooling when available.
- Avoid holding connections open for long-running operations.
- Use the `service_role` key only for server-side operations that require bypassing RLS.
- Monitor the `activeConnections` metric in the performance snapshot for connection leaks.

If active connections approach the Supabase plan limit:
1. Review slow queries that may be holding connections too long.
2. Check for unawaited promises in repository methods that might leak connections.
3. Consider implementing request-level connection queuing in the application.

---

## 8. Capacity Planning

### Current Capacity

Based on the Docker Compose configuration, the current production-like deployment has the following resource allocations:

| Component | CPU Limit | Memory Limit | CPU Reservation | Memory Reservation |
|-----------|-----------|-------------|-----------------|-------------------|
| Application (app) | 1.0 | 512 MB | 0.25 | 256 MB |
| Redis | -- | 512 MB | -- | 128 MB |
| Worker | 0.5 | 512 MB | -- | 128 MB |

Current estimated capacity:
- **Concurrent requests**: ~500 RPS per application instance (based on Next.js SSR benchmarks)
- **Database connections**: Determined by Supabase plan (60 on free tier, 200+ on Pro)
- **Redis memory**: 256 MB allocated, supporting approximately 100,000 cached keys
- **Queue throughput**: ~100 jobs/second per worker instance

### Scaling Triggers

The following metrics trigger scaling discussions or automatic scaling actions:

| Metric | Current Baseline | Warning Threshold | Scale Action |
|--------|-----------------|-------------------|-------------|
| API P95 latency | 200ms | > 400ms sustained for 15 min | Add application instances |
| CPU utilization | 40% | > 75% sustained for 15 min | Add application instances |
| Memory utilization | 50% | > 80% sustained for 15 min | Increase memory or add instances |
| Queue depth | < 50 | > 500 sustained for 30 min | Add worker instances |
| DB connection count | < 30 | > 80% of plan limit | Upgrade Supabase plan |
| Redis memory | < 128 MB | > 200 MB | Increase Redis memory or optimize keys |

### Horizontal Scaling Strategy

VendorTrack is designed for horizontal scaling of the application layer:

1. **Application instances**: The Next.js application is stateless (session data is in Supabase, cache is in Redis). New instances can be added behind a load balancer without session affinity requirements.
2. **Worker instances**: The background worker processes jobs from the `payment_job_queue` table using `SELECT ... FOR UPDATE SKIP LOCKED` (via the `claim_next_queue_job` RPC). This means multiple worker instances can safely process jobs concurrently without duplication.
3. **Database**: Supabase handles read replicas and connection pooling. The application connects through the pooler URL for optimal connection management.

Scaling procedure:
```bash
# Scale application instances
docker compose up -d --scale app=3

# Scale worker instances
docker compose up -d --scale worker=2
```

For orchestrated platforms (Kubernetes, ECS), configure horizontal pod autoscaling based on CPU and memory thresholds.

### Database Scaling

Supabase provides several scaling options:
- **Vertical scaling**: Upgrade the compute instance size (from free tier to Pro, Pro to Team, etc.) for more CPU, memory, and connections.
- **Read replicas**: Available on Pro plans and above. Direct read-heavy queries (product listings, search, analytics) to read replicas.
- **Connection pooling**: Use PgBouncer in transaction mode to handle more concurrent connections than the database allows natively.
- **Materialized views**: Pre-compute expensive aggregation queries (revenue analytics, marketplace stats) and refresh them periodically rather than computing on every request.

### Redis Scaling

Redis scaling strategies:
- **Vertical scaling**: Increase the `maxmemory` configuration and the container memory limit. The current 256MB can be increased to 1GB or more.
- **Redis Cluster**: For datasets exceeding single-node memory, deploy Redis Cluster for sharding across multiple nodes.
- **Upstash REST**: For serverless deployments on Vercel, use Upstash Redis which provides HTTP-based access and automatic scaling.
- **Key optimization**: Review cache key patterns and reduce TTLs for rarely-accessed keys to free memory for hot data.

### CDN Edge Caching

VendorTrack leverages HTTP cache headers for CDN edge caching. The `getCacheHeaders()` helper in `src/lib/cache/redis-client.ts` generates `Cache-Control` headers with `s-maxage` and `stale-while-revalidate` directives:

```typescript
// Cacheable content (products, categories)
Cache-Control: public, s-maxage=300, stale-while-revalidate=150

// Sensitive content (checkout, payment)
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
```

CDN configuration recommendations:
- **Static assets**: Cache indefinitely with content-hash-based filenames (Next.js default).
- **Product pages**: Cache at the edge for 5 minutes with stale-while-revalidate.
- **API routes**: Do not cache at the CDN; cache in Redis with appropriate TTLs.
- **Webhook endpoints**: Never cache; always route directly to the application.

---

## 9. Maintenance Windows

### Scheduled Maintenance Process

For planned maintenance that may affect availability:

1. **Identify the maintenance window**: Prefer Tuesday through Thursday, 02:00-06:00 UTC (lowest traffic period based on analytics).
2. **Notify stakeholders**: Post a maintenance notice at least 72 hours in advance to the status page, Slack channels, and email distribution list.
3. **Create a maintenance ticket**: Document the scope, expected duration, rollback plan, and affected systems.
4. **Pre-stage changes**: Ensure all code, migrations, and configuration changes are reviewed and tested in staging.
5. **Execute the maintenance**: Follow the documented steps. Update the status page with progress.
6. **Verify**: Run smoke tests, check health endpoints, and monitor error rates for 30 minutes after completion.
7. **Close the maintenance**: Update the status page and notify stakeholders.

### Zero-Downtime Deployment Strategy

VendorTrack uses a zero-downtime deployment strategy based on rolling updates:

1. **Build the new image**: `docker build -t vendortrack:v1.2.3 .`
2. **Deploy with rolling update**: Start the new instance alongside the old one. The load balancer health check (`/api/health`) will only route traffic to the new instance once it passes the health check with a 40-second start period.
3. **Drain the old instance**: Once the new instance is healthy and receiving traffic, the old instance is gracefully shut down. In-flight requests are given a 30-second drain period.
4. **Verify**: Monitor error rates and latency for 5 minutes after deployment. If metrics degrade, roll back immediately.

For Kubernetes deployments, use `RollingUpdate` strategy with `maxSurge: 1` and `maxUnavailable: 0`. For Vercel deployments, use the built-in preview and promotion workflow.

### Database Migration Process

Database migrations are handled through Supabase and must be executed carefully:

1. **Create the migration**: Write SQL migration scripts in `docs/supabase-*.sql` files.
2. **Test in staging**: Apply the migration to the staging database and verify the application works correctly.
3. **Take a pre-migration snapshot**: Before applying to production, create a manual backup via the Supabase Dashboard.
4. **Apply the migration**: Use the Supabase Dashboard SQL Editor or CLI to apply the migration.
5. **Verify**: Check that the application starts correctly, all queries work, and RLS policies are intact.
6. **Rollback plan**: Keep the reverse migration script ready. If the migration fails or causes issues, restore from the pre-migration snapshot.

Migration best practices:
- Always add new columns as nullable or with default values before backfilling data.
- Never drop columns in the same migration that adds their replacement.
- Create indexes concurrently (`CREATE INDEX CONCURRENTLY`) to avoid locking the table.
- Test migrations against a production-sized dataset in staging.

### Maintenance Communication

| Audience | Channel | Timing |
|----------|---------|--------|
| Internal engineering | Slack: #releases | 72 hours before, during, and after |
| External users | Status page | 72 hours before, during, and after |
| Vendors/sellers | Email + in-app notification | 72 hours before |
| Customer support | Slack: #support + runbook | 24 hours before |

---

## 10. Operational Runbooks

### Quick Reference: Common Operational Tasks

#### RBAC: Restart the Application

```bash
# Docker Compose
docker compose restart app

# Verify health
curl -s http://localhost:9002/api/health | jq .
```

#### RBAC: Check Application Health

```bash
# Basic health check
curl -s http://localhost:9002/api/health

# Performance snapshot (requires admin auth)
curl -s -H "Authorization: Bearer <token>" http://localhost:9002/api/performance | jq .

# Payment health (requires admin auth)
curl -s -H "Authorization: Bearer <token>" http://localhost:9002/api/payment-health | jq .

# Prometheus metrics
curl -s http://localhost:9002/api/performance?format=prometheus
```

#### RBAC: Flush the Cache

```bash
# Connect to Redis
docker compose exec redis redis-cli

# Flush all VendorTrack keys
KEYS vt:*   # Review keys first
FLUSHALL    # Nuclear option - clears entire Redis

# Or flush from application (if Redis client is available)
# The cacheService.clear() method clears the in-memory cache
```

#### RBAC: Check Queue Status

```bash
# Via the payment health endpoint (requires admin auth)
curl -s -H "Authorization: Bearer <token>" http://localhost:9002/api/payment-health | jq '.queue'

# Direct database query
# Connect to Supabase Dashboard > SQL Editor
SELECT status, COUNT(*) FROM payment_job_queue GROUP BY status;
```

#### RBAC: Reprocess Dead Letter Queue Jobs

```sql
-- Reset dead jobs to pending for retry
UPDATE payment_job_queue
SET status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    error_message = NULL
WHERE status = 'dead'
  AND created_at > NOW() - INTERVAL '7 days';
```

#### RBAC: Roll Back a Deployment

```bash
# Find the previous working image
docker images | grep vendortrack

# Deploy the previous version
docker compose down app
# Update the image tag in docker-compose.yml or .env
docker compose up -d app

# Verify
curl -s http://localhost:9002/api/health
```

#### RBAC: Scale Workers

```bash
# Scale to 2 worker instances
docker compose up -d --scale worker=2

# Verify workers are running
docker compose ps worker
```

#### RBAC: Check Redis Memory

```bash
docker compose exec redis redis-cli INFO memory
docker compose exec redis redis-cli INFO keyspace
```

#### RBAC: Investigate Slow Queries

```bash
# Via the performance API (requires admin auth)
curl -s -H "Authorization: Bearer <token>" http://localhost:9002/api/performance | jq '.slowQueries'

# Direct database query in Supabase Dashboard
SELECT query, calls, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;
```

#### RBAC: Emergency Circuit Breaker Override

If the Stripe circuit breaker is falsely tripped and blocking legitimate payments:

1. Check circuit breaker status via `/api/payment-health`.
2. Review the `getCircuitBreakerStatus()` output for the `stripe` circuit.
3. If the circuit is open but Stripe is healthy (confirmed via Stripe Dashboard status page), the circuit will automatically close after its reset timeout.
4. If immediate action is required, restart the application to reset in-memory circuit breaker state.
5. Monitor payment success rate closely after the override.

#### RBAC: Verify Database Backup

```bash
# Via Supabase Dashboard
# Navigate to Project Settings > Database > Backups
# Verify the latest backup timestamp is within the RPO target

# Manual pg_dump (for offsite backup)
pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" \
  --no-owner --no-privileges \
  > vendortrack-backup-$(date +%Y%m%d).sql
```

#### RBAC: Check Environment Variables

```bash
# Verify all required environment variables are set
# The application validates this at startup
docker compose logs app | grep "VENDORTRACK"

# Or use the built-in validation
# The requireEnvironment() function in src/lib/env.ts validates all variables
# and prints a detailed error if any are missing or invalid
```

#### RBAC: Emergency Database Read-Only Mode

If the database is under extreme load and writes are failing:

1. Enable read-only mode at the Supabase level: `ALTER DATABASE postgres SET default_transaction_read_only = on;`
2. The application will gracefully degrade: reads will work, but checkouts and order creation will fail with clear error messages.
3. Monitor the database load until it stabilizes.
4. Disable read-only mode: `ALTER DATABASE postgres SET default_transaction_read_only = off;`
5. Verify that write operations resume successfully.

---

*This document is maintained by the VendorTrack platform engineering team. Last reviewed: 2024. For questions or updates, contact the SRE Lead.*
