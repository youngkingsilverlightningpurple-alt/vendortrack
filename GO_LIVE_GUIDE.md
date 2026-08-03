# VendorTrack — Go-Live Guide

> Complete guide for deploying and launching VendorTrack in production.

---

## Prerequisites

Before you begin, ensure you have:

- A **Supabase** account with a project created
- A **Stripe** account with Connect enabled
- A **Vercel** account for deployment
- A **Redis** instance (optional — LRU fallback is available)
- A **Google AI** API key for Gemini (optional — AI features degrade gracefully)
- Node.js 18+ and npm installed locally

---

## Step 1: Clone and Configure

```bash
# Clone the repository
git clone <repository-url>
cd vendortrack

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

### Required Environment Variables

Edit `.env.local` with your production credentials:

```bash
# Supabase (Required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe (Required for payments)
STRIPE_SECRET_KEY=sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Cron Authentication (Required)
CRON_SECRET=your-random-secret-string

# Optional
REDIS_URL=redis://default:password@host:6379
GEMINI_API_KEY=AIza...
SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

---

## Step 2: Set Up Database

### Option A: Supabase Dashboard

1. Go to your Supabase project dashboard
2. Open the **SQL Editor**
3. Run the schema files in order:
   - `docs/supabase-schema.sql` — Core schema
   - `docs/supabase-rls-migration.sql` — RLS policies
   - `docs/supabase-performance-migration.sql` — Performance indexes
   - `docs/supabase-payment-migration.sql` — Payment tables
   - `docs/supabase-devops-migration.sql` — DevOps tables

### Option B: Command Line

```bash
# Using Supabase CLI
supabase db push --db-url "postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres"
```

---

## Step 3: Configure Stripe

### 3.1 Create Stripe Connect Account

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Enable **Stripe Connect** in Settings
3. Set up **Destination Charges** mode

### 3.2 Create Webhook Endpoint

1. Go to **Developers → Webhooks**
2. Click **Add endpoint**
3. URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `payment_intent.succeeded`
   - `charge.refunded`
   - `payment_intent.payment_failed`
   - `charge.dispute.created`
5. Copy the **Signing secret** to `STRIPE_WEBHOOK_SECRET`

### 3.3 Test Mode First

Start with test mode (`sk_test_*` keys) and verify all payment flows work before switching to live mode.

---

## Step 4: Seed Demo Data

```bash
# Create demo accounts and marketplace data
npx tsx scripts/seed-demo.ts

# Verify the data was created
npx tsx scripts/production-verify.ts
```

### Demo Accounts Created

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@vendortrack.demo | DemoAdmin2024! |
| Seller | seller@vendortrack.demo | DemoSeller2024! |
| Seller | eco@vendortrack.demo | DemoEco2024! |
| Seller | luxe@vendortrack.demo | DemoLuxe2024! |
| Buyer | buyer@vendortrack.demo | DemoBuyer2024! |
| Buyer | buyer2@vendortrack.demo | DemoBuyer22024! |

---

## Step 5: Deploy to Vercel

### Option A: Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel deploy --prod

# Verify
curl https://your-domain.vercel.app/api/health
```

### Option B: Vercel Dashboard

1. Import the repository from GitHub
2. Configure environment variables in the Vercel dashboard
3. Deploy

### Option C: Docker

```bash
# Build the Docker image
docker build -t vendortrack:latest .

# Run with Docker Compose
docker compose up -d

# Verify
curl http://localhost:9002/api/health
```

---

## Step 6: Verify Deployment

```bash
# Run all verification scripts
npm run verify:deployment    # Check infrastructure configuration
npm run verify               # Production verification
npm run verify:acceptance    # End-to-end acceptance tests

# Check health endpoint
curl https://your-domain.com/api/health

# Expected response:
# {
#   "status": "healthy",
#   "version": "0.1.0",
#   "checks": {
#     "database": { "status": "healthy" },
#     "redis": { "status": "degraded" },  // OK if using LRU fallback
#     "memory": { "status": "healthy" },
#     "env": { "status": "healthy" }
#   }
# }
```

---

## Step 7: Configure Cron Jobs

Vercel automatically configures cron jobs from `vercel.json`. Verify:

| Job | Schedule | Endpoint |
|-----|----------|----------|
| Health Check | Every 5 minutes | `/api/cron/health-check` |
| Cache Warming | Every 6 hours | `/api/cron/cache-warming` |
| Reconciliation | Daily at 2 AM | `/api/cron/reconciliation` |

All cron endpoints require `CRON_SECRET` in the Authorization header.

---

## Step 8: Set Up Monitoring (Optional)

### Sentry

```bash
# Set SENTRY_DSN in environment variables
# Sentry will automatically capture errors and performance data
```

### Prometheus + Grafana

```bash
# Start the monitoring stack
docker compose -f docker-compose.monitoring.yml up -d

# Access:
# Prometheus: http://localhost:9090
# Grafana: http://localhost:3000
# Alertmanager: http://localhost:9093
```

---

## Step 9: Test Everything

### Buyer Flow
1. Log in as `buyer@vendortrack.demo`
2. Browse products → Add to cart → Checkout → View order
3. Test with Stripe test card: `4242 4242 4242 4242`

### Seller Flow
1. Log in as `seller@vendortrack.demo`
2. View dashboard → Manage products → Process orders
3. Test AI description generation

### Admin Flow
1. Log in as `admin@vendortrack.demo`
2. View Mission Control → Manage users → Process refunds
3. Review audit logs and health status

---

## Step 10: Go Live

Follow the **GO_LIVE_CHECKLIST.md** for the complete launch procedure.

Key steps:
1. Switch Stripe to live mode (`sk_live_*` keys)
2. Verify all workflows with real payments
3. Monitor error rates and performance
4. Have rollback plan ready

---

## Maintenance

### Reset Demo Data

```bash
# Reset all demo data
npx tsx scripts/seed-reset.ts

# Re-seed with fresh data
npx tsx scripts/seed-demo.ts
```

### Database Backup

```bash
# Full backup
./scripts/backup.sh full

# Database only
./scripts/backup.sh db

# Redis only (if configured)
./scripts/backup.sh redis
```

### Key Rotation

```bash
# Rotate all API keys
./scripts/rotate-keys.sh
```

### Health Monitoring

```bash
# Check health endpoint
curl https://your-domain.com/api/health

# Check performance metrics
curl https://your-domain.com/api/performance
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Health endpoint returns 503 | Check database connection and environment variables |
| Stripe webhooks not received | Verify webhook URL and signing secret |
| Demo accounts not created | Run `npx tsx scripts/seed-demo.ts` |
| Search not returning results | Verify products exist and search API is accessible |
| Payment fails | Verify Stripe keys are correct and in the right mode |
| High memory usage | Check for memory leaks, increase container resources |
| Slow response times | Check database indexes, enable Redis caching |

---

## Quick Reference

| URL | Description |
|-----|-------------|
| `/` | Landing page |
| `/login` | Login page |
| `/signup` | Registration page |
| `/products` | Product marketplace |
| `/buyer-orders` | Buyer order history |
| `/cart` | Shopping cart |
| `/checkout` | Checkout page |
| `/seller-dashboard` | Seller dashboard |
| `/admin-dashboard` | Admin dashboard |
| `/api/health` | Health check endpoint |
| `/api/performance` | Performance metrics |
| `/api/payment-health` | Payment health status |
