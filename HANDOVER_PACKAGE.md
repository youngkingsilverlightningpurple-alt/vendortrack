# VendorTrack — Handover Package

> A complete guide for transferring VendorTrack ownership from the current operator to the acquiring party. This document covers every credential, service, and asset that must be transferred, along with step-by-step procedures and verification checklists.

---

## Overview

The VendorTrack handover process is designed to be completed in **2–5 business days** with minimal downtime. The platform is built on managed services (Supabase, Vercel, Stripe) which simplifies the transfer process — there are no physical servers, no data center contracts, and no on-premise infrastructure to migrate.

The handover is structured in three phases:
1. **Pre-Transfer** — Acquirer provisions new accounts and configures environment
2. **Transfer** — Data, services, and credentials are migrated
3. **Post-Transfer** — Verification, secrets rotation, and cleanup

---

## 1. Credentials Checklist

### Critical Credentials (Must Transfer)
| Credential | Source | Target | Priority |
|-----------|--------|--------|----------|
| Supabase Project URL | Seller's Supabase dashboard | Acquirer's Supabase project | 🔴 Critical |
| Supabase Service Role Key | Seller's Supabase dashboard | Acquirer's environment variables | 🔴 Critical |
| Supabase Anon Key | Seller's Supabase dashboard | Acquirer's environment variables | 🔴 Critical |
| Stripe Secret Key | Seller's Stripe dashboard | Acquirer's Stripe account | 🔴 Critical |
| Stripe Publishable Key | Seller's Stripe dashboard | Acquirer's Stripe account | 🔴 Critical |
| Stripe Webhook Secret | Seller's Stripe dashboard | Acquirer's Stripe webhook | 🔴 Critical |
| Google Gemini API Key | Seller's Google Cloud | Acquirer's Google Cloud project | 🟡 Medium |
| Sentry DSN | Seller's Sentry dashboard | Acquirer's Sentry organization | 🟡 Medium |
| Redis URL | Seller's Redis provider | Acquirer's Redis instance | 🟡 Medium |
| Cron Secret | Seller's environment | Acquirer's environment variables | 🟡 Medium |

### Platform Credentials (Must Transfer)
| Credential | Source | Target | Priority |
|-----------|--------|--------|----------|
| GitHub Repository | Seller's GitHub org | Acquirer's GitHub org | 🔴 Critical |
| Vercel Project | Seller's Vercel dashboard | Acquirer's Vercel account | 🔴 Critical |
| Domain Registrar | Seller's registrar | Acquirer's registrar | 🔴 Critical |
| DNS Provider | Seller's DNS | Acquirer's DNS | 🔴 Critical |
| PagerDuty Account | Seller's PagerDuty | Acquirer's PagerDuty | 🟢 Low |
| Slack Workspace | Seller's Slack | Acquirer's Slack | 🟢 Low |

### Verification Checklist
- [ ] All critical credentials received and stored securely
- [ ] All credentials stored in environment variables (never in code)
- [ ] `.env.local` is listed in `.gitignore`
- [ ] Gitleaks passes with zero findings: `gitleaks detect --config=.gitleaks.toml`
- [ ] No `NEXT_PUBLIC_` variables contain server-only secrets
- [ ] All Stripe keys are in live mode (`sk_live_`, `pk_live_`)
- [ ] Supabase service role key is only used in server-side code

---

## 2. DNS Transfer

### Step-by-Step DNS Transfer

**Day 1: Prepare**
1. Document current DNS configuration (all A, CNAME, MX, TXT records)
2. Verify current DNS propagation: `dig yourdomain.com ANY`
3. Identify the DNS provider (Cloudflare, Route53, GoDaddy, etc.)
4. Ensure the acquirer has access to or has created an account with the same or a new DNS provider

**Day 2: Transfer**
1. **Option A: Same Registrar Transfer** — Initiate an ownership transfer at the current registrar
2. **Option B: New Registrar Transfer** — Unlock the domain, request authorization code, initiate transfer at the new registrar
3. **Option C: New Domain** — Register a new domain and update all references in the codebase

**Day 3: Configure**
1. Update DNS records to point to the new Vercel deployment:
   ```
   A     @       76.76.21.21
   CNAME www     cname.vercel-dns.com
   ```
2. Configure Vercel domain verification
3. Verify SSL certificate provisioning (automatic with Vercel)
4. Test DNS propagation: `dig yourdomain.com ANY`

**Day 4: Verify**
1. Verify the application loads at the new domain
2. Verify Stripe webhook endpoint is updated to the new domain
3. Verify Supabase redirect URLs are updated to the new domain
4. Verify CORS `ALLOWED_ORIGINS` is updated to the new domain
5. Verify all email links point to the new domain

### DNS Records Checklist
- [ ] A record pointing to Vercel IP
- [ ] CNAME record for www subdomain
- [ ] MX records for email (if applicable)
- [ ] TXT records for domain verification (Vercel, Google, etc.)
- [ ] SPF/DKIM/DMARC records for email deliverability
- [ ] SSL certificate provisioned and verified

---

## 3. Stripe Transfer

### Step-by-Step Stripe Connect Transfer

**Option A: New Stripe Account (Recommended)**
This is the cleanest approach. The acquirer creates a new Stripe Connect account and reconfigures the platform.

1. **Create Stripe Account**
   - Register at stripe.com
   - Complete business verification (KYC)
   - Activate Stripe Connect (Standard or Express)
   - Switch to live mode

2. **Update Environment Variables**
   ```
   STRIPE_SECRET_KEY=sk_live_new_account_key
   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_new_account_key
   STRIPE_WEBHOOK_SECRET=whsec_new_webhook_secret
   ```

3. **Configure Webhook**
   - Endpoint: `https://yourdomain.com/api/webhooks/stripe`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`
   - Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`

4. **Test Payment Flow**
   - Run a test checkout with a real card
   - Verify the payment appears in the Stripe dashboard
   - Verify the webhook is received and processed
   - Verify the order is created in the database

5. **Re-onboard Sellers**
   - Each seller must create a new Stripe Connect account under the new platform
   - This is required because Stripe Connect accounts are tied to the platform account

**Option B: Transfer Existing Stripe Account**
1. Contact Stripe Support to initiate a platform account transfer
2. Both parties must complete verification
3. Stripe will migrate the account, including all connected accounts and payment history
4. This process takes 2–4 weeks and requires Stripe's approval

### Stripe Transfer Checklist
- [ ] New Stripe account created and verified
- [ ] Stripe Connect activated
- [ ] Live mode enabled
- [ ] API keys updated in environment variables
- [ ] Webhook endpoint configured with new URL
- [ ] Webhook signing secret updated
- [ ] Test payment processed successfully
- [ ] Test webhook received and processed
- [ ] All sellers re-onboarded (if using Option A)
- [ ] Previous Stripe account deactivated or set to read-only

---

## 4. Supabase Transfer

### Step-by-Step Supabase Transfer

**Option A: New Supabase Project (Recommended)**
This is the cleanest approach. The acquirer creates a new Supabase project and migrates the data.

1. **Create Supabase Project**
   - Create a new project at supabase.com
   - Choose the same region as the original project for minimal latency
   - Set a strong database password
   - Note the project URL and API keys

2. **Deploy Database Schema**
   ```bash
   # Execute the core schema
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-schema.sql

   # Execute migration files in order
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-rls-migration.sql
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-performance-migration.sql
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-payment-migration.sql
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-devops-migration.sql
   psql -h db.your-project.supabase.co -U postgres -f docs/supabase-database-optimization-migration.sql
   ```

3. **Migrate Data** (if preserving existing data)
   ```bash
   # Export from old project
   pg_dump -h db.old-project.supabase.co -U postgres > backup.sql

   # Import to new project
   psql -h db.your-project.supabase.co -U postgres -f backup.sql
   ```

4. **Configure Storage**
   - Create a public bucket named `market-assets`
   - Set storage policies for public read access
   - Upload product images (or use the seed script to generate demo data)

5. **Update Environment Variables**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-new-service-role-key
   ```

6. **Seed Demo Data**
   ```bash
   npm run seed:demo
   ```

**Option B: Transfer Existing Supabase Project**
1. Contact Supabase Support to initiate a project transfer
2. Both parties must have Supabase accounts
3. Supabase will transfer the project, including all data, auth users, and storage
4. This process takes 1–3 business days

### Supabase Transfer Checklist
- [ ] New Supabase project created
- [ ] Database schema deployed (all 6 migration files)
- [ ] RLS policies verified
- [ ] Storage bucket created and configured
- [ ] Demo data seeded successfully
- [ ] Environment variables updated
- [ ] Auth configuration verified (email templates, redirect URLs)
- [ ] Database backups configured
- [ ] Connection pooling enabled (PgBouncer)

---

## 5. Repository Transfer

### Step-by-Step Repository Transfer

**Option A: GitHub Repository Transfer**
1. Navigate to the repository Settings → Danger Zone → Transfer ownership
2. Enter the acquirer's GitHub organization name
3. The acquirer accepts the transfer
4. All issues, pull requests, and history are preserved
5. Update any GitHub Actions secrets with new credentials

**Option B: Fork and Rebase**
1. The acquirer forks the repository
2. All branches and history are preserved
3. The acquirer can then archive or delete the original repository
4. Update the remote URL in local clones: `git remote set-url origin https://github.com/new-org/vendortrack.git`

**Option C: Export and Import**
1. Create a bare clone: `git clone --bare https://github.com/seller/vendortrack.git`
2. Push to the new repository: `cd vendortrack.git && git push --mirror https://github.com/acquirer/vendortrack.git`
3. All branches, tags, and history are preserved

### Repository Transfer Checklist
- [ ] Repository transferred or forked
- [ ] All branches and history preserved
- [ ] GitHub Actions secrets updated with new credentials
- [ ] GitHub Actions workflows re-enabled
- [ ] Branch protection rules configured
- [ ] Team access configured
- [ ] Webhook endpoints updated (if using external CI/CD)
- [ ] `.env.example` and `.env.production.example` are current
- [ ] No secrets in git history (verified with `gitleaks detect`)

---

## 6. Monitoring Transfer

### Step-by-Step Monitoring Transfer

**Sentry**
1. Create a new Sentry organization (or transfer the existing one)
2. Create a new project for VendorTrack
3. Update `SENTRY_DSN` in environment variables
4. Verify error tracking is working (trigger a test error)
5. Configure alert rules (email, Slack, PagerDuty)

**Prometheus + Grafana**
1. Deploy the monitoring stack: `docker compose -f docker-compose.monitoring.yml up -d`
2. Configure Prometheus scrape target to point to the new Vercel deployment
3. Import Grafana dashboards from the monitoring configuration
4. Configure alerting rules in Alertmanager
5. Update PagerDuty and Slack integration keys

**OpenTelemetry**
1. Set up an OpenTelemetry collector (or use a managed service like Honeycomb or Lightstep)
2. Update `OTEL_EXPORTER_OTLP_ENDPOINT` in environment variables
3. Verify traces are being collected

### Monitoring Transfer Checklist
- [ ] Sentry organization created or transferred
- [ ] Sentry DSN updated in environment variables
- [ ] Test error tracked successfully
- [ ] Prometheus deployed and scraping metrics
- [ ] Grafana dashboards imported and displaying data
- [ ] Alertmanager configured with new PagerDuty/Slack keys
- [ ] OpenTelemetry endpoint configured
- [ ] Traces being collected and displayed
- [ ] Health endpoint (`/api/health`) returning healthy status
- [ ] All 10 alert rules active and firing correctly

---

## 7. Secrets Rotation

### Step-by-Step Secrets Rotation

After the transfer is complete, **all secrets must be rotated** to ensure the previous owner cannot access the platform.

**Immediate Rotation (Day 1)**
| Secret | Rotation Method |
|--------|----------------|
| Supabase Service Role Key | Regenerate in Supabase Dashboard → Settings → API |
| Supabase Anon Key | Regenerate in Supabase Dashboard → Settings → API |
| Stripe Secret Key | Roll in Stripe Dashboard → Developers → API Keys → Roll key |
| Stripe Webhook Secret | Update webhook endpoint in Stripe Dashboard, copy new signing secret |
| Cron Secret | Generate a new random string: `openssl rand -hex 32` |
| Sentry DSN | Create a new project in Sentry, use the new DSN |

**Secondary Rotation (Day 2–3)**
| Secret | Rotation Method |
|--------|----------------|
| Google Gemini API Key | Create a new API key in Google Cloud Console, restrict to Gemini API |
| Redis URL | Provision a new Redis instance or change the password |
| CORS Origins | Update `ALLOWED_ORIGINS` to the new domain |
| Vercel Deploy Hooks | Regenerate in Vercel Dashboard → Settings → Git |
| GitHub Tokens | Regenerate any personal access tokens or deploy keys |

### Secrets Rotation Checklist
- [ ] All Supabase keys regenerated
- [ ] Stripe API keys rolled
- [ ] Stripe webhook secret updated
- [ ] Cron secret regenerated
- [ ] Sentry DSN updated
- [ ] Google Gemini API key created
- [ ] Redis URL or password changed
- [ ] CORS origins updated to new domain
- [ ] Vercel deploy hooks regenerated
- [ ] GitHub tokens regenerated
- [ ] All old secrets invalidated and verified
- [ ] Gitleaks scan passes with zero findings
- [ ] Application tested with all new secrets

---

## 8. Administrative Access

### Granting Admin Access

Admin privileges are enforced at the database layer to prevent frontend exploits. After the transfer, the acquirer must grant admin access to their own account:

```sql
-- After creating your account through the normal signup flow,
-- run this SQL in the Supabase SQL Editor:
UPDATE profiles SET is_admin = true WHERE email = 'your-admin@email.com';
```

### Admin Access Verification
- [ ] Admin account created through normal signup
- [ ] Admin privileges granted via SQL
- [ ] Admin dashboard accessible at `/admin-dashboard`
- [ ] All admin features functional (users, orders, refunds, products)
- [ ] Previous admin accounts deactivated or removed

---

## 9. Post-Transfer Verification

### Complete Verification Checklist

**Infrastructure**
- [ ] Application loads at the new domain
- [ ] Health endpoint returns healthy: `curl https://yourdomain.com/api/health`
- [ ] SSL certificate is valid and auto-renewing
- [ ] DNS records are correct and propagated

**Authentication**
- [ ] User signup works
- [ ] User login works
- [ ] Password reset works
- [ ] Admin dashboard accessible
- [ ] Seller dashboard accessible
- [ ] Buyer dashboard accessible

**Payments**
- [ ] Stripe checkout works with a live card
- [ ] Webhook is received and processed
- [ ] Order is created in the database
- [ ] Seller receives payout (Stripe Connect)
- [ ] Refund workflow works

**Data**
- [ ] Demo data is seeded and visible
- [ ] Product search returns results
- [ ] Product detail pages load
- [ ] Cart and checkout flow works
- [ ] Order chat works

**Monitoring**
- [ ] Sentry is tracking errors
- [ ] Prometheus is collecting metrics
- [ ] Grafana dashboards are displaying data
- [ ] Alerts are firing to PagerDuty/Slack
- [ ] Health check cron job is running

**Security**
- [ ] All old secrets are invalidated
- [ ] Gitleaks scan passes with zero findings
- [ ] Rate limiting is active
- [ ] Security headers are present
- [ ] RLS policies are enforced

**Operations**
- [ ] Database backups are configured
- [ ] Backup restore tested
- [ ] CI/CD pipeline is working
- [ ] Feature flags are configurable
- [ ] Background jobs are processing

### Automated Verification
```bash
# Run all verification scripts
npm run verify:deployment    # Deployment verification (9 categories)
npm run verify               # Production verification (8 categories)
npm run verify:acceptance    # Acceptance tests (8 workflow suites)
```

---

## 10. Transfer Timeline

| Day | Activity | Owner |
|-----|----------|-------|
| **Day 1** | Repository transfer, environment variable setup, Supabase project creation | Acquirer |
| **Day 2** | Database schema deployment, data migration, demo data seeding | Acquirer |
| **Day 3** | Stripe Connect setup, webhook configuration, payment testing | Acquirer |
| **Day 4** | Monitoring stack setup, alerting configuration, DNS transfer | Acquirer |
| **Day 5** | Secrets rotation, final verification, acceptance testing, go-live | Acquirer |

**Total Transfer Time**: 2–5 business days (depending on DNS propagation and Stripe verification)

---

*Document Version: 1.0 | Date: 2026-07-31 | Classification: Confidential — For Acquisition Review Only*
