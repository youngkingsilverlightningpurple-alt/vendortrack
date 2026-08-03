# Pre-Launch Checklist

> Complete all items before launching VendorTrack to production.

---

## 1. Infrastructure

- [ ] **Supabase project created** — Production instance with correct region
- [ ] **Supabase URL and keys configured** — `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`
- [ ] **Database schema applied** — Run `supabase-schema.sql` and all migration files in order
- [ ] **RLS policies active** — Verify Row Level Security is enabled on all tables
- [ ] **Redis instance provisioned** (optional) — Or confirm LRU fallback is acceptable
- [ ] **Vercel project linked** — Framework preset: Next.js, regions: `iad1`, `sfo1`
- [ ] **Custom domain configured** (if applicable) — SSL certificate provisioned
- [ ] **CDN configured** — Static assets served with cache headers

## 2. Environment Variables

- [ ] `NEXT_PUBLIC_SUPABASE_URL` — Set to production Supabase URL
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Set to production anon key
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Set to production service role key (NEVER expose to client)
- [ ] `STRIPE_SECRET_KEY` — Set to production/live key (use `sk_live_` for production)
- [ ] `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — Set to production publishable key (`pk_live_`)
- [ ] `STRIPE_WEBHOOK_SECRET` — Set to webhook signing secret from Stripe dashboard
- [ ] `REDIS_URL` — Set to production Redis URL (optional)
- [ ] `GEMINI_API_KEY` — Set to Google AI API key (optional, AI features degrade gracefully)
- [ ] `SENTRY_DSN` — Set to Sentry project DSN (optional)
- [ ] `OTEL_EXPORTER_OTLP_ENDPOINT` — Set to OpenTelemetry collector endpoint (optional)
- [ ] `CRON_SECRET` — Set to a secure random string for cron job authentication
- [ ] `CORS_ALLOWED_ORIGINS` — Set to allowed origins (comma-separated)

## 3. Stripe Configuration

- [ ] **Stripe account verified** — Business information completed
- [ ] **Stripe Connect enabled** — Destination charges configured
- [ ] **Webhook endpoint created** — URL: `https://<domain>/api/webhooks/stripe`
- [ ] **Webhook events selected** — `payment_intent.succeeded`, `charge.refunded`, `payment_intent.payment_failed`, `charge.dispute.created`
- [ ] **Webhook signing secret** — `STRIPE_WEBHOOK_SECRET` set from Stripe dashboard
- [ ] **Test mode verified** — Test payments work end-to-end before switching to live mode
- [ ] **Live mode enabled** — Switch to live keys when ready for real transactions

## 4. Security

- [ ] **HTTPS enforced** — All traffic redirected to HTTPS
- [ ] **Security headers verified** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options
- [ ] **CSRF protection active** — Origin verification and token validation
- [ ] **Rate limiting configured** — Per-endpoint limits set
- [ ] **CORS configured** — Only allowed origins can make API requests
- [ ] **Cookie security** — Secure, HttpOnly, SameSite flags on all cookies
- [ ] **Secret scanning** — Run `npm run secret-scan` and verify no secrets in code
- [ ] **Environment variables** — No secrets in `.env.example` or committed files
- [ ] **RBAC tested** — Verify all role-based access controls work correctly
- [ ] **RLS policies tested** — Verify Row Level Security prevents unauthorized data access

## 5. Application

- [ ] **Build succeeds** — `npm run build` completes without errors
- [ ] **TypeScript compiles** — `npm run typecheck` passes
- [ ] **Lint passes** — `npm run lint` reports no errors
- [ ] **Tests pass** — `npm run test` and `npm run test:smoke` pass
- [ ] **Demo data seeded** — `npm run seed:demo` completes successfully
- [ ] **Health endpoint responds** — `curl /api/health` returns `{"status": "healthy"}`
- [ ] **All pages render** — No 500 errors on any route
- [ ] **Authentication works** — Login, signup, and logout work correctly
- [ ] **Payment flow works** — Test checkout with Stripe test card `4242 4242 4242 4242`
- [ ] **Search works** — Product search returns results
- [ ] **Admin dashboard loads** — Admin can view stats and manage users
- [ ] **Seller dashboard loads** — Sellers can manage products and orders
- [ ] **Buyer dashboard loads** — Buyers can view orders and request refunds

## 6. Monitoring

- [ ] **Sentry configured** — Error tracking with PII filtering
- [ ] **OpenTelemetry configured** — Distributed tracing (optional)
- [ ] **Prometheus metrics** — `/api/performance` endpoint accessible
- [ ] **Grafana dashboards** — Monitoring dashboards configured (optional)
- [ ] **Alert rules** — Prometheus alert rules configured (optional)
- [ ] **Alert routing** — Critical alerts → PagerDuty, warnings → Slack (optional)
- [ ] **Health check cron** — Running every 5 minutes
- [ ] **Reconciliation cron** — Running daily at 2 AM
- [ ] **Cache warming cron** — Running every 6 hours

## 7. Documentation

- [ ] **README.md** — Setup instructions, demo accounts, and quick start
- [ ] **DEMO_GUIDE.md** — Complete demonstration walkthroughs
- [ ] **ARCHITECTURE.md** — System architecture documentation
- [ ] **DEPLOYMENT.md** — Deployment procedures
- [ ] **API_REFERENCE.md** — API endpoint documentation
- [ ] **SECURITY.md** — Security measures and compliance
- [ ] **RUNBOOK.md** — Operational runbooks

## 8. Backup & Recovery

- [ ] **Database backup configured** — `scripts/backup.sh` tested
- [ ] **Restore procedure tested** — `scripts/restore.sh` tested
- [ ] **Key rotation procedure documented** — `scripts/rotate-keys.sh` tested
- [ ] **Disaster recovery plan** — Documented in OPERATIONS.md

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| Security Lead | | | |
| Operations Lead | | | |
| Product Owner | | | |

**All items must be checked before proceeding to go-live.**
