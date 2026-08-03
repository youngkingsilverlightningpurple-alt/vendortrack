# VendorTrack Operational Runbook

**Version:** 1.0
**Last Updated:** 2025-01-15
**Classification:** Internal -- Operations

---

## Table of Contents

1. [Deployment Runbook](#1-deployment-runbook)
2. [Incident Response Runbook](#2-incident-response-runbook)
3. [Rollback Runbook](#3-rollback-runbook)
4. [On-Call Guide](#4-on-call-guide)
5. [Production Checklist](#5-production-checklist)
6. [Common Operations](#6-common-operations)
7. [Database Operations](#7-database-operations)
8. [Payment Operations](#8-payment-operations)
9. [Security Operations](#9-security-operations)
10. [Emergency Contacts](#10-emergency-contacts)

---

## 1. Deployment Runbook

### Overview

VendorTrack is a Next.js 14 application deployed on Vercel with Docker-based self-hosted fallback. The application depends on Supabase (PostgreSQL), Stripe Connect, Redis, and Google Gemini AI. Deployments follow a structured procedure to ensure zero-downtime releases and financial data integrity.

### Pre-Deployment Checklist

Before initiating any deployment, verify the following items are complete:

- All CI/CD pipeline checks pass (secret scanning, build verification, client bundle leak check)
- No open Sentry issues with frequency above 10 occurrences per hour
- All database migrations have been tested on a staging Supabase project
- Stripe webhook endpoint is configured for the target environment
- Feature flags are set to the desired state for the new deployment
- Environment variables are updated in the Vercel dashboard (or Docker `.env`) for any new secrets
- The `package-lock.json` has not changed since the last successful build unless intentional
- The `vercel.json` cron schedule matches the expected configuration
- A manual backup of the Supabase database has been taken for the production environment
- The deployment window is within the approved change window (typically Tuesday-Thursday, 10:00-14:00 UTC)
- At least two team members are available during the deployment window
- Rollback plan has been reviewed and communicated to the team

### Deployment Procedure

#### Vercel Deployment (Primary)

```bash
# Step 1: Verify local build succeeds
npm ci
npm run build

# Step 2: Run the full test suite
npm test

# Step 3: Run secret scanning
npx gitleaks detect --config=.gitleaks.toml

# Step 4: Deploy to Vercel preview
vercel --env=staging

# Step 5: Verify preview deployment
curl -s https://vendortrack-staging.vercel.app/api/health | jq .

# Step 6: Promote to production
vercel --prod

# Step 7: Verify production deployment
curl -s https://your-domain.com/api/health | jq .
curl -s https://your-domain.com/api/payment-health | jq .
```

#### Docker Deployment (Self-Hosted)

```bash
# Step 1: Build the production image
docker build -t vendortrack:latest -f Dockerfile .

# Step 2: Tag with version
docker tag vendortrack:latest vendortrack:v1.X.X

# Step 3: Push to container registry
docker push your-registry/vendortrack:v1.X.X

# Step 4: Deploy with docker compose
docker compose -f docker-compose.yml pull
docker compose -f docker-compose.yml up -d

# Step 5: Verify container health
docker ps --filter name=vendortrack
docker logs vendortrack-app --tail 50
curl -s http://localhost:9002/api/health | jq .
```

### Post-Deployment Verification

After every deployment, execute the following verification steps:

1. **Health check**: Confirm `/api/health` returns `status: "ok"`
2. **Payment health**: Confirm `/api/payment-health` returns healthy metrics (refund rate below 15%, no dead jobs, no open circuit breakers)
3. **Database connectivity**: Confirm the health check cron at `/api/cron/health-check` reports database latency below 100ms
4. **Stripe webhook**: Send a test webhook from the Stripe dashboard and verify the event is processed in `processed_events`
5. **Cache warming**: Confirm the cron at `/api/cron/cache-warming` runs successfully on its next scheduled interval (every 6 hours)
6. **Reconciliation**: Run a manual reconciliation check via `/api/cron/reconciliation` and confirm no critical discrepancies
7. **Sentry**: Verify new release appears in Sentry with no spike in error rate
8. **Login flow**: Perform a manual login test to confirm Supabase auth is functioning
9. **Search**: Confirm product search returns results via the FTS index
10. **Frontend**: Load the homepage and seller dashboard to verify SSR and client-side rendering

### Rollback Procedure

If any post-deployment verification fails, refer to [Section 3: Rollback Runbook](#3-rollback-runbook) for the complete rollback procedure.

---

## 2. Incident Response Runbook

### Severity Definitions

| Severity | Definition | Response Time | Example |
|----------|-----------|---------------|---------|
| SEV1 | Total outage or data loss | 15 minutes | Site down, database unreachable, payment processing halted |
| SEV2 | Degraded service | 30 minutes | High error rate, slow responses, partial feature failure |
| SEV3 | Minor issue | 4 hours | Non-critical feature broken, UI glitch affecting workflow |
| SEV4 | Cosmetic | 24 hours | Visual bug, minor UX issue, non-user-facing problem |

### SEV1: Total Outage Response

A SEV1 incident means the platform is entirely unavailable or critical financial data is at risk. This includes complete site outage, database unreachable, or payment processing completely halted.

**Immediate Actions (0-15 minutes):**

1. Acknowledge the incident in the incident channel (Slack `#incidents`)
2. Assign an Incident Commander (IC) who will coordinate the response
3. Open a bridge call (Zoom/Google Meet) and share the link in the incident channel
4. Post an initial status update to the incident channel with the format: `[SEV1] [TIME] - [Brief description]`
5. Check Vercel status page at https://www.vercelstatus.com
6. Check Supabase status page at https://status.supabase.com
7. Check Stripe status page at https://status.stripe.com
8. Verify the health endpoint: `curl -s https://your-domain.com/api/health`
9. Check Sentry for recent error spikes
10. If the site is completely down, consider activating the static maintenance page on Vercel

**Investigation (15-60 minutes):**

1. Check Vercel deployment logs for build or runtime errors
2. Check Supabase dashboard for database health, connection count, and active queries
3. Check Redis connectivity if using Docker deployment
4. Review recent deployments for potential root cause
5. Check if any recent migration was applied that could cause the outage
6. If payment-related, check Stripe webhook delivery status and `processed_events` table

**Resolution:**

1. If a recent deployment caused the issue, initiate rollback immediately (see Section 3)
2. If a database migration caused the issue, revert the migration (see Section 7)
3. If infrastructure is the cause, contact the relevant vendor (see Section 10)
4. Activate feature flag kill switches if a specific feature is causing the outage

### SEV2: Degraded Service Response

A SEV2 incident means the platform is operational but experiencing significant degradation. This includes high error rates (above 5%), slow API responses (p95 above 500ms), or partial feature failures.

**Immediate Actions (0-30 minutes):**

1. Acknowledge the incident in the incident channel
2. Quantify the impact: error rate, latency, affected endpoints, affected users
3. Check Prometheus alerts: `VendorTrackHighErrorRate`, `VendorTrackHighLatency`, `VendorTrackCriticalLatency`
4. Check the payment health endpoint: `curl -s https://your-domain.com/api/payment-health`
5. Check database monitoring views: `v_query_performance`, `v_cache_hit_rate`
6. Review Sentry for error patterns and grouping

**Common SEV2 Scenarios and Fixes:**

| Scenario | Indicator | Fix |
|----------|-----------|-----|
| High API latency | p95 > 500ms | Check slow queries, clear cache, check Redis health |
| High error rate | > 5% of requests | Check Sentry, review recent deployments, check DB health |
| Cache hit rate drop | < 50% | Restart Redis, check cache warming cron, clear stale entries |
| Queue backlog | > 1000 pending jobs | Scale worker, check dead letter queue, check for stuck jobs |
| Database latency | > 100ms p95 | Check connection pool, run VACUUM ANALYZE, check slow queries |

### SEV3: Minor Issue Response

A SEV3 incident involves a non-critical feature being broken or a workflow impairment that does not affect the core marketplace functionality. Examples include chat notifications not sending, analytics dashboard showing stale data, or AI product description generation failing.

**Response Procedure:**

1. Create a ticket in the project tracker with the SEV3 label
2. Investigate during normal working hours
3. If the issue affects a feature behind a feature flag, consider disabling the flag
4. If the issue is related to a background job, check the job queue status
5. Communicate the issue to affected users if there is a user-facing impact
6. Target resolution within 4 hours during business hours

### SEV4: Cosmetic Issue Response

A SEV4 incident is a cosmetic or minor UX issue that does not affect functionality. Examples include styling inconsistencies, minor accessibility issues, or non-critical UI text errors.

**Response Procedure:**

1. Create a ticket in the project tracker with the SEV4 label
2. Address in the next regular sprint cycle
3. No incident channel communication required
4. No on-call escalation required

### Communication Templates

#### Initial Incident Notification

```
[SEV{N}] Incident Started
Time: {ISO_TIMESTAMP}
Description: {Brief description of the issue}
Impact: {Who/what is affected}
Current Status: {Investigating/Mitigating/Resolved}
Incident Commander: {Name}
Bridge Call: {Link}
Next Update: {Time}
```

#### Status Update

```
[SEV{N}] Status Update
Time: {ISO_TIMESTAMP}
Current Status: {Investigating/Mitigating/Monitoring/Resolved}
What We Know: {Summary of findings}
What We Are Doing: {Actions being taken}
Impact: {Current impact assessment}
Next Update: {Time}
```

#### Resolution Notification

```
[SEV{N}] Incident Resolved
Time: {ISO_TIMESTAMP}
Duration: {Total incident duration}
Root Cause: {Brief description of root cause}
Resolution: {What was done to resolve}
Follow-up: {Postmortem scheduled for {date/time}}
```

### Postmortem Template

```markdown
# Postmortem: [Incident Title]

**Date:** [Date]
**Severity:** SEV[N]
**Duration:** [Start Time] to [End Time] ([Total Duration])
**Incident Commander:** [Name]
**Contributors:** [Names]

## Summary
[1-2 paragraph description of the incident]

## Timeline
- [HH:MM] - [Event description]
- [HH:MM] - [Event description]

## Root Cause
[Detailed description of the root cause]

## Impact
- Users affected: [Number or percentage]
- Revenue impact: [Estimated amount]
- Data impact: [Any data loss or corruption]

## What Went Well
- [Positive aspects of the response]

## What Could Be Improved
- [Areas for improvement]

## Action Items
- [ ] [Action item] - Owner: [Name] - Due: [Date]
- [ ] [Action item] - Owner: [Name] - Due: [Date]
```

---

## 3. Rollback Runbook

### Vercel Rollback Procedure

Vercel maintains a history of successful deployments, making rollback straightforward when the application code is the source of an issue.

```bash
# Step 1: List recent deployments
vercel ls --prod

# Step 2: Identify the last known good deployment
# Note the deployment URL or ID from the output

# Step 3: Rollback to the previous deployment
vercel rollback --prod

# Alternatively, promote a specific deployment
vercel inspect [deployment-url]  # Verify it is the correct one
vercel promote [deployment-url] --prod

# Step 4: Verify the rollback
curl -s https://your-domain.com/api/health | jq .
```

**Important Notes:**
- Vercel rollback reverts the code but does NOT revert environment variables
- Vercel rollback does NOT revert database migrations
- If the issue was caused by an environment variable change, you must manually update the variable in the Vercel dashboard
- Rollback takes effect within seconds due to Vercel's edge network propagation

### Docker Rollback Procedure

When running VendorTrack via Docker Compose, rollback involves reverting to a previously tagged container image.

```bash
# Step 1: Identify the current running version
docker ps --filter name=vendortrack-app --format "{{.Image}}"

# Step 2: List available images
docker images vendortrack --format "{{.Tag}} {{.CreatedAt}}"

# Step 3: Update docker-compose.yml to use the previous version
# Change the image tag from vendortrack:latest to vendortrack:v1.X.X-1

# Step 4: Roll back the application container
docker compose -f docker-compose.yml down app
docker compose -f docker-compose.yml up -d app

# Step 5: Verify the rollback
docker logs vendortrack-app --tail 50
curl -s http://localhost:9002/api/health | jq .

# Step 6: If the worker also needs rollback
docker compose -f docker-compose.yml down worker
docker compose -f docker-compose.yml up -d worker
```

### Database Migration Rollback

Database migrations in VendorTrack are applied via SQL scripts in the `docs/` directory. Each migration section is designed to be independently reversible.

```bash
# Step 1: Identify the migration that caused the issue
# Check the Supabase dashboard for recent schema changes

# Step 2: Connect to the Supabase database
# Use the direct connection string (port 5432, not the pooler)
psql "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres"

# Step 3: Reverse the specific migration section
# Example: Rollback an index
DROP INDEX IF EXISTS idx_products_title_trgm;

# Example: Rollback a column addition
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;

# Example: Rollback an RPC
DROP FUNCTION IF EXISTS search_products;

# Example: Rollback a materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_product_sales_summary;

# Step 4: Verify the rollback
\dt   -- List tables
\df   -- List functions
\di   -- List indexes
```

**Critical Warning:** Never roll back data-modifying migrations (e.g., a migration that added rows to `financial_ledger`) without first consulting the financial reconciliation service. The `financial_ledger` table is immutable and append-only. Rolling back financial data requires manual intervention and a full reconciliation run afterward.

### Feature Flag Kill Switch

For issues caused by a specific feature rather than a deployment, use the feature flag kill switch to disable the problematic feature without a full rollback.

```bash
# Kill switch: disable auto-refund on failure
# Set environment variable on Vercel
vercel env add FEATURE_AUTO_REFUND_ON_FAILURE false --scope production

# Or for Docker deployments
export FEATURE_AUTO_REFUND_ON_FAILURE=false

# Kill switch: disable AI product descriptions
export FEATURE_AI_PRODUCT_DESCRIPTIONS=false

# Kill switch: disable search suggestions
export FEATURE_SEARCH_SUGGESTIONS=false

# Kill switch: disable new checkout flow
export FEATURE_V2_CHECKOUT_FLOW=false

# After setting the kill switch, redeploy or restart the application
# For Vercel: redeploy the current deployment
# For Docker: docker compose restart app
```

**Available Kill Switches:**

| Flag Key | Kill Switch | Effect |
|----------|------------|--------|
| `auto_refund_on_failure` | Yes | Disables automatic refunds on fulfillment failure |
| `stripe_connect` | No | Disables Stripe Connect (use with extreme caution) |
| `payment_reconciliation` | No | Disables automatic reconciliation |
| `ai_product_descriptions` | No | Disables AI product description generation |
| `full_text_search` | No | Disables FTS, falls back to basic search |
| `redis_caching` | No | Disables Redis, falls back to in-memory LRU |
| `sentry_error_tracking` | No | Disables Sentry error tracking |

### Emergency Rollback

For situations where the standard rollback procedure is too slow or the platform is in a critical state, use the emergency rollback procedure.

```bash
# Step 1: Immediately rollback to the last known good Vercel deployment
vercel rollback --prod

# Step 2: If Vercel is unavailable, switch to the Docker deployment
# Update DNS to point to the Docker host
# This requires DNS TTL to be set low (300s) in advance

# Step 3: If the database is the issue, activate Supabase point-in-time recovery
# Go to Supabase Dashboard -> Database -> Backups
# Select the most recent backup before the incident
# Restore to a new project first, then switch connection strings

# Step 4: Activate all kill switches for non-essential features
export FEATURE_AI_PRODUCT_DESCRIPTIONS=false
export FEATURE_SEARCH_SUGGESTIONS=false
export FEATURE_V2_CHECKOUT_FLOW=false
export FEATURE_OPENTELEMETRY_TRACING=false

# Step 5: Communicate the emergency rollback to the team
# Post in #incidents channel with the emergency rollback details
```

### Rollback Decision Tree

```
Is the site completely down?
  YES --> Is it a Vercel issue?
           YES --> Check Vercel status, switch to Docker if needed
           NO  --> Is it a database issue?
                    YES --> Check Supabase status, consider PITR
                    NO  --> Rollback the last deployment via Vercel
  NO  --> Is it a specific feature causing the issue?
           YES --> Can it be disabled via feature flag?
                    YES --> Activate the kill switch
                    NO  --> Rollback the last deployment
           NO  --> Is it a data issue?
                    YES --> Is it financial data?
                             YES --> Run reconciliation, manual intervention
                             NO  --> Rollback the migration, restore from backup
                    NO  --> Is it a performance issue?
                             YES --> Clear cache, check slow queries, scale resources
                             NO  --> Escalate to SEV1, investigate in Sentry
```

---

## 4. On-Call Guide

### On-Call Rotation

VendorTrack follows a weekly on-call rotation. The on-call engineer is the first responder for all SEV1 and SEV2 incidents.

**Rotation Schedule:**

| Week | Primary On-Call | Secondary On-Call |
|------|----------------|-------------------|
| Week 1 | Platform Engineer A | Platform Engineer B |
| Week 2 | Platform Engineer B | Platform Engineer C |
| Week 3 | Platform Engineer C | Platform Engineer A |
| Week 4 | Platform Engineer A | Platform Engineer B |

**Rotation Rules:**
- Rotation changes every Monday at 09:00 UTC
- The primary on-call is responsible for all alerts during their shift
- The secondary on-call is the escalation point if the primary is unreachable
- No engineer should be on-call for more than one week out of four
- On-call engineers must be available within 15 minutes for SEV1 and 30 minutes for SEV2

### Handoff Procedure

At the end of each on-call rotation, the outgoing on-call engineer must perform the following handoff:

1. **Review open incidents**: Document the status of any unresolved incidents in the incident tracker
2. **Update the runbook**: Add any new procedures or fixes discovered during the on-call shift
3. **Send a handoff message** in the `#on-call` Slack channel with the following format:

```
On-Call Handoff: [Date]
Outgoing: [Name]
Incoming: [Name]
Open Incidents: [List or "None"]
Follow-ups Needed: [List or "None"]
Notes: [Any relevant information]
```

4. **Transfer alerting**: Ensure the incoming on-call engineer is receiving PagerDuty/OpsGenie alerts
5. **Verify access**: Confirm the incoming on-call engineer has access to Vercel, Supabase, Stripe, and Sentry dashboards

### Escalation Matrix

| Level | Timeframe | Who | Action |
|-------|-----------|-----|--------|
| L1 | 0-15 minutes | Primary On-Call | Acknowledge, investigate, mitigate |
| L2 | 15-30 minutes | Secondary On-Call | Assist investigation, bring additional expertise |
| L3 | 30-60 minutes | Engineering Lead | Make rollback decisions, coordinate vendor contact |
| L4 | 60+ minutes | CTO / VP Engineering | Authorize emergency actions, external communication |

**Escalation Triggers:**
- SEV1 is not acknowledged within 15 minutes
- SEV1 is not mitigated within 60 minutes
- SEV2 is not mitigated within 4 hours
- Financial data integrity is at risk
- Customer data exposure is suspected
- The incident requires vendor escalation

### On-Call Tools

| Tool | Purpose | Access |
|------|---------|--------|
| Vercel Dashboard | Deployments, logs, analytics | https://vercel.com/dashboard |
| Supabase Dashboard | Database, auth, storage, logs | https://supabase.com/dashboard |
| Stripe Dashboard | Payments, webhooks, disputes | https://dashboard.stripe.com |
| Sentry | Error tracking, performance | https://sentry.io |
| Prometheus + Grafana | Metrics, alerting, dashboards | Internal monitoring stack |
| Docker | Container management (self-hosted) | `docker compose` CLI |
| Redis | Cache inspection | `redis-cli` or RedisInsight |
| PagerDuty / OpsGenie | Alert routing and on-call scheduling | On-call management platform |

### Common Alerts and Responses

| Alert | Condition | Response |
|-------|-----------|----------|
| VendorTrackAppDown | App unreachable for 2 minutes | Check Vercel status, check deployment logs, consider rollback |
| VendorTrackHighErrorRate | Error rate above 5% for 5 minutes | Check Sentry, review recent deployments, check database health |
| VendorTrackHighLatency | p95 latency above 500ms for 5 minutes | Check slow queries, clear cache, check Redis, check connection pool |
| VendorTrackCriticalLatency | p95 latency above 1s for 2 minutes | Immediate investigation, consider scaling or rollback |
| VendorTrackHighMemoryUsage | Heap usage above 90% for 5 minutes | Check for memory leaks, restart application, review Node.js heap |
| VendorTrackHighDBLatency | DB p95 latency above 100ms for 5 minutes | Check Supabase dashboard, run VACUUM ANALYZE, check connection pool |
| VendorTrackSlowQueries | 10+ slow queries in 10 minutes | Identify queries via `v_query_performance`, add indexes, optimize |
| VendorTrackLowCacheHitRate | Cache hit rate below 50% for 10 minutes | Check Redis health, verify cache warming cron, clear stale entries |
| VendorTrackQueueBacklog | 1000+ pending jobs for 10 minutes | Scale worker, check for stuck jobs, check dead letter queue |
| VendorTrackDeadLetterQueueGrowing | 10+ dead jobs in 1 hour | Review dead jobs, fix handler, re-queue if appropriate |

### On-Call Checklist

**Start of Shift:**
- [ ] Verify PagerDuty/OpsGenie is receiving alerts
- [ ] Confirm access to all dashboards (Vercel, Supabase, Stripe, Sentry)
- [ ] Review any open incidents from the previous shift
- [ ] Check the health endpoint: `curl -s https://your-domain.com/api/health`
- [ ] Check payment health: `curl -s https://your-domain.com/api/payment-health`
- [ ] Review Sentry for any new error patterns
- [ ] Confirm the on-call schedule is correct in the alerting system

**End of Shift:**
- [ ] Document any unresolved incidents
- [ ] Update the runbook with any new procedures
- [ ] Send the handoff message in the `#on-call` channel
- [ ] Verify the incoming on-call engineer is receiving alerts
- [ ] Archive any incident bridge calls

---

## 5. Production Checklist

### Pre-Deployment Checklist (30+ Items)

**Code and Build:**
- [ ] All CI/CD pipeline checks pass (secret scanning, build, client bundle leak check)
- [ ] No TypeScript compilation errors: `npx tsc --noEmit`
- [ ] No ESLint errors: `npx eslint src/`
- [ ] All unit tests pass: `npm test`
- [ ] No secrets in the codebase: `npx gitleaks detect --config=.gitleaks.toml`
- [ ] Client bundle does not contain server secrets (CI pipeline check)
- [ ] The `package-lock.json` is committed and matches the intended dependencies
- [ ] The Next.js build succeeds without warnings: `npm run build`

**Database:**
- [ ] All SQL migrations have been tested on a staging Supabase project
- [ ] Migration rollback scripts have been prepared and tested
- [ ] New indexes use `IF NOT EXISTS` (safe to re-run)
- [ ] New columns have DEFAULT values (no backfill needed)
- [ ] No destructive operations without a backup
- [ ] RLS policies have been verified for new tables
- [ ] RPC functions have been tested with expected inputs and edge cases

**Environment Variables:**
- [ ] All new environment variables are documented in `.env.example`
- [ ] All new environment variables are added to `src/lib/env.ts` `ENV_SPEC`
- [ ] Server-only variables do NOT have `NEXT_PUBLIC_` prefix
- [ ] Production environment variables are updated in Vercel dashboard
- [ ] Stripe keys are in live mode (`sk_live_`, `pk_live_`) for production
- [ ] Stripe webhook secret matches the live endpoint

**Payments:**
- [ ] Stripe webhook endpoint is configured for the target environment
- [ ] All 4 webhook event types are registered: `payment_intent.succeeded`, `charge.refunded`, `payment_intent.payment_failed`, `charge.dispute.created`
- [ ] Commission rate is consistent between code (`COMMISSION_RATE = 0.10`) and `fulfill_order_v2` RPC
- [ ] Test checkout flow works in Stripe test mode
- [ ] Test webhook delivery works from the Stripe dashboard

**Security:**
- [ ] No `NEXT_PUBLIC_` variables contain server-only secrets
- [ ] Supabase service role key is only used in server-side code
- [ ] RLS policies are active on all financial tables
- [ ] Rate limiting is configured for all critical endpoints
- [ ] CSRF protection is enabled for all state-changing operations
- [ ] Security headers are applied (X-Content-Type-Options, etc.)
- [ ] File upload security is configured (MIME type validation, size limits)

**Infrastructure:**
- [ ] Vercel regions are configured (`iad1`, `sfo1`)
- [ ] Cron jobs are configured in `vercel.json` (cache warming, reconciliation, health check)
- [ ] Redis is accessible from the application (if using Docker deployment)
- [ ] Docker resource limits are appropriate (512M memory, 1.0 CPU for app)
- [ ] Sentry DSN is configured for the target environment
- [ ] Prometheus alerting rules are deployed

**Operational:**
- [ ] A manual backup of the Supabase database has been taken
- [ ] The deployment window is within the approved change window
- [ ] At least two team members are available during the deployment
- [ ] Rollback plan has been reviewed and communicated
- [ ] Feature flags are set to the desired state for the new deployment

### Post-Deployment Checklist

- [ ] Health check endpoint returns `status: "ok"`
- [ ] Payment health endpoint returns healthy metrics
- [ ] Database connectivity is confirmed (latency below 100ms)
- [ ] Stripe webhook processing is confirmed (send test webhook)
- [ ] Cache warming cron runs successfully on next scheduled interval
- [ ] Reconciliation runs with no critical discrepancies
- [ ] Sentry shows no spike in error rate for the new release
- [ ] Login flow works end-to-end
- [ ] Product search returns results
- [ ] Homepage and seller dashboard render correctly
- [ ] Checkout flow works in test mode
- [ ] No new console errors in the browser
- [ ] Performance metrics are within acceptable ranges (p95 < 500ms)

### Security Checklist

- [ ] All secrets are stored in environment variables (not in code)
- [ ] `.env.local` is listed in `.gitignore`
- [ ] Gitleaks passes with zero findings
- [ ] No `NEXT_PUBLIC_` variables contain server-only secrets
- [ ] All Stripe keys are in live mode for production
- [ ] Supabase service role key is only used in server-side code
- [ ] RLS policies are active on all tables
- [ ] Rate limiting is configured for all critical endpoints
- [ ] CSRF protection is enabled
- [ ] Security headers are applied
- [ ] Financial ledger is immutable (no UPDATE/DELETE RLS policies)
- [ ] Webhook signature verification is active
- [ ] No SQL injection vectors in RPC functions
- [ ] Input validation (Zod schemas) is applied to all API routes
- [ ] File upload security is configured

### Monitoring Checklist

- [ ] Prometheus is scraping the application metrics endpoint
- [ ] All alert rules are active and firing correctly
- [ ] Sentry is tracking errors and performance
- [ ] Sentry release is set to the deployment version
- [ ] Health check cron is running every 5 minutes
- [ ] Cache warming cron is running every 6 hours
- [ ] Reconciliation cron is running daily at 02:00 UTC
- [ ] Database monitoring views are populated (`v_index_usage`, `v_table_stats`, `v_cache_hit_rate`, `v_query_performance`)
- [ ] Payment health metrics are being tracked
- [ ] Queue status is being monitored (pending, dead jobs)
- [ ] On-call engineer is receiving alerts via PagerDuty/OpsGenie

### Performance Checklist

- [ ] API p95 latency is below 500ms
- [ ] Database p95 latency is below 100ms
- [ ] Cache hit rate is above 50%
- [ ] Index cache hit rate is above 99%
- [ ] Table cache hit rate is above 99%
- [ ] Table bloat is below 10%
- [ ] Active database connections are below 50% of max
- [ ] Dead rows are below 5%
- [ ] No memory leaks (heap usage stable over time)
- [ ] Queue backlog is below 100 pending jobs
- [ ] No dead letter queue growth
- [ ] Circuit breakers are all closed
- [ ] Refund rate is below 15%
- [ ] Critical events (24h) are below 5

---

## 6. Common Operations

### Restart Application

**Vercel:**
```bash
# Vercel does not support manual restarts.
# Redeploy the current deployment to force a restart.
vercel --prod

# Alternatively, trigger a redeployment via the Vercel dashboard:
# Deployments -> [Current deployment] -> ... -> Redeploy
```

**Docker:**
```bash
# Restart the application container
docker compose restart app

# Restart with a clean state (removes in-memory cache)
docker compose down app
docker compose up -d app

# Restart all services
docker compose restart

# Restart and rebuild
docker compose down
docker compose up -d --build
```

### Clear Cache

**Redis (Production):**
```bash
# Connect to Redis
redis-cli -h <redis-host> -p 6379

# Clear all VendorTrack cache keys
KEYS vt:*
# Review keys before deleting

# Delete all VendorTrack keys
DEL $(redis-cli KEYS "vt:*" | tr '\r\n' ' ')

# Or flush the entire Redis database (use with caution)
FLUSHDB

# Check Redis memory usage
INFO memory
```

**In-Memory LRU Cache (Development/Fallback):**
The in-memory LRU cache is cleared on application restart. There is no external API to clear it without restarting.

**Next.js Cache:**
```bash
# Clear Next.js cache on Vercel
# Use revalidateTag or revalidatePath in server code
# Or redeploy the application

# Clear Next.js cache on Docker
docker compose exec app rm -rf .next/cache
docker compose restart app
```

### Investigate Slow Query

```sql
-- Step 1: Check the query performance monitoring view
SELECT * FROM v_query_performance ORDER BY mean_exec_time DESC LIMIT 10;

-- Step 2: Check for slow queries currently running
SELECT pid, now() - pg_stat_activity.query_start AS duration,
       query, state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- Step 3: Check index usage
SELECT * FROM v_index_usage WHERE idx_scan < 10 ORDER BY idx_scan;

-- Step 4: Analyze a specific query
EXPLAIN ANALYZE
SELECT * FROM products WHERE search_vector @@ to_tsquery('test');

-- Step 5: Check table statistics
SELECT * FROM v_table_stats WHERE dead_pct > 5;

-- Step 6: Run VACUUM ANALYZE if needed
VACUUM ANALYZE products;
VACUUM ANALYZE orders;

-- Step 7: Check cache hit rate
SELECT * FROM v_cache_hit_rate WHERE ratio < 0.95;
```

### Check Payment Health

```bash
# Check the payment health endpoint
curl -s https://your-domain.com/api/payment-health | jq .

# Expected healthy response:
# {
#   "successfulPayments24h": <number>,
#   "failedSessions24h": <number>,
#   "failureRate": <below 0.10>,
#   "refundRate7d": <below 0.15>,
#   "pendingRefunds": <below 50>,
#   "criticalEvents24h": <below 5>,
#   "queueStatus": { "dead": 0 },
#   "circuitBreakerOpen": false,
#   "healthy": true
# }
```

### Review Dead Letter Queue

```sql
-- Step 1: Count dead jobs by type
SELECT job_type, COUNT(*) as count, MAX(created_at) as latest
FROM payment_job_queue
WHERE status = 'dead'
GROUP BY job_type
ORDER BY count DESC;

-- Step 2: Review specific dead jobs
SELECT id, job_type, payload, error_message, attempts, trace_id, created_at
FROM payment_job_queue
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 20;

-- Step 3: Re-queue a dead job (if the underlying issue is resolved)
UPDATE payment_job_queue
SET status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    error_message = NULL
WHERE id = '<job-id>';

-- Step 4: Clean up old dead jobs (older than 30 days)
-- This is handled automatically by cleanupOldJobs()
-- But can be run manually:
DELETE FROM payment_job_queue
WHERE status IN ('completed', 'failed', 'dead')
  AND completed_at < NOW() - INTERVAL '30 days';
```

### Force Reconnection

**Supabase Database:**
```bash
# The Supabase JS client automatically reconnects.
# If you need to force a reconnection, restart the application.

# For Docker:
docker compose restart app

# For Vercel:
vercel --prod  # Redeploy
```

**Redis:**
```bash
# Check Redis connectivity
redis-cli -h <redis-host> -p 6379 PING
# Expected: PONG

# If Redis is not responding, restart it
docker compose restart redis

# Verify Redis health
docker compose exec redis redis-cli INFO server
```

**Stripe API:**
```bash
# Stripe API connectivity can be tested by listing PaymentIntents
curl -s https://api.stripe.com/v1/payment_intents?limit=1 \
  -u "sk_live_XXXXX:" | jq .

# If the Stripe API is unreachable, check https://status.stripe.com
```

### Scale Resources

**Vercel:**
Vercel automatically scales serverless functions. No manual scaling is required for the application layer. If you need more compute, consider upgrading the Vercel plan.

**Docker:**
```bash
# Scale the worker container
docker compose up -d --scale worker=3

# Increase resource limits in docker-compose.yml
# deploy.resources.limits.memory: 1024M
# deploy.resources.limits.cpus: "2.0"

# Apply the changes
docker compose up -d
```

**Supabase:**
Supabase scales vertically. If you need more database resources, upgrade the Supabase plan in the dashboard. For read-heavy workloads, consider adding read replicas.

**Redis:**
```bash
# Increase Redis memory limit in docker-compose.yml
# command: redis-server --maxmemory 512mb

# Apply the changes
docker compose up -d redis
```

---

## 7. Database Operations

### Run Migrations

VendorTrack uses raw SQL migration files stored in the `docs/` directory. Migrations are applied manually via the Supabase SQL editor or the `psql` command-line tool.

```bash
# Step 1: Review the migration file
# Migration files are located in:
#   docs/supabase-schema.sql
#   docs/supabase-rls-migration.sql
#   docs/supabase-performance-migration.sql
#   docs/supabase-payment-migration.sql
#   docs/supabase-database-optimization-migration.sql

# Step 2: Test on staging first
# Go to Supabase Dashboard -> SQL Editor
# Paste the migration SQL and run it

# Step 3: Apply to production
# Option A: Via Supabase SQL Editor (recommended)
# Go to Supabase Dashboard -> SQL Editor -> New Query
# Paste the migration SQL and run it

# Option B: Via psql
psql "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  -f docs/supabase-payment-migration.sql

# Step 4: Verify the migration
# Check that new tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

# Check that new indexes exist
SELECT indexname FROM pg_indexes WHERE schemaname = 'public';

# Check that new RPCs exist
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_type = 'FUNCTION';
```

**Migration Order (for initial setup):**
1. `docs/supabase-schema.sql` -- Base schema and RLS policies
2. `docs/supabase-rls-migration.sql` -- RLS policy updates
3. `docs/supabase-performance-migration.sql` -- Indexes and FTS
4. `docs/supabase-payment-migration.sql` -- Payment tables, RPCs, ledger
5. `docs/supabase-database-optimization-migration.sql` -- Optimization and monitoring views

### Check Slow Queries

```sql
-- View the query performance monitoring view
SELECT * FROM v_query_performance ORDER BY mean_exec_time DESC LIMIT 20;

-- Check currently running queries
SELECT pid, now() - query_start AS duration, query, state, usename
FROM pg_stat_activity
WHERE state != 'idle' AND query NOT LIKE '%pg_stat_activity%'
ORDER BY duration DESC;

-- Check queries with high execution time
SELECT query, calls, total_exec_time, mean_exec_time, max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- Check for table bloat
SELECT * FROM v_table_stats WHERE dead_pct > 5 OR bloat_pct > 10;

-- Check for missing indexes (sequential scans)
SELECT relname, seq_scan, idx_scan, seq_scan::float / GREATEST(idx_scan, 1) AS seq_ratio
FROM pg_stat_user_tables
WHERE seq_scan > 100
ORDER BY seq_ratio DESC;
```

### Analyze Connection Pool

```sql
-- Check current connection count
SELECT count(*) AS total_connections,
       state,
       usename
FROM pg_stat_activity
GROUP BY state, usename
ORDER BY total_connections DESC;

-- Check connection pool settings (Supabase provides PgBouncer)
-- Recommended: Transaction mode, pool size 15-20, max 200 connections

-- Check for idle connections
SELECT pid, now() - query_start AS idle_duration, query, usename
FROM pg_stat_activity
WHERE state = 'idle'
ORDER BY idle_duration DESC;

-- Kill long-running idle connections (use with caution)
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
  AND now() - query_start > interval '5 minutes'
  AND usename = 'postgres';
```

**Supabase Connection Pool Configuration:**

| Setting | Recommended Value | Notes |
|---------|-------------------|-------|
| Pooler Mode | Transaction | For serverless/Next.js |
| Pool Size | 15-20 | Per compute instance |
| Max Client Connections | 200 | Total across all clients |
| Connection Timeout | 30s | Prevent hung connections |
| Idle Timeout | 300s | Reclaim idle connections |

**Connection Strings:**
```
# Pooled connections (port 6543) - use for all application queries
DATABASE_URL=postgresql://postgres:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

# Direct connections (port 5432) - use for RPCs needing session features
DIRECT_URL=postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres
```

### Backup Verification

```bash
# Step 1: Check Supabase automated backup status
# Go to Supabase Dashboard -> Database -> Backups
# Verify the latest backup timestamp is within the last 24 hours

# Step 2: Create a manual backup before any major operation
pg_dump "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  > backup_$(date +%Y%m%d_%H%M%S).sql

# Step 3: Verify the backup file is not empty
ls -lh backup_*.sql
head -20 backup_*.sql

# Step 4: Backup the financial ledger separately (for compliance)
pg_dump -t financial_ledger -t audit_logs \
  "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  > financial_backup_$(date +%Y%m%d).sql

# Step 5: Schema-only backup (for migration tracking)
pg_dump --schema-only \
  "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  > schema_backup_$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
# Step 1: Restore from Supabase Point-in-Time Recovery (PITR)
# Go to Supabase Dashboard -> Database -> Backups
# Select the target timestamp
# Click "Restore to new project" (recommended for safety)
# Verify the restored data, then switch connection strings

# Step 2: Restore from a pg_dump backup
# Create a new Supabase project for the restore
psql "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  < backup_20250115_100000.sql

# Step 3: Verify the restored data
psql "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  -c "SELECT count(*) FROM orders;"
psql "postgresql://postgres:[password]@aws-0-[region].supabase.com:5432/postgres" \
  -c "SELECT count(*) FROM financial_ledger;"

# Step 4: Run reconciliation after restore
curl -s -X POST https://your-domain.com/api/cron/reconciliation \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

### RLS Policy Verification

```sql
-- List all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Check if RLS is enabled on all tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify RLS is enabled on critical financial tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('financial_ledger', 'payment_sessions', 'payment_job_queue',
                     'reconciliation_reports', 'processed_events', 'audit_logs');

-- Test RLS by querying as a non-admin user
-- This should return no rows for financial tables
SET ROLE anon;
SELECT count(*) FROM financial_ledger;  -- Should return 0 or error
RESET ROLE;

-- Verify the financial ledger immutability policies
-- No UPDATE or DELETE should be allowed
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'financial_ledger'
  AND cmd IN ('UPDATE', 'DELETE');
-- Should show policies with USING (false)
```

---

## 8. Payment Operations

### Check Payment Health

```bash
# Check the payment health endpoint
curl -s https://your-domain.com/api/payment-health | jq .

# Key metrics to review:
# - successfulPayments24h: Should be > 0 during normal operation
# - failureRate: Should be below 10%
# - refundRate7d: Should be below 15%
# - pendingRefunds: Should be below 50
# - criticalEvents24h: Should be below 5
# - queueStatus.dead: Should be 0
# - circuitBreakerOpen: Should be false
# - healthy: Should be true
```

**Payment Health Assessment Criteria:**

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Refund rate (7d) | < 10% | 10-15% | > 15% |
| Failure rate (24h) | < 5% | 5-10% | > 10% |
| Pending refunds | < 25 | 25-50 | > 50 |
| Critical events (24h) | < 3 | 3-5 | > 5 |
| Dead jobs | 0 | 1-5 | > 5 |
| Circuit breaker | Closed | - | Open |

### Investigate Failed Payment

```sql
-- Step 1: Find the failed payment session
SELECT id, user_id, amount_total_cents, status, payment_intent_id,
       expires_at, created_at
FROM payment_sessions
WHERE status IN ('failed', 'expired')
ORDER BY created_at DESC
LIMIT 20;

-- Step 2: Check the audit log for the specific trace
SELECT trace_id, event_type, severity, payload, created_at
FROM audit_logs
WHERE trace_id = '<trace_id>'
ORDER BY created_at DESC;

-- Step 3: Check the financial ledger for the payment
SELECT event_type, amount_cents, payment_intent_id, stripe_refund_id,
       trace_id, created_at
FROM financial_ledger
WHERE trace_id = '<trace_id>'
ORDER BY created_at DESC;

-- Step 4: Check if the PaymentIntent exists in Stripe
-- Use the Stripe Dashboard or API:
-- GET https://api.stripe.com/v1/payment_intents/<payment_intent_id>

-- Step 5: Check if the event was processed
SELECT id, created_at
FROM processed_events
WHERE id = '<event_id>';

-- Step 6: Check the job queue for related jobs
SELECT id, job_type, status, attempts, error_message, trace_id
FROM payment_job_queue
WHERE trace_id = '<trace_id>';
```

**Common Failure Scenarios:**

| Scenario | Detection | Resolution |
|----------|-----------|------------|
| Fulfillment failed after payment | `payment_sessions.status = failed` + `audit_logs` with `SYSTEM_FAILURE_REFUND` | Auto-refund should have triggered. If not, process manual refund |
| Session expired | `payment_sessions.status = expired` | No action needed (payment was never confirmed) |
| Webhook delivery failure | Missing entry in `processed_events` | Check Stripe webhook delivery status, retry if needed |
| Stripe API error | `audit_logs` with `STRIPE_*` error codes | Check Stripe status, retry if the error is transient |
| Inventory exhaustion | `audit_logs` with `INVENTORY_EXHAUSTED` | Auto-refund should have triggered. Verify in Stripe |

### Process Manual Refund

Manual refunds should only be processed when the automated refund system fails. This is a SEV2-level operation that requires two-person approval.

```bash
# Step 1: Verify the order exists and is eligible for refund
# In Supabase SQL Editor:
# SELECT id, buyer_id, amount_total_cents, status, refund_status, payment_intent_id
# FROM orders WHERE id = '<order_id>';

# Step 2: Verify the order is not already refunded
# refund_status should be 'none' or 'requested'
# status should not be 'refunded'

# Step 3: Process the refund via Stripe
curl -s https://api.stripe.com/v1/refunds \
  -u "sk_live_XXXXX:" \
  -d "payment_intent=<payment_intent_id>" \
  -d "amount[optional]=<amount_in_cents>" \
  -d "reason=requested_by_customer" \
  -d "metadata[order_id]=<order_id>" \
  -d "metadata[trace_id]=manual_refund_$(date +%s)" | jq .

# Step 4: Record the refund in the database
# Call the process_refund_atomic RPC:
# SELECT process_refund_atomic(
#   p_order_id := '<order_id>',
#   p_stripe_refund_id := '<stripe_refund_id>',
#   p_refund_amount_cents := <amount>,
#   p_trace_id := 'manual_refund_<timestamp>',
#   p_initiated_by := '<admin_user_id>'
# );

# Step 5: Verify the refund in the financial ledger
# SELECT * FROM financial_ledger WHERE order_id = '<order_id>'
#   AND event_type = 'refund_completed';

# Step 6: Run reconciliation to verify consistency
curl -s -X POST https://your-domain.com/api/cron/reconciliation \
  -H "Authorization: Bearer $CRON_SECRET" | jq .
```

**Partial Refund:**
To process a partial refund, include the `amount` parameter in the Stripe API call (in cents). The amount must be greater than 0 and less than or equal to the original order total.

### Reconcile Payments

```bash
# Run the daily reconciliation cron
curl -s -X POST https://your-domain.com/api/cron/reconciliation \
  -H "Authorization: Bearer $CRON_SECRET" | jq .

# Or run a targeted reconciliation via the admin API
curl -s -X POST https://your-domain.com/api/reconciliation/run \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"startDate": "2025-01-01", "endDate": "2025-01-15"}' | jq .
```

**Reconciliation Report Interpretation:**

| Discrepancy Type | Severity | Action Required |
|------------------|----------|-----------------|
| `missing_order` | CRITICAL | Stripe has a successful payment with no matching order. Investigate immediately and create the order manually or refund the payment |
| `duplicate_payment` | CRITICAL | Same PaymentIntent processed twice. Refund the duplicate and investigate the root cause |
| `orphan_refund` | CRITICAL | Refund exists in DB but not in Stripe. Process the refund in Stripe immediately |
| `amount_mismatch` | HIGH | Stripe amount differs from DB amount. Investigate and correct the discrepancy |
| `failed_transfer` | HIGH | Payment succeeded but no transfer to seller. Manually initiate the transfer |
| `commission_mismatch` | MEDIUM | Commission does not match 10% rate. Correct the commission calculation |

### Check Stripe Webhook Status

```bash
# Step 1: List webhook endpoints
curl -s https://api.stripe.com/v1/webhook_endpoints \
  -u "sk_live_XXXXX:" | jq .

# Step 2: Check recent webhook deliveries
# Go to Stripe Dashboard -> Developers -> Webhooks
# Select the endpoint and view recent deliveries

# Step 3: Check for failed deliveries
# Look for deliveries with non-200 response codes

# Step 4: Retry a failed webhook delivery
# In Stripe Dashboard -> Developers -> Webhooks -> [Endpoint] -> [Event] -> Retry

# Step 5: Verify the webhook secret matches
# The STRIPE_WEBHOOK_SECRET env variable must match the endpoint's signing secret
# If it does not match, update the environment variable and redeploy
```

### Investigate Dead Letter Queue

```sql
-- Step 1: Count dead jobs by type
SELECT job_type, COUNT(*) as count, MAX(created_at) as latest_dead
FROM payment_job_queue
WHERE status = 'dead'
GROUP BY job_type
ORDER BY count DESC;

-- Step 2: Review the most recent dead jobs
SELECT id, job_type, payload, error_message, attempts, max_attempts,
       trace_id, created_at
FROM payment_job_queue
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 10;

-- Step 3: Analyze the error message pattern
SELECT error_message, COUNT(*) as count
FROM payment_job_queue
WHERE status = 'dead'
GROUP BY error_message
ORDER BY count DESC;

-- Step 4: Re-queue dead jobs after fixing the underlying issue
UPDATE payment_job_queue
SET status = 'pending',
    attempts = 0,
    next_attempt_at = NOW(),
    error_message = NULL
WHERE status = 'dead'
  AND job_type = '<job_type>'  -- Only re-queue specific types
  AND created_at > NOW() - INTERVAL '7 days';  -- Only recent jobs

-- Step 5: Purge old dead jobs (older than 30 days)
DELETE FROM payment_job_queue
WHERE status = 'dead'
  AND created_at < NOW() - INTERVAL '30 days';
```

---

## 9. Security Operations

### Investigate Security Alert

When a security alert is triggered (HIGH or CRITICAL severity), follow this procedure:

```bash
# Step 1: Review the alert details
# Security alerts are logged in the audit_logs table
SELECT trace_id, event_type, severity, payload, created_at
FROM audit_logs
WHERE event_type IN ('ROLE_ESCALATION_ATTEMPT', 'IDOR_ATTEMPT',
                      'CSRF_TOKEN_INVALID', 'CSRF_ORIGIN_MISMATCH',
                      'SQL_INJECTION_ATTEMPT', 'XSS_ATTEMPT',
                      'PROMPT_INJECTION_ATTEMPT', 'UPLOAD_MIME_MISMATCH',
                      'UPLOAD_VIRUS_DETECTED', 'PAYMENT_ANOMALY',
                      'REFUND_ANOMALY', 'STRIPE_WEBHOOK_INVALID',
                      'SUSPICIOUS_ACTIVITY')
ORDER BY created_at DESC
LIMIT 20;

# Step 2: Check for attack patterns
# The security logger tracks attack patterns per user
# If a user has 5+ suspicious events in 15 minutes, an escalation is triggered
# Look for SUSPICIOUS_ACTIVITY events
SELECT trace_id, payload
FROM audit_logs
WHERE event_type = 'SUSPICIOUS_ACTIVITY'
ORDER BY created_at DESC;

# Step 3: Check the user's recent activity
# Replace <user_id> with the user from the alert
SELECT trace_id, event_type, severity, payload->>'path' as path,
       payload->>'ipAddress' as ip, created_at
FROM audit_logs
WHERE payload->>'userId' = '<user_id>'
ORDER BY created_at DESC
LIMIT 50;

# Step 4: Determine if the user should be suspended
# If the alert is CRITICAL and the attack pattern is confirmed:
# - Update the user's role to 'suspended' in the profiles table
# - Revoke all active sessions in Supabase Auth
```

**Security Event Severity Classification:**

| Event Type | Severity | Immediate Action |
|------------|----------|-----------------|
| SQL_INJECTION_ATTEMPT | CRITICAL | Block IP, investigate payload, suspend user |
| UPLOAD_VIRUS_DETECTED | CRITICAL | Quarantine file, investigate source, block IP |
| SUSPICIOUS_ACTIVITY | CRITICAL | Suspend user, investigate all recent activity |
| ROLE_ESCALATION_ATTEMPT | HIGH | Investigate, suspend user if confirmed |
| IDOR_ATTEMPT | HIGH | Investigate, check for data exposure |
| CSRF_TOKEN_INVALID | HIGH | Investigate, check for CSRF attack |
| XSS_ATTEMPT | HIGH | Investigate, check for stored XSS |
| PROMPT_INJECTION_ATTEMPT | HIGH | Log, monitor, consider rate limiting |
| PAYMENT_ANOMALY | HIGH | Investigate, check Stripe for fraud |
| REFUND_ANOMALY | HIGH | Investigate, check for refund abuse |
| STRIPE_WEBHOOK_INVALID | HIGH | Investigate, check for webhook spoofing |
| CSRF_TOKEN_MISSING | MEDIUM | Investigate, may be legitimate client issue |
| ACCESS_DENIED | MEDIUM | Review, may be legitimate access attempt |
| UPLOAD_BLOCKED | MEDIUM | Review, may be legitimate file type |
| RATE_LIMIT_EXCEEDED | LOW | Monitor, may be legitimate usage |

### Rate Limit Analysis

```sql
-- Step 1: Check for rate limit violations
SELECT trace_id, event_type, payload->>'identifier' as identifier,
       payload->>'path' as path, payload->>'limitType' as limit_type,
       created_at
FROM audit_logs
WHERE event_type IN ('RATE_LIMIT_EXCEEDED', 'BURST_LIMIT_EXCEEDED')
ORDER BY created_at DESC
LIMIT 50;

-- Step 2: Identify IPs or users with the most violations
SELECT payload->>'identifier' as identifier,
       COUNT(*) as violation_count,
       MIN(created_at) as first_violation,
       MAX(created_at) as last_violation
FROM audit_logs
WHERE event_type IN ('RATE_LIMIT_EXCEEDED', 'BURST_LIMIT_EXCEEDED')
  AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY payload->>'identifier'
ORDER BY violation_count DESC
LIMIT 20;

-- Step 3: Check if a specific IP is targeting multiple endpoints
SELECT payload->>'path' as path, COUNT(*) as count
FROM audit_logs
WHERE event_type IN ('RATE_LIMIT_EXCEEDED', 'BURST_LIMIT_EXCEEDED')
  AND payload->>'identifier' = 'ip:<suspicious-ip>'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY payload->>'path'
ORDER BY count DESC;
```

**Current Rate Limit Configuration:**

| Endpoint | Max Requests | Window | Burst Max | Burst Window |
|----------|-------------|--------|-----------|--------------|
| Login | 5 | 15 min | 3 | 1 min |
| Signup | 3 | 1 hour | 1 | 1 min |
| Password Reset | 3 | 1 hour | 1 | 5 min |
| Checkout | 10 | 1 hour | 3 | 1 min |
| Refund | 5 | 1 hour | 2 | 5 min |
| AI Generate | 10 | 1 hour | 3 | 1 min |
| Search | 60 | 1 min | 20 | 10 sec |
| Chat Send | 30 | 1 min | 10 | 10 sec |
| Upload | 10 | 1 hour | 3 | 1 min |
| Admin Action | 30 | 1 min | 10 | 10 sec |
| API Default | 100 | 1 min | 30 | 10 sec |

### CSRF Incident

If a CSRF incident is detected (CSRF_TOKEN_INVALID, CSRF_ORIGIN_MISMATCH), follow this procedure:

```bash
# Step 1: Review the CSRF alert
# Check the audit_logs for the specific event
SELECT trace_id, event_type, payload
FROM audit_logs
WHERE event_type IN ('CSRF_TOKEN_INVALID', 'CSRF_ORIGIN_MISMATCH', 'CSRF_TOKEN_MISSING')
ORDER BY created_at DESC
LIMIT 10;

# Step 2: Determine the scope
# - Is it a single user or multiple users?
# - Is it from a specific IP or multiple IPs?
# - Is it targeting a specific endpoint?

# Step 3: Check if legitimate requests are being blocked
# CSRF protection may block legitimate requests if:
# - The origin header is missing (some proxies strip it)
# - The origin does not match the expected domain
# - The CSRF token has expired

# Step 4: If the CSRF incident is a confirmed attack:
# - Block the attacking IP(s) at the CDN/WAF level
# - Review the affected user accounts for unauthorized actions
# - Check for any data modification or financial transactions

# Step 5: If the CSRF incident is a false positive:
# - Review the CSRF configuration in src/lib/security/csrf.ts
# - Check if the allowed origins list needs to be updated
# - Consider adding the legitimate origin to the allow list
```

### Rotate Compromised Credentials

If a credential is suspected to be compromised, rotate it immediately following the procedure in the SECURITY.md document.

**Stripe:**
1. Go to Stripe Dashboard -> Developers -> API Keys
2. Click "Roll key" on the existing secret key
3. Update the new key in the Vercel dashboard or Docker `.env`
4. Redeploy the application
5. Verify webhook processing still works

**Supabase:**
1. Go to Supabase Dashboard -> Project Settings -> API
2. Click "Reset" on the service_role key
3. Update the new key in the Vercel dashboard or Docker `.env`
4. Redeploy the application
5. Verify all API routes still function

**Gemini:**
1. Go to Google AI Studio -> API Keys
2. Delete the existing key
3. Create a new key
4. Update the new key in the Vercel dashboard or Docker `.env`
5. Redeploy

**After Rotation:**
1. Run `gitleaks detect` to verify no secrets are in the codebase
2. Check access logs on the affected provider for unauthorized usage
3. If unauthorized usage is detected, investigate the scope of the breach
4. Document the incident in the security log

### Review Audit Logs

```sql
-- Step 1: Review recent audit log entries
SELECT trace_id, event_type, severity, payload, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;

-- Step 2: Filter by severity
SELECT trace_id, event_type, severity, payload->>'userId' as user_id,
       payload->>'path' as path, created_at
FROM audit_logs
WHERE severity IN ('HIGH', 'CRITICAL')
ORDER BY created_at DESC
LIMIT 50;

-- Step 3: Filter by event type
SELECT trace_id, event_type, payload, created_at
FROM audit_logs
WHERE event_type = '<event_type>'
ORDER BY created_at DESC
LIMIT 50;

-- Step 4: Filter by user
SELECT trace_id, event_type, severity, payload, created_at
FROM audit_logs
WHERE payload->>'userId' = '<user_id>'
ORDER BY created_at DESC
LIMIT 50;

-- Step 5: Filter by time range
SELECT trace_id, event_type, severity, payload->>'path' as path, created_at
FROM audit_logs
WHERE created_at BETWEEN '2025-01-01' AND '2025-01-15'
  AND severity IN ('HIGH', 'CRITICAL')
ORDER BY created_at DESC;

-- Step 6: Count events by type and severity
SELECT event_type, severity, COUNT(*) as count
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type, severity
ORDER BY count DESC;
```

### Check for Data Exposure

```bash
# Step 1: Verify RLS policies are active
# See Section 7: RLS Policy Verification

# Step 2: Check if any server-only secrets are in the client bundle
# The CI pipeline checks this automatically, but you can verify manually:
# Build the application and search the output for secret patterns
npm run build
rg -i "sk_live|sk_test|whsec|service_role" .next/static/ || echo "No secrets found"

# Step 3: Check for exposed user data
# Verify that the anon key can only access data it should
# Use the Supabase JS client with the anon key and test queries

# Step 4: Check for data exposure in API responses
# Review all API routes for sensitive data in responses
# Ensure PII is not included in error messages or logs

# Step 5: Check Sentry for PII exposure
# Sentry is configured to strip PII (email, IP, cookies)
# Verify the beforeSend hook is working by checking recent events

# Step 6: Check Stripe for unauthorized access
# Review the Stripe Dashboard -> Developers -> Logs
# Look for API calls from unexpected IP addresses
```

---

## 10. Emergency Contacts

### Internal Team Contacts

| Role | Name | Email | Phone | Availability |
|------|------|-------|-------|-------------|
| Engineering Lead | [TBD] | [TBD] | [TBD] | Business hours + on-call |
| Platform Engineer A | [TBD] | [TBD] | [TBD] | On-call rotation |
| Platform Engineer B | [TBD] | [TBD] | [TBD] | On-call rotation |
| Platform Engineer C | [TBD] | [TBD] | [TBD] | On-call rotation |
| CTO / VP Engineering | [TBD] | [TBD] | [TBD] | SEV1 escalation only |
| Security Lead | [TBD] | [TBD] | [TBD] | Security incidents only |

### Vendor Support Contacts

#### Vercel

| Contact Method | Details |
|---------------|---------|
| Status Page | https://www.vercelstatus.com |
| Support Portal | https://vercel.com/support |
| Documentation | https://vercel.com/docs |
| Support Email | support@vercel.com |
| Twitter | @vercel |
| Pro Plan SLA | Response within 1 business day |
| Enterprise Plan SLA | Response within 1 hour (SEV1) |

#### Supabase

| Contact Method | Details |
|---------------|---------|
| Status Page | https://status.supabase.com |
| Support Portal | https://supabase.com/support |
| Documentation | https://supabase.com/docs |
| Discord | https://discord.supabase.com |
| GitHub | https://github.com/supabase/supabase/issues |
| Pro Plan SLA | Response within 1 business day |
| Enterprise Plan SLA | Response within 2 hours (SEV1) |

#### Stripe

| Contact Method | Details |
|---------------|---------|
| Status Page | https://status.stripe.com |
| Support Portal | https://support.stripe.com |
| Documentation | https://stripe.com/docs |
| API Status | https://status.stripe.com |
| Dashboard | https://dashboard.stripe.com |
| Support Email | support@stripe.com |
| Phone Support | Available for verified businesses |
| Response SLA | 24 hours (standard), 1 hour (critical) |

#### Sentry

| Contact Method | Details |
|---------------|---------|
| Status Page | https://status.sentry.io |
| Support Portal | https://sentry.io/support |
| Documentation | https://docs.sentry.io |
| Discord | https://discord.gg/sentry |
| GitHub | https://github.com/getsentry/sentry |
| Business Plan SLA | Response within 1 business day |
| Enterprise Plan SLA | Response within 4 hours (SEV1) |

### Escalation Timeline

| Time Since Incident | Action | Who |
|---------------------|--------|-----|
| 0 minutes | Alert triggered | Automated (PagerDuty/OpsGenie) |
| 0-5 minutes | Primary on-call acknowledges | Primary On-Call |
| 5-15 minutes | Investigation begins | Primary On-Call |
| 15 minutes | Escalate if not acknowledged | Secondary On-Call |
| 30 minutes | Escalate to Engineering Lead | Engineering Lead |
| 60 minutes | Escalate to CTO/VP Engineering | CTO/VP Engineering |
| 60 minutes | Contact vendor support if needed | Engineering Lead |
| 2 hours | External communication if needed | CTO/VP Engineering |
| 4 hours | SEV2 escalation to Engineering Lead | Engineering Lead |
| 24 hours | Postmortem scheduled | Engineering Lead |

**Vendor Escalation Triggers:**

- **Vercel**: Contact when the platform is down and Vercel status shows no active incident
- **Supabase**: Contact when the database is unreachable, connection pool is exhausted, or PITR is needed
- **Stripe**: Contact when payment processing is completely halted, webhooks are not being delivered, or there is a suspected fraud pattern
- **Sentry**: Contact when error tracking is not functioning or when there is a billing issue

---

**Document maintained by the VendorTrack Platform Engineering team. For questions or updates, contact the Engineering Lead.**
