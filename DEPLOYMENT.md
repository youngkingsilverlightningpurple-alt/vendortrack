# DEPLOYMENT.md -- VendorTrack Production Deployment Guide

This document provides comprehensive instructions for deploying VendorTrack, a Next.js multi-vendor marketplace application with Supabase, Stripe, Redis, and Gemini AI. Follow each section in order for a successful production deployment.

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Prerequisites](#2-prerequisites)
3. [Environment Configuration](#3-environment-configuration)
4. [Docker Deployment](#4-docker-deployment)
5. [Vercel Deployment](#5-vercel-deployment)
6. [Supabase Setup](#6-supabase-setup)
7. [Redis Setup](#7-redis-setup)
8. [Stripe Configuration](#8-stripe-configuration)
9. [Background Workers](#9-background-workers)
10. [Post-Deployment Verification](#10-post-deployment-verification)
11. [Rollback Procedures](#11-rollback-procedures)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Quick Start

Deploy VendorTrack to production in a single pass using the commands below. This guide assumes you are deploying to Vercel with Supabase (managed), Upstash Redis, and Stripe in live mode. For Docker-based self-hosted deployments, skip to Section 4.

```bash
# 1. Clone the repository
git clone https://github.com/your-org/vendortrack.git
cd vendortrack

# 2. Install dependencies
npm ci

# 3. Copy and configure environment variables
cp .env.production.example .env.production
# Edit .env.production with your production credentials (see Section 3)

# 4. Validate environment configuration
npx tsx -e "import { validateEnvironment } from './src/lib/env'; const r = validateEnvironment(); r.forEach(v => console.log(v.status, v.name, v.message))"

# 5. Build the application
npm run build

# 6. Deploy to Vercel
vercel --prod

# 7. Run the health check
curl -sf https://your-domain.com/api/health | jq .
```

For Docker deployments, replace steps 5 through 7 with:

```bash
# Build and start all services
docker compose up -d --build

# Verify health
docker compose exec app wget -qO- http://localhost:9002/api/health
```

After the quick start, you must complete the remaining sections (Supabase setup, Stripe webhooks, Redis configuration) to have a fully functional deployment. The quick start gets the application running, but the integrations require additional configuration described in the sections that follow.

---

## 2. Prerequisites

Before deploying VendorTrack, ensure you have the following accounts, tools, and access configured. Each prerequisite is required for a specific subsystem of the application.

### Required Accounts

| Service | Purpose | Sign-Up URL |
|---------|---------|-------------|
| Vercel | Application hosting, serverless functions, cron jobs | https://vercel.com/signup |
| Supabase | PostgreSQL database, authentication, Row Level Security | https://supabase.com/dashboard |
| Stripe | Payment processing, Stripe Connect, webhooks | https://dashboard.stripe.com/register |
| Upstash Redis | Distributed caching (recommended for Vercel) | https://upstash.com |
| Sentry | Error tracking, performance monitoring | https://sentry.io/signup |
| Google AI Studio | Gemini API key for AI product descriptions | https://aistudio.google.com/apikey |

### Local Development Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 20.x LTS | Runtime and build environment |
| npm | 10.x | Package manager (npm ci is used in builds) |
| Docker | 24.x+ | Container builds and local development |
| Docker Compose | 2.x+ | Multi-container orchestration |
| Git | 2.x+ | Version control |

### Verification Commands

```bash
# Verify Node.js version (must be 20.x)
node --version

# Verify Docker is running
docker info --format '{{.ServerVersion}}'

# Verify Docker Compose
docker compose version

# Verify npm
npm --version
```

### Account Setup Checklist

- [ ] Vercel account created with a team (Pro plan recommended for cron jobs)
- [ ] Supabase project created (Pro plan recommended for connection pooling)
- [ ] Stripe account in live mode with Connect enabled
- [ ] Upstash Redis instance created (or local Redis for Docker deployments)
- [ ] Sentry project created with Next.js SDK selected
- [ ] Gemini API key generated from Google AI Studio
- [ ] Domain name configured with DNS access for custom domain setup

---

## 3. Environment Configuration

VendorTrack uses a strict environment variable validation system. The application will fail to start if any required variable is missing or invalid. This fail-fast behavior prevents silent security failures in production.

### Environment Variable Reference

| Variable | Required | Server-Only | Description |
|----------|----------|-------------|-------------|
| `NODE_ENV` | Yes | Yes | Set to `production` for production deployments |
| `PORT` | No | Yes | Application port (default: `9002`) |
| `LOG_LEVEL` | No | Yes | Server log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `NEXT_PUBLIC_LOG_LEVEL` | No | No | Client log level (default: `warn`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | No | Supabase project URL (e.g. `https://xyz.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | No | Supabase anon key (respects RLS policies) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | Supabase service role key (bypasses RLS -- never expose to client) |
| `STRIPE_SECRET_KEY` | Yes | Yes | Stripe secret key (live: `sk_live_...`, test: `sk_test_...`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes | No | Stripe publishable key (live: `pk_live_...`, test: `pk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Yes | Stripe webhook signing secret (`whsec_...`) |
| `REDIS_URL` | No | Yes | Redis connection URL (e.g. `redis://host:6379`) |
| `REDIS_PASSWORD` | No | Yes | Redis authentication password |
| `GEMINI_API_KEY` | No | Yes | Google Gemini API key for AI features (degrades gracefully if absent) |
| `SENTRY_DSN` | No | Yes | Sentry Data Source Name for error tracking |
| `SENTRY_ENVIRONMENT` | No | Yes | Environment label in Sentry (default: `production`) |
| `SENTRY_RELEASE` | No | Yes | Release identifier in Sentry (default: package version) |
| `SENTRY_TRACES_SAMPLE_RATE` | No | Yes | Tracing sample rate 0.0-1.0 (default: `0.1`) |
| `SENTRY_PROFILES_SAMPLE_RATE` | No | Yes | Profiling sample rate 0.0-1.0 (default: `0.1`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | Yes | OpenTelemetry collector endpoint |
| `OTEL_SERVICE_NAME` | No | Yes | Service name for traces (default: `vendortrack`) |
| `CORS_ALLOWED_ORIGINS` | No | Yes | Comma-separated allowed origins |
| `COOKIE_SECURE` | No | Yes | Set to `true` in production for secure cookies |
| `COOKIE_HTTPONLY` | No | Yes | Set to `true` to prevent client-side cookie access |
| `COOKIE_SAMESITE` | No | Yes | Cookie SameSite policy (default: `lax`) |
| `WORKER_CONCURRENCY` | No | Yes | Max concurrent background jobs (default: `5`) |
| `WORKER_POLL_INTERVAL_MS` | No | Yes | Worker polling interval in ms (default: `5000`) |
| `DB_STATEMENT_TIMEOUT_MS` | No | Yes | SQL statement timeout (default: `30000`) |
| `DB_IDLE_TIMEOUT_MS` | No | Yes | Connection idle timeout (default: `10000`) |
| `DB_MAX_CONNECTIONS` | No | Yes | Max database connections (default: `20`) |
| `DB_POOL_SIZE` | No | Yes | Connection pool size (default: `10`) |
| `CRON_SECRET` | No | Yes | Bearer token for cron job authentication |

### Feature Flag Overrides

Feature flags can be overridden via environment variables using the `FEATURE_` prefix. These override the default values defined in the codebase and are useful for emergency kill switches.

| Variable | Default | Description |
|----------|---------|-------------|
| `FEATURE_STRIPE_CONNECT` | `true` | Enable Stripe Connect for multi-vendor payments |
| `FEATURE_AUTO_REFUND_ON_FAILURE` | `true` | Auto-refund on system failure (kill switch enabled) |
| `FEATURE_AI_PRODUCT_DESCRIPTIONS` | `true` | Enable AI-generated product descriptions |
| `FEATURE_REDIS_CACHING` | `true` | Use Redis for distributed caching |
| `FEATURE_SENTRY_ERROR_TRACKING` | `true` | Enable Sentry error tracking |

### .env.production.example Walkthrough

The `.env.production.example` file serves as the template for production configuration. Copy it to `.env.production` and fill in all values:

```bash
cp .env.production.example .env.production
```

Key points when filling in values:

- **Never commit `.env.production`** to version control. The `.gitignore` file excludes it.
- **Server-only variables** (marked `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GEMINI_API_KEY`) must never have a `NEXT_PUBLIC_` prefix. The application validates this at startup and will refuse to start if a server-only secret is exposed to the client bundle.
- **Placeholder detection**: The validation system rejects values that match common placeholder patterns (`your-`, `changeme`, `xxx`, `placeholder`). Ensure all values are real credentials.
- **Format validation**: Stripe keys must match `sk_test_` or `sk_live_` patterns. Supabase URLs must match `https://*.supabase.co`. Webhook secrets must match `whsec_`.

### Secret Management

For production deployments, never store secrets in plain-text files. Use a secrets management solution:

- **Vercel**: Use the Vercel dashboard or CLI (`vercel env add`) to set environment variables. Vercel encrypts all secrets at rest.
- **Docker**: Use Docker secrets or an external vault (HashiCorp Vault, AWS Secrets Manager). Pass secrets via environment variables at runtime, not in the Dockerfile.
- **CI/CD**: Use GitHub Actions secrets, or equivalent, for build-time variables. Never echo secrets in logs.

---

## 4. Docker Deployment

VendorTrack provides a multi-stage Dockerfile optimized for production, along with Docker Compose configurations for both development and production environments.

### Building Images

The production Dockerfile uses a three-stage build process to minimize image size and attack surface:

```bash
# Build the production image
docker build -t vendortrack:latest .

# Build with a specific tag
docker build -t vendortrack:v0.1.0 .

# Build the worker image
docker build -f Dockerfile.worker -t vendortrack-worker:latest .
```

The build stages are:

1. **deps** -- Installs all npm dependencies using `npm ci --ignore-scripts`
2. **builder** -- Copies dependencies and source, runs `npm run build` to produce the Next.js standalone output
3. **runner** -- Copies only the built artifacts (`standalone`, `static`, `public`, `server`) and runs as a non-root user (`nextjs`, UID 1001)

The final image is based on `node:20-alpine` and does not include source code, dev dependencies, or build tools. The application runs on port 9002 using the Next.js standalone server.

### Production Docker Compose

The `docker-compose.yml` defines three services:

```bash
# Start all services in detached mode
docker compose up -d

# Start with forced rebuild
docker compose up -d --build

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove volumes (resets Redis data)
docker compose down -v
```

#### Service Architecture

| Service | Image | Port | Memory Limit | CPU Limit |
|---------|-------|------|-------------|-----------|
| `app` | vendortrack (Dockerfile) | 9002 | 512M | 1.0 |
| `redis` | redis:7-alpine | 6379 | 512M | -- |
| `worker` | vendortrack-worker (Dockerfile.worker) | -- | 512M | 0.5 |

### Development Docker Compose

The `docker-compose.dev.yml` provides a hot-reload development environment with volume mounts and a Redis Commander web UI:

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up

# Or use the npm script
npm run docker:dev
```

Development features include:
- Source code mounted as a volume for hot-reload
- Node.js debugger exposed on port 9229
- Redis Commander web UI on port 8081
- Debug-level logging enabled

### Health Checks

All services include health checks:

- **app**: HTTP GET to `http://localhost:9002/api/health` every 30 seconds (10s timeout, 3 retries, 40s start period)
- **redis**: `redis-cli ping` every 10 seconds (5s timeout, 5 retries)
- **worker**: Basic process check every 60 seconds (10s timeout, 3 retries)

```bash
# Check health status of all services
docker compose ps

# Check app health specifically
docker inspect --format='{{.State.Health.Status}}' vendortrack-app
```

### Resource Limits

The production Docker Compose enforces resource limits to prevent any single service from consuming excessive resources:

- **app**: 512M memory limit, 256M reservation, 1.0 CPU limit, 0.25 CPU reservation
- **worker**: 512M memory limit, 128M reservation, 0.5 CPU limit
- **redis**: 512M memory limit, 128M reservation, configured with `maxmemory 256mb` and `allkeys-lru` eviction policy

Adjust these limits based on your infrastructure capacity. For high-traffic deployments, increase the app memory limit to 1G and the worker memory limit to 768M.

### Redis Persistence

The production Redis configuration enables persistence:

- RDB snapshots every 60 seconds (if 1000+ keys changed) and every 5 minutes (if 100+ keys changed)
- AOF (Append Only File) enabled with `everysec` fsync policy
- Data stored in a named Docker volume (`redis-data`)

---

## 5. Vercel Deployment

Vercel is the recommended hosting platform for VendorTrack due to its native Next.js support, serverless functions, and built-in cron job support.

### Step-by-Step Vercel Setup

1. **Install the Vercel CLI**:

   ```bash
   npm i -g vercel
   ```

2. **Link the project**:

   ```bash
   vercel link
   ```

   Follow the prompts to select your Vercel team and project name.

3. **Configure environment variables**:

   ```bash
   # Set each required variable
   vercel env add NEXT_PUBLIC_SUPABASE_URL production
   vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
   vercel env add SUPABASE_SERVICE_ROLE_KEY production
   vercel env add STRIPE_SECRET_KEY production
   vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
   vercel env add STRIPE_WEBHOOK_SECRET production
   vercel env add GEMINI_API_KEY production
   vercel env add SENTRY_DSN production
   vercel env add CRON_SECRET production

   # Set optional variables
   vercel env add REDIS_URL production
   vercel env add SENTRY_ENVIRONMENT production
   vercel env add COOKIE_SECURE production
   ```

   Alternatively, set all variables at once via the Vercel dashboard under Settings > Environment Variables.

4. **Deploy to production**:

   ```bash
   vercel --prod
   ```

5. **Verify the deployment**:

   ```bash
   curl -sf https://your-app.vercel.app/api/health | jq .
   ```

### vercel.json Configuration

The `vercel.json` file is pre-configured with the following settings:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci",
  "regions": ["iad1", "sfo1"],
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-store, max-age=0" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/_next/static/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ],
  "crons": [
    { "path": "/api/cron/cache-warming", "schedule": "0 */6 * * *" },
    { "path": "/api/cron/reconciliation", "schedule": "0 2 * * *" },
    { "path": "/api/cron/health-check", "schedule": "*/5 * * * *" }
  ]
}
```

### Cron Jobs

VendorTrack uses three Vercel cron jobs to maintain system health:

| Cron Job | Schedule | Endpoint | Purpose |
|----------|----------|----------|---------|
| Cache Warming | Every 6 hours | `/api/cron/cache-warming` | Pre-populates product and category caches |
| Reconciliation | Daily at 2 AM | `/api/cron/reconciliation` | Reconciles payment ledger with Stripe |
| Health Check | Every 5 minutes | `/api/cron/health-check` | Monitors database connectivity and latency |

All cron endpoints verify the `CRON_SECRET` environment variable via the `Authorization: Bearer` header. If `CRON_SECRET` is set, requests without the correct token receive a 401 response. In non-production environments without `CRON_SECRET`, cron requests are rejected.

**Important**: Vercel cron jobs require a Pro plan. On the Hobby plan, you must use an external cron service (e.g., cron-job.org, EasyCron) to call these endpoints.

### Custom Domains and SSL

1. Navigate to your Vercel project dashboard > Settings > Domains
2. Add your custom domain (e.g., `vendortrack.app`)
3. Configure DNS records as instructed by Vercel (typically a CNAME or A record)
4. SSL is automatically provisioned by Vercel via Let's Encrypt
5. Verify HTTPS is working by checking the `Strict-Transport-Security` header:

   ```bash
   curl -sI https://vendortrack.app | grep -i strict
   ```

### Regions

The application is configured to deploy to `iad1` (US East) and `sfo1` (US West). Adjust the `regions` array in `vercel.json` based on your target audience. For European users, add `eu-west-1` (Dublin). For Asia-Pacific, add `sin1` (Singapore).

---

## 6. Supabase Setup

VendorTrack uses Supabase for PostgreSQL database hosting, authentication, and Row Level Security. The schema is designed for financial integrity with atomic operations.

### Database Schema

The core schema includes the following tables:

| Table | Purpose | Key Constraints |
|-------|---------|----------------|
| `profiles` | User accounts, roles, seller status | FK to `auth.users`, unique email, role CHECK constraint |
| `products` | Product listings | FK to `profiles(seller_id)`, positive price CHECK, non-negative stock CHECK |
| `payment_sessions` | Payment session tracking | FK to `profiles(user_id)`, status CHECK, expiry timestamp |
| `orders` | Order records | FK to `profiles`, `products`, unique `payment_intent_id`, unique `trace_id` |
| `audit_logs` | Audit trail for all financial events | Trace ID, severity CHECK, JSONB payload |
| `processed_events` | Webhook idempotency tracking | Primary key is Stripe event ID |
| `background_jobs` | Background job queue | Priority, status, dedup key, exponential backoff fields |

### Applying Migrations

Run the schema migrations in order. The SQL files are located in the `docs/` directory:

```bash
# 1. Core schema (tables, RPC, RLS)
# Apply via Supabase Dashboard > SQL Editor
# Paste the contents of docs/supabase-schema.sql

# 2. RLS migration (additional policies)
# Paste the contents of docs/supabase-rls-migration.sql

# 3. Performance indexes and optimization
# Paste the contents of docs/supabase-performance-migration.sql

# 4. Payment-specific indexes
# Paste the contents of docs/supabase-payment-migration.sql

# 5. Database optimization
# Paste the contents of docs/supabase-database-optimization-migration.sql
```

Alternatively, use the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push migrations
supabase db push
```

### Row Level Security (RLS)

RLS is enabled on all user-facing tables. The key policies are:

- **profiles**: Readable by everyone; users can only update their own non-privileged fields (role and admin status cannot be self-modified)
- **products**: Readable by everyone; sellers can only manage their own products (verified via `auth.uid() = seller_id`)
- **orders**: Visible only to the buyer, seller, or admin involved in the order

The `SUPABASE_SERVICE_ROLE_KEY` bypasses all RLS policies and is used only by server-side code (API routes, background workers). Never expose this key to the client.

### Connection Pooling

Supabase provides connection pooling via PgBouncer on port 6543. For production deployments:

- Enable **Transaction Mode** pooling in the Supabase dashboard (Project Settings > Database > Connection Pooling)
- Use the pooled connection string (port 6543) for the `SUPABASE_SERVICE_ROLE_KEY` client
- The `DB_POOL_SIZE` (default: 10) and `DB_MAX_CONNECTIONS` (default: 20) environment variables control connection behavior
- The `DB_STATEMENT_TIMEOUT_MS` (default: 30000) prevents long-running queries from blocking connections

### Backups

Supabase Pro plan includes automatic daily backups. For additional safety:

1. **Point-in-Time Recovery (PITR)**: Enabled on Pro plan, allows restoring to any point within the last 7 days
2. **Manual backups**: Use `pg_dump` via the Supabase CLI:

   ```bash
   supabase db dump --project-ref your-project-ref > backup_$(date +%Y%m%d).sql
   ```

3. **Before schema migrations**: Always create a manual backup before applying new migrations

---

## 7. Redis Setup

VendorTrack uses Redis for distributed caching, with a fallback to in-memory LRU cache when Redis is unavailable. The caching layer is designed to cache aggressively while invalidating precisely, and to never cache financial data beyond 60 seconds.

### Upstash Redis (Recommended for Vercel)

Upstash provides a serverless Redis-compatible service that works over HTTP, making it ideal for Vercel deployments where persistent TCP connections are not available.

1. **Create an Upstash Redis instance**:
   - Navigate to https://upstash.com and create a new Redis database
   - Select the region closest to your Vercel deployment region
   - Enable the "Eviction" policy (allkeys-lru)

2. **Get the connection URL**:
   - From the Upstash dashboard, copy the Redis URL (format: `redis://default:password@us1-xxx-xxxxx.upstash.io:6379`)
   - For REST API mode, copy the UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN

3. **Configure environment variables**:

   ```bash
   # For TCP connection
   REDIS_URL=redis://default:your-password@us1-xxx.upstash.io:6379
   REDIS_PASSWORD=your-password

   # For REST API mode (preferred for Vercel)
   # UPSTASH_REDIS_REST_URL=https://us1-xxx.upstash.io
   # UPSTASH_REDIS_REST_TOKEN=your-token
   ```

### Local Redis (Docker)

For Docker deployments, Redis is included in the `docker-compose.yml`:

```yaml
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

The Redis instance is configured with:
- 256MB memory limit with LRU eviction
- RDB persistence (snapshot every 60s if 1000+ keys changed, every 300s if 100+ keys changed)
- AOF persistence with every-second fsync
- Health check via `redis-cli ping`

### Connection Configuration

The Redis client in VendorTrack supports three modes:

1. **Redis (production)** -- Full persistence, pub/sub invalidation
2. **Upstash REST (serverless)** -- HTTP-based Redis for edge/Vercel deployments
3. **In-memory LRU (development/fallback)** -- No external dependencies, automatic fallback

If `REDIS_URL` is not set, the application automatically falls back to the in-memory LRU cache. This ensures the application starts even without Redis, though caching will not be shared across instances.

### Caching Strategy

All cache keys are prefixed with `vt:` (VendorTrack). TTLs are enforced at the cache layer:

| Data Type | TTL | Cache Key Pattern |
|-----------|-----|-------------------|
| Product listings | 5 minutes | `vt:products:listing:*` |
| Product detail | 2 minutes | `vt:products:detail:*` |
| User profile | 2 minutes | `vt:user:profile:*` |
| Marketplace stats | 5 minutes | `vt:analytics:marketplace:*` |
| Seller revenue | 3 minutes | `vt:analytics:seller:*` |
| Search results | 1 minute | `vt:search:*` |
| Categories | 10 minutes | `vt:categories:*` |
| Payment health | 30 seconds | `vt:payment-health` |

**Critical rules**: No caching of payment intent data, order status, financial ledger entries, or webhook processing results. Product data can be cached for up to 5 minutes; user profiles for 2 minutes; financial data is never cached beyond 60 seconds.

---

## 8. Stripe Configuration

Stripe handles all payment processing, including multi-vendor payouts via Stripe Connect. Proper configuration of webhooks, API keys, and Connect onboarding is essential for a functioning marketplace.

### Live Mode Setup

1. **Activate your Stripe account**:
   - Complete the Stripe account activation process at https://dashboard.stripe.com/activate
   - Provide business information, bank account details, and identity verification

2. **Switch to live mode**:
   - In the Stripe dashboard, toggle the "Test mode" switch to OFF
   - Replace test API keys with live API keys in your environment variables:
     ```
     STRIPE_SECRET_KEY=sk_live_...
     NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
     ```

3. **Configure API version**:
   - VendorTrack uses Stripe API version `2024-06-20`
   - Ensure your Stripe dashboard is set to this version (Developers > API version)

### Webhook Endpoint

The Stripe webhook endpoint is critical for payment fulfillment. Without it, orders will not be created after successful payments.

1. **Create the webhook endpoint** in the Stripe dashboard:
   - Navigate to Developers > Webhooks > Add endpoint
   - URL: `https://your-domain.com/api/webhooks/stripe`
   - Events to listen for:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
     - `charge.dispute.created`

2. **Copy the signing secret**:
   - After creating the endpoint, click "Reveal" next to the signing secret
   - The value starts with `whsec_...`
   - Set this as `STRIPE_WEBHOOK_SECRET` in your environment variables

3. **Verify webhook delivery**:
   - After deployment, trigger a test payment and check the Stripe dashboard for successful webhook delivery
   - The webhook handler includes:
     - Signature verification (rejects invalid signatures with 400)
     - Replay protection (rejects events older than 5 minutes)
     - Idempotency checks (via `processed_events` table)
     - Automatic safety refunds on fulfillment failure

### Stripe Connect Onboarding

For multi-vendor payments, sellers must complete Stripe Connect onboarding:

1. **Enable Stripe Connect** in your Stripe dashboard (Settings > Connect)
2. **Set the redirect URL** to your seller dashboard settings page (e.g., `https://your-domain.com/seller-dashboard/settings`)
3. **Configure the Connect onboarding flow**:
   - Sellers click "Connect Stripe" in their dashboard
   - They are redirected to Stripe onboarding
   - After completion, the `stripe_account_id` is saved to their profile
   - The `stripe_connected` flag is set to `true`

4. **Feature flag**: The `FEATURE_STRIPE_CONNECT` flag controls this feature. Set it to `true` in production.

### Test Mode

For staging and development, use Stripe test mode:

- Use test API keys (`sk_test_...`, `pk_test_...`)
- Use Stripe CLI to forward webhook events locally:

  ```bash
  # Install Stripe CLI
  # https://stripe.com/docs/stripe-cli

  # Login to Stripe
  stripe login

  # Forward webhooks to local server
  stripe listen --forward-to localhost:9002/api/webhooks/stripe

  # Trigger test events
  stripe trigger payment_intent.succeeded
  ```

- Use test card numbers for payment testing:
  - Success: `4242 4242 4242 4242`
  - Decline: `4000 0000 0000 0002`
  - Require authentication: `4000 0025 0000 3155`

---

## 9. Background Workers

VendorTrack uses a database-backed background job queue for asynchronous processing. Workers poll the `background_jobs` table and claim jobs atomically using compare-and-swap semantics.

### Worker Configuration

The worker runs as a separate Docker container defined in `Dockerfile.worker`. It is configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_MODE` | `true` | Enables worker mode (set automatically in Docker) |
| `WORKER_CONCURRENCY` | `5` | Maximum concurrent jobs to process |
| `WORKER_POLL_INTERVAL_MS` | `5000` | Milliseconds between polling cycles when queue is empty |
| `LOG_LEVEL` | `info` | Worker log verbosity |

### Job Types

The following job types are registered in the system:

| Job Type | Priority | Description | Handler |
|----------|----------|-------------|---------|
| `notification` | Normal | Email and push notifications | Registered in `instrumentation.ts` |
| `email` | Normal | Email delivery | -- |
| `analytics` | Normal | Analytics computation and aggregation | Registered in `instrumentation.ts` |
| `image_processing` | Normal | Product image optimization | -- |
| `ai_task` | Normal | AI product description generation | -- |
| `search_indexing` | Normal | Full-text search index updates | Registered in `instrumentation.ts` |
| `reconciliation` | High | Payment ledger reconciliation | -- |
| `cache_warming` | Low | Pre-populate cache entries | Registered in `instrumentation.ts` |
| `report_generation` | Low | Scheduled report generation | -- |
| `audit` | Normal | Audit log processing | -- |
| `seller_payout` | High | Stripe Connect payout processing | -- |
| `ledger_reconciliation` | High | Double-entry ledger reconciliation | -- |

### Concurrency and Scaling

The worker uses a polling-based architecture with atomic job claiming:

- **Atomic claiming**: Jobs are claimed via compare-and-swap (CAS) -- only one worker can claim a given job
- **Exponential backoff**: Failed jobs retry with exponential backoff plus jitter (delay = min(1000 * 2^attempts, 30000) + random(0-1000)ms)
- **Dead letter queue**: Jobs that exceed their `max_attempts` (default: 3) are moved to `dead` status
- **Job deduplication**: Jobs with the same `dedup_key` are not enqueued twice

To scale horizontally, add more worker instances:

```bash
# Scale to 3 worker instances
docker compose up -d --scale worker=3
```

Each worker independently polls the queue and claims jobs atomically, so there is no duplicate processing.

### Monitoring

Monitor the background job queue using the following queries:

```sql
-- Check queue status
SELECT status, COUNT(*) FROM background_jobs GROUP BY status;

-- Check dead letter jobs
SELECT id, job_type, error_message, attempts, created_at
FROM background_jobs
WHERE status = 'dead'
ORDER BY created_at DESC;

-- Check stuck processing jobs
SELECT id, job_type, next_attempt_at
FROM background_jobs
WHERE status = 'processing'
  AND next_attempt_at < NOW() - INTERVAL '10 minutes';
```

The Prometheus alerting system includes alerts for:
- Queue backlog exceeding 1000 pending jobs (`VendorTrackQueueBacklog`)
- Dead letter queue growing rapidly (more than 10 new dead jobs per hour) (`VendorTrackDeadLetterQueueGrowing`)

### Retry Dead Jobs

```typescript
// Retry all dead jobs of a specific type
import { retryDeadJobs } from '@/lib/performance/background-jobs';
await retryDeadJobs('notification', 10);

// Retry all dead jobs
await retryDeadJobs(undefined, 50);
```

### Cleanup Old Jobs

```typescript
// Clean up jobs older than 30 days
import { cleanupOldBackgroundJobs } from '@/lib/performance/background-jobs';
await cleanupOldBackgroundJobs(30);
```

---

## 10. Post-Deployment Verification

After deploying VendorTrack, run through the following verification steps to ensure all systems are functioning correctly.

### Health Check

The primary health endpoint is `/api/health`. It verifies the application is running and responsive:

```bash
# Basic health check
curl -sf https://your-domain.com/api/health | jq .

# Expected response:
# { "status": "ok", "timestamp": "2025-01-01T00:00:00.000Z" }
```

### Smoke Tests

Run the smoke test suite to verify core functionality:

```bash
# Run smoke tests against production
npm run test:smoke

# Or run a targeted subset
npx vitest run --config vitest.smoke.config.js
```

### Database Connectivity

Verify the Supabase connection is working:

```bash
# Check database connectivity via the health cron
curl -sf -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/health-check | jq .

# Expected: { "status": "ok", "task": "health_check", "timestamp": "..." }
```

### Payment System Verification

1. **Stripe webhook endpoint**:
   ```bash
   # Verify the webhook endpoint is accessible
   curl -sf -o /dev/null -w "%{http_code}" https://your-domain.com/api/webhooks/stripe
   # Should return 405 (Method Not Allowed for GET) -- confirms the route exists
   ```

2. **Payment health**:
   ```bash
   curl -sf https://your-domain.com/api/payment-health | jq .
   ```

3. **Test a payment** in test mode before switching to live mode.

### Monitoring Verification

1. **Sentry**: Trigger a test error and verify it appears in the Sentry dashboard:
   ```bash
   curl -sf https://your-domain.com/api/test-error  # if such a test route exists
   ```
   Alternatively, check the Sentry dashboard for the first automatic error report.

2. **Prometheus**: Verify the metrics endpoint is accessible:
   ```bash
   curl -sf https://your-domain.com/api/performance?format=prometheus
   ```

3. **Cron jobs**: Verify cron jobs are running by checking Vercel logs or the cron endpoint responses.

### Security Header Check

Verify that all security headers are present:

```bash
curl -sI https://your-domain.com | grep -E "Strict-Transport|X-Frame|X-Content-Type|Referrer-Policy|Permissions-Policy|Cross-Origin"
```

Expected headers:

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), ... payment=(self https://js.stripe.com)` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cross-Origin-Embedder-Policy` | `require-corp` |

### Cache Verification

Verify Redis caching is working:

```bash
# Make two requests and check that the second is faster
time curl -sf https://your-domain.com/api/products/search?q=test > /dev/null
time curl -sf https://your-domain.com/api/products/search?q=test > /dev/null
```

---

## 11. Rollback Procedures

When a deployment introduces critical issues, use the following procedures to restore the previous stable state.

### Vercel Rollback

Vercel maintains a history of all deployments, making rollback straightforward:

1. **Via the Vercel Dashboard**:
   - Navigate to your project > Deployments
   - Find the last known good deployment
   - Click the "..." menu > "Promote to Production"
   - The rollback is instant -- no rebuild required

2. **Via the Vercel CLI**:
   ```bash
   # List recent deployments
   vercel ls --prod

   # Rollback to a specific deployment
   vercel rollback <deployment-url>
   ```

3. **Via Git**:
   ```bash
   # Revert the commit and push
   git revert HEAD
   git push origin main
   # Vercel automatically deploys the reverted commit
   ```

### Docker Rollback

For Docker deployments, rollback involves reverting to a previously tagged image:

```bash
# 1. List available images
docker images | grep vendortrack

# 2. Tag the previous version
docker tag vendortrack:v0.0.9 vendortrack:rollback

# 3. Update docker-compose.yml to use the rollback tag
#    image: vendortrack:rollback

# 4. Restart services
docker compose down
docker compose up -d

# Alternative: pull and run a specific version
docker compose down
docker compose up -d --no-build
```

### Database Rollback

Database rollbacks require careful planning. Always create a backup before rolling back:

1. **Before any rollback**, create a backup:
   ```bash
   supabase db dump --project-ref your-project-ref > pre_rollback_backup.sql
   ```

2. **For schema changes** that are backward-compatible:
   - Apply a new migration that reverses the previous migration
   - Create a new migration file (e.g., `006_rollback_005.sql`)

3. **For data loss scenarios**:
   - Use Supabase PITR (Point-in-Time Recovery) on the Pro plan
   - Contact Supabase support to restore to a specific timestamp
   - This is the safest approach for data recovery

4. **For RLS policy changes**:
   - RLS policies can be dropped and recreated without data loss
   - Apply the corrected policy via the SQL Editor

### Feature Flag Kill Switch

For feature-specific issues that do not require a full rollback, use the feature flag kill switch system. This allows you to disable a specific feature without redeploying:

```bash
# Disable a feature via environment variable
# In Vercel:
vercel env add FEATURE_AUTO_REFUND_ON_FAILURE production
# Set value to "false"

# In Docker:
# Update the environment variable in docker-compose.yml
# FEATURE_AUTO_REFUND_ON_FAILURE=false
# Then restart: docker compose up -d
```

Kill switch-enabled flags (marked with `isKillSwitch: true` in the codebase):

- `auto_refund_on_failure` -- Disables automatic refunds on fulfillment failure
- `stripe_connect` -- Disables Stripe Connect onboarding

These flags take effect immediately upon environment variable change and do not require a rebuild. The application reads the `FEATURE_*` environment variable at runtime.

---

## 12. Troubleshooting

### Application Fails to Start

**Symptom**: The application exits immediately after starting with an environment validation error.

**Cause**: One or more required environment variables are missing or invalid.

**Solution**:

```bash
# Validate environment variables
npx tsx -e "import { validateEnvironment } from './src/lib/env'; const r = validateEnvironment(); r.forEach(v => console.log(v.status, v.name, v.message))"

# Common issues:
# - STRIPE_SECRET_KEY must start with sk_test_ or sk_live_
# - NEXT_PUBLIC_SUPABASE_URL must be https://*.supabase.co
# - STRIPE_WEBHOOK_SECRET must start with whsec_
# - Server-only variables must NOT have NEXT_PUBLIC_ prefix
```

### Webhook Signature Verification Failed

**Symptom**: Stripe webhook events return 400 with "Invalid signature".

**Cause**: The `STRIPE_WEBHOOK_SECRET` does not match the signing secret for the webhook endpoint.

**Solution**:
1. Verify the webhook endpoint URL in the Stripe dashboard matches your production URL
2. Copy the exact signing secret from the Stripe webhook endpoint configuration
3. Ensure the `STRIPE_WEBHOOK_SECRET` environment variable is set to the correct value (starts with `whsec_`)
4. Restart the application after updating the environment variable

### Redis Connection Refused

**Symptom**: Application logs show "Connection refused" errors for Redis.

**Cause**: The Redis service is not running or the `REDIS_URL` is incorrect.

**Solution**:

```bash
# For Docker deployments, check Redis health
docker compose exec redis redis-cli ping
# Expected: PONG

# Check Redis URL
echo $REDIS_URL
# Should be: redis://redis:6379 (Docker) or redis://default:password@host:6379 (Upstash)

# If Redis is unavailable, the application falls back to in-memory LRU cache
# This is by design -- the application will still function, but caching will not be shared
```

### Database Connection Pool Exhausted

**Symptom**: API requests return 500 errors with database timeout messages.

**Cause**: The connection pool is exhausted, likely due to slow queries or too many concurrent requests.

**Solution**:
1. Check the Supabase dashboard for connection metrics
2. Verify connection pooling is enabled (Transaction Mode on port 6543)
3. Increase `DB_POOL_SIZE` and `DB_MAX_CONNECTIONS` in environment variables
4. Check for slow queries using the `pg_stat_statements` view in Supabase
5. Review the Prometheus alert `VendorTrackHighDBLatency` (triggers at p95 > 100ms)

### Cache Hit Rate Below 50%

**Symptom**: The Prometheus alert `VendorTrackLowCacheHitRate` fires.

**Cause**: Cache entries are being evicted too quickly or not being populated.

**Solution**:
1. Verify Redis is running and accessible: `docker compose exec redis redis-cli info stats`
2. Check the `maxmemory` setting (256MB in the default configuration)
3. If memory is full, increase `maxmemory` in the Redis command or the Upstash plan
4. Check the cache warming cron job is running: `/api/cron/cache-warming` every 6 hours
5. Review the eviction policy -- `allkeys-lru` evicts the least recently used keys

### Background Job Queue Backlog

**Symptom**: The `VendorTrackQueueBacklog` alert fires (more than 1000 pending jobs).

**Cause**: Workers are not processing jobs fast enough, or a specific job type is failing repeatedly.

**Solution**:
1. Check the queue status:
   ```sql
   SELECT status, job_type, COUNT(*) FROM background_jobs GROUP BY status, job_type;
   ```
2. Scale workers horizontally: `docker compose up -d --scale worker=3`
3. Check for dead letter jobs and investigate their error messages:
   ```sql
   SELECT job_type, error_message, COUNT(*) FROM background_jobs WHERE status = 'dead' GROUP BY job_type, error_message;
   ```
4. Retry dead jobs if the underlying issue is resolved:
   ```typescript
   await retryDeadJobs('notification', 50);
   ```

### CORS Errors in Browser

**Symptom**: Browser console shows CORS errors when making API requests.

**Cause**: The `CORS_ALLOWED_ORIGINS` environment variable does not include the requesting origin.

**Solution**:
1. Set `CORS_ALLOWED_ORIGINS` to include all origins that need API access:
   ```
   CORS_ALLOWED_ORIGINS=https://vendortrack.app,https://www.vendortrack.app
   ```
2. Include the scheme (`https://`) and do not include trailing slashes
3. For development, you can use `*` but never in production

### Stripe Connect Onboarding Fails

**Symptom**: Sellers cannot complete Stripe Connect onboarding.

**Cause**: The Connect onboarding flow is not properly configured.

**Solution**:
1. Verify Stripe Connect is enabled in your Stripe dashboard (Settings > Connect)
2. Check the redirect URL is set correctly in Stripe settings
3. Verify the `FEATURE_STRIPE_CONNECT` environment variable is set to `true`
4. Check the seller's `stripe_account_id` and `stripe_connected` fields in the database
5. Ensure the Stripe account is in live mode when using live API keys

### High Memory Usage

**Symptom**: The `VendorTrackHighMemoryUsage` alert fires (heap usage > 90% of RSS).

**Cause**: Memory leak or excessive data loading.

**Solution**:
1. Check the current memory usage: `docker stats vendortrack-app`
2. Review the Docker resource limits (512M default) and increase if needed
3. Check for large query results that are not paginated
4. Verify that Redis is being used (not in-memory cache) for production deployments
5. Check the Sentry dashboard for memory-related issues
6. If the issue persists, restart the application container: `docker compose restart app`
