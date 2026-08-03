# Post-Deployment Checklist

> Complete after each production deployment. Verify all systems are operational.

---

## Immediate (0-5 minutes)

- [ ] **Health endpoint responds** — `curl https://<domain>/api/health` returns `{"status": "healthy"}`
- [ ] **Application loads** — Homepage renders without errors
- [ ] **Authentication works** — Login page loads and accepts credentials
- [ ] **No 500 errors** — Check Vercel logs for server errors
- [ ] **Deployment successful** — Vercel deployment status is "Ready"
- [ ] **SSL certificate valid** — HTTPS is working correctly

---

## Short-term (5-30 minutes)

- [ ] **Database connectivity** — Application can query Supabase
- [ ] **Redis connectivity** — Cache is working (or LRU fallback active)
- [ ] **Stripe integration** — Webhook endpoint is reachable
- [ ] **Search functionality** — Product search returns results
- [ ] **Payment flow** — Test checkout with Stripe test card
- [ ] **Admin dashboard** — Stats and metrics load correctly
- [ ] **Seller dashboard** — Products and orders load correctly
- [ ] **Buyer dashboard** — Orders and cart work correctly
- [ ] **Security headers** — Verify CSP, HSTS, X-Frame-Options
- [ ] **Rate limiting** — Verify rate limits are active
- [ ] **Cron jobs** — Verify all three cron jobs are scheduled
- [ ] **Feature flags** — Verify feature flag system is working

---

## Medium-term (30-60 minutes)

- [ ] **Sentry receiving errors** — Test by triggering a known error
- [ ] **Prometheus scraping** — Verify metrics endpoint is being scraped
- [ ] **Grafana dashboards** — Verify dashboards are showing data
- [ ] **Alert rules** — Verify alert rules are evaluated correctly
- [ ] **Performance baselines** — P95 latency under 500ms
- [ ] **Memory usage** — Under 75% heap utilization
- [ ] **Database connections** — Pool is stable, no timeouts
- [ ] **Cache hit rate** — Above 50% (if Redis configured)
- [ ] **Background jobs** — Queue processing is working

---

## Long-term (1-24 hours)

- [ ] **Error rate** — Under 0.1% in the last hour
- [ ] **Payment reconciliation** — Daily cron ran successfully
- [ ] **Cache warming** — 6-hour cron ran successfully
- [ ] **Health monitoring** — 5-minute cron running without errors
- [ ] **Database backups** — Scheduled backup completed
- [ ] **No memory leaks** — Memory usage stable over time
- [ ] **No connection pool exhaustion** — Database connections stable
- [ ] **User workflows** — Real users can complete all actions
- [ ] **Stripe webhooks** — All events processed within 5 minutes
- [ ] **Audit logs** — All critical operations logged with trace IDs

---

## Verification Commands

```bash
# Health check
curl -s https://<domain>/api/health | jq .

# Security headers
curl -I https://<domain>/ | grep -E 'X-Frame|Content-Security|Strict-Transport'

# Performance metrics
curl -s https://<domain>/api/performance

# Payment health
curl -s https://<domain>/api/payment-health

# Cron endpoints (with auth)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/health-check
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/reconciliation
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/cache-warming
```

---

## Deployment Record

| Field | Value |
|-------|-------|
| **Date** | |
| **Version** | |
| **Deployer** | |
| **Commit SHA** | |
| **Previous Version** | |
| **Rollback Plan** | `vercel rollback` |
| **Health Check** | |
| **Error Rate** | |
| **P95 Latency** | |
| **Notes** | |

---

## Issue Resolution

| Severity | Response Time | Escalation |
|----------|---------------|------------|
| **Critical** — Service down | 5 minutes | Engineering Lead + On-Call |
| **High** — Major feature broken | 15 minutes | Engineering Lead |
| **Medium** — Minor feature degraded | 1 hour | Next available engineer |
| **Low** — Cosmetic issue | 24 hours | Backlog |

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Deployer | | | |
| QA | | | |
| Product Owner | | | |
