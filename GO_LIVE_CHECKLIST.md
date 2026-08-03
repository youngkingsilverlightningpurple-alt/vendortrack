# Go-Live Checklist

> Execute on launch day. Complete each item in order.

---

## T-Minus 2 Hours: Pre-Launch

- [ ] **Notify team** — All stakeholders aware of launch window
- [ ] **Freeze deployments** — No code changes after this point
- [ ] **Run final verification** — `npm run verify:deployment`
- [ ] **Run acceptance tests** — `npm run verify:acceptance`
- [ ] **Run operational validation** — `npx tsx scripts/operational-validate.ts`
- [ ] **Verify health endpoint** — `curl https://<domain>/api/health` returns `healthy`
- [ ] **Verify demo data** — All demo accounts work and data is populated
- [ ] **Verify Stripe** — Test payment in live mode with real card
- [ ] **Verify monitoring** — Sentry, Prometheus, and Grafana are receiving data
- [ ] **Verify cron jobs** — All three cron jobs are scheduled and running
- [ ] **Verify backups** — Database backup is scheduled and tested

---

## T-Minus 30 Minutes: Final Checks

- [ ] **Switch Stripe to live mode** — Update `STRIPE_SECRET_KEY` to `sk_live_*`
- [ ] **Update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`** — Switch to `pk_live_*`
- [ ] **Verify Stripe webhook** — Live webhook endpoint is receiving events
- [ ] **Test live payment** — Process a small real payment and verify it completes
- [ ] **Verify refund flow** — Process a test refund and verify it completes
- [ ] **Check error tracking** — Sentry is receiving errors (not just test errors)
- [ ] **Check performance metrics** — Prometheus is scraping metrics
- [ ] **Verify SSL certificate** — HTTPS is working correctly
- [ ] **Check DNS resolution** — Domain resolves to correct IP
- [ ] **Verify CORS** — API requests from allowed origins work

---

## T-0: Launch

- [ ] **Deploy to production** — `npm run build && vercel deploy --prod`
- [ ] **Verify deployment** — `curl https://<domain>/api/health`
- [ ] **Smoke test all pages** — Visit every major route
- [ ] **Test authentication** — Login with all demo accounts
- [ ] **Test buyer flow** — Browse → Cart → Checkout → Order
- [ ] **Test seller flow** — Dashboard → Products → Orders
- [ ] **Test admin flow** — Dashboard → Users → Orders → Refunds
- [ ] **Test search** — Search for products and verify results
- [ ] **Test chat** — Send a message between buyer and seller
- [ ] **Test notifications** — Verify notification delivery
- [ ] **Monitor error rates** — Check Sentry for new errors
- [ ] **Monitor response times** — Check performance metrics
- [ ] **Announce launch** — Notify stakeholders

---

## T+30 Minutes: Post-Launch Verification

- [ ] **Health check** — `/api/health` returns `healthy`
- [ ] **Error rate** — Less than 1% error rate in Sentry
- [ ] **Response time** — P95 latency under 500ms
- [ ] **Database** — Connection pool stable, no timeouts
- [ ] **Redis** — Cache hit rate above 50% (if configured)
- [ ] **Stripe** — Webhooks processing correctly
- [ ] **Cron jobs** — Running on schedule
- [ ] **No alerts firing** — All Prometheus alerts in OK state

---

## T+2 Hours: Stability Check

- [ ] **Review error logs** — No critical errors in the last 2 hours
- [ ] **Review performance metrics** — No degradation from baseline
- [ ] **Review payment processing** — All Stripe events processed
- [ ] **Review user activity** — Users can complete all workflows
- [ ] **Review monitoring dashboards** — All systems green

---

## T+24 Hours: Day 1 Review

- [ ] **Error rate review** — Under 0.1% error rate
- [ ] **Performance review** — P95 latency under 500ms
- [ ] **Payment review** — All payments and refunds processed correctly
- [ ] **User feedback** — No critical user-reported issues
- [ ] **Monitoring review** — All systems stable
- [ ] **Reconciliation** — Daily reconciliation cron ran successfully
- [ ] **Backup verification** — Database backup completed successfully

---

## Rollback Plan

If any critical issue is detected:

1. **Immediate rollback** — `vercel rollback` or redeploy previous version
2. **Switch Stripe to test mode** — Update keys back to `sk_test_*`
3. **Notify stakeholders** — Inform team of rollback and reason
4. **Investigate** — Review logs and error reports
5. **Fix** — Deploy hotfix and re-verify
6. **Re-launch** — Follow this checklist again from the top

---

## Emergency Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| Engineering Lead | | | |
| DevOps On-Call | | | |
| Security Lead | | | |
| Product Owner | | | |
