# VendorTrack

> Production-Ready Multi-Vendor Marketplace Engine

A transaction-safe multi-vendor marketplace with database-enforced financial integrity, built on Next.js 14, Supabase, Stripe Connect, and Gemini AI.

---

## Quick Start

```bash
# Clone and install
git clone <repository-url>
cd vendortrack
npm install

# Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase + Stripe credentials

# Seed demo data
npx tsx scripts/seed-demo.ts

# Launch
npm run dev
# Open http://localhost:9002
```

---

## Demo Accounts

| Role | Email | Password | Dashboard |
|------|-------|----------|-----------|
| **Admin** | admin@vendortrack.demo | DemoAdmin2024! | /admin-dashboard |
| **Seller** | seller@vendortrack.demo | DemoSeller2024! | /seller-dashboard |
| **Seller** | eco@vendortrack.demo | DemoEco2024! | /seller-dashboard |
| **Seller** | luxe@vendortrack.demo | DemoLuxe2024! | /seller-dashboard |
| **Buyer** | buyer@vendortrack.demo | DemoBuyer2024! | /buyer-orders |
| **Buyer** | buyer2@vendortrack.demo | DemoBuyer22024! | /buyer-orders |

---

## Key Features

- **Atomic Transactions** — PostgreSQL-enforced order fulfillment with `FOR UPDATE` row locking
- **Financial Precision** — Integer-precision cents storage (zero floating-point drift)
- **Self-Healing Webhooks** — Automatic refunds when fulfillment fails
- **Stripe Connect** — Destination charges with 10% platform commission
- **Row Level Security** — Supabase RLS on all tables
- **AI Copilot** — Genkit-powered product description generation
- **Feature Flags** — 12 flags with kill switch and percentage rollouts
- **Monitoring** — Sentry, OpenTelemetry, Prometheus, Grafana
- **Security** — 4-layer middleware (headers, CSRF, rate limiting, RBAC)

---

## Architecture

```
src/
├── app/           # Next.js App Router (pages + API routes)
├── domain/        # Pure business entities (zero external deps)
├── dto/           # Zod-validated request/response schemas
├── validators/    # Reusable business rule validators
├── services/      # Business logic (checkout, inventory, search, chat)
├── repositories/  # Data access layer (Supabase queries)
├── lib/           # Infrastructure (auth, RBAC, security, payment, cache)
├── middleware/     # API middleware (auth, validation, error handling)
├── components/    # UI components (shadcn/ui + custom)
├── hooks/         # React hooks (unread messages, toast, mobile)
└── types/         # TypeScript type definitions
```

---

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server (port 9002) |
| `npm run build` | Production build |
| `npm run seed:demo` | Create demo accounts and marketplace data |
| `npm run seed:reset` | Reset all demo data |
| `npm run verify:deployment` | Verify deployment configuration |
| `npm run verify` | Run production verification |
| `npm run verify:acceptance` | Run end-to-end acceptance tests |
| `npm run test` | Run unit tests |
| `npm run test:smoke` | Run smoke tests |
| `npm run healthcheck` | Check health endpoint |

---

## API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/health` | GET | Public | Health check (DB + Redis + Memory + Env) |
| `/api/products/search` | GET | Public | Product search with suggestions |
| `/api/checkout/create-session` | POST | Buyer | Create Stripe checkout session |
| `/api/webhooks/stripe` | POST | Stripe | Webhook orchestrator |
| `/api/performance` | GET | Admin | Performance metrics (Prometheus/JSON) |
| `/api/payment-health` | GET | Admin | Payment system health |
| `/api/cron/health-check` | GET | Cron | Every 5 minutes |
| `/api/cron/cache-warming` | GET | Cron | Every 6 hours |
| `/api/cron/reconciliation` | GET | Cron | Daily at 2 AM |

---

## Documentation

| Document | Purpose |
|----------|---------|
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Complete demonstration walkthroughs |
| [GO_LIVE_GUIDE.md](GO_LIVE_GUIDE.md) | Step-by-step deployment guide |
| [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) | Readiness assessment |
| [PRE_LAUNCH_CHECKLIST.md](PRE_LAUNCH_CHECKLIST.md) | Pre-launch verification |
| [GO_LIVE_CHECKLIST.md](GO_LIVE_CHECKLIST.md) | Launch day procedure |
| [POST_DEPLOYMENT_CHECKLIST.md](POST_DEPLOYMENT_CHECKLIST.md) | Post-deployment verification |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System architecture |
| [API_REFERENCE.md](API_REFERENCE.md) | API documentation |
| [SECURITY.md](SECURITY.md) | Security measures |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Deployment procedures |
| [RUNBOOK.md](RUNBOOK.md) | Operational runbooks |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | Developer onboarding |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14 (App Router) |
| **Database** | Supabase (PostgreSQL + Auth + RLS) |
| **Payments** | Stripe Connect |
| **AI** | Google Gemini (Genkit) |
| **Cache** | Redis / LRU Fallback |
| **Monitoring** | Sentry + OpenTelemetry + Prometheus + Grafana |
| **UI** | shadcn/ui + Tailwind CSS + Radix UI |
| **Testing** | Vitest |
| **CI/CD** | GitHub Actions |
| **Deployment** | Vercel / Docker |

---

## License

Proprietary — All rights reserved.
