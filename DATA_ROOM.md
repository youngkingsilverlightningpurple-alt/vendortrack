# VendorTrack — Buyer Data Room

> A complete inventory of everything included in the VendorTrack acquisition, organized for efficient due diligence review.

---

## 1. Repository Contents

### Source Code Structure
```
vendortrack/
├── src/                          # Application source (TypeScript)
│   ├── app/                      # Next.js App Router
│   │   ├── (pages)/              # 20+ pages (marketplace, dashboards, auth)
│   │   └── api/                  # 8 API routes (checkout, webhooks, health, cron, etc.)
│   ├── components/               # React UI components (shadcn/ui based)
│   ├── domain/                   # Pure business domain (entities, mappers, constants)
│   ├── dto/                      # Zod-validated data transfer objects
│   ├── hooks/                    # React hooks
│   ├── lib/                      # Infrastructure layer
│   │   ├── security/             # 8 security modules (headers, CSRF, rate limiting, XSS, etc.)
│   │   ├── payment/              # 7 payment modules (errors, retry, refund, ledger, queue, etc.)
│   │   ├── monitoring/           # 5 monitoring modules (Sentry, OTel, feature flags, etc.)
│   │   ├── performance/          # 5 performance modules (monitor, query optimizer, jobs, etc.)
│   │   ├── cache/                # 3 cache modules (Redis client, cache layer, index)
│   │   └── logger/               # Structured logging
│   ├── middleware/                # API middleware (security headers, CSRF, rate limiting)
│   ├── repositories/             # 7 data access repositories
│   ├── services/                 # 8 business logic services
│   ├── types/                    # Backward-compatible re-exports
│   └── validators/               # Business validation functions
│
├── ai/                           # Genkit AI flows (product description generation)
│
├── src/__tests__/                # Test suites
│   ├── architecture/             # Domain, DTO, error, validator tests
│   ├── security/                 # 111 security tests
│   ├── performance/              # Cache, query optimizer, background job tests
│   └── smoke/                    # Production smoke tests
│
├── scripts/                      # Operational scripts (12 files)
│   ├── seed-demo.ts              # Demo data seeding
│   ├── seed-reset.ts             # Demo data reset
│   ├── deployment-verify.ts      # Deployment verification
│   ├── production-verify.ts      # Production verification
│   ├── acceptance-tests.ts       # E2E acceptance tests
│   ├── operational-validate.ts   # Operational validation
│   ├── backup.sh                 # Database backup
│   ├── restore.sh                # Database restore
│   ├── rotate-keys.sh            # Key rotation
│   └── deploy.sh                 # Deployment script
│
├── docs/                         # Database schemas & documentation
│   ├── supabase-schema.sql       # Core schema (6 tables + RPCs + RLS)
│   ├── supabase-rls-migration.sql
│   ├── supabase-performance-migration.sql
│   ├── supabase-payment-migration.sql
│   ├── supabase-devops-migration.sql
│   ├── supabase-database-optimization-migration.sql
│   ├── supabase-migration-blueprint.md
│   ├── blueprint.md
│   ├── DIAGRAMS.md
│   ├── CREDENTIAL_ROTATION_CHECKLIST.md
│   └── README.md
│
├── monitoring/                   # Prometheus, Grafana, Alertmanager configs
│   ├── prometheus.yml
│   ├── alert_rules.yml
│   ├── alertmanager.yml
│   └── grafana/
│
├── .github/workflows/            # CI/CD pipelines
│   ├── ci.yml
│   ├── ci-cd.yml
│   └── security-scan.yml
│
├── .devcontainer/                # Dev container config
├── .husky/                       # Git hooks
├── .vscode/                      # Editor settings
│
├── Dockerfile                    # Multi-stage production build
├── Dockerfile.worker             # Background job worker
├── Dockerfile.dev                # Development container
├── docker-compose.yml            # Production orchestration
├── docker-compose.dev.yml        # Development orchestration
├── docker-compose.monitoring.yml # Monitoring stack
│
├── vercel.json                   # Vercel deployment config
├── next.config.js                # Next.js configuration
├── tailwind.config.ts            # Tailwind CSS configuration
├── vitest.config.js              # Test configuration
├── vitest.smoke.config.js        # Smoke test configuration
├── tsconfig.json                 # TypeScript configuration
├── .env.example                  # Environment template (20+ variables)
├── .env.production.example       # Production environment template (30+ variables)
├── .gitleaks.toml                # Secret scanning configuration
├── .trufflehog.yaml              # Secret scanning configuration
│
└── [25+ documentation files]     # Comprehensive documentation
```

### Code Metrics
| Metric | Value |
|--------|-------|
| Total Source Files | ~80+ TypeScript/TSX files |
| Total Test Files | 7 test files, 4 verification scripts |
| Total Documentation | 25+ markdown files |
| Total Script Files | 12 operational scripts |
| Total SQL Files | 6 migration files |
| Total CI/CD Files | 3 workflow files |
| Total Docker Files | 6 Docker/compose files |
| Estimated Lines of Code | ~15,000+ (application) + ~7,500 (infrastructure/ops) |

---

## 2. Documentation Index

### Core Documentation
| Document | Purpose | Lines |
|----------|---------|-------|
| `README.md` | Quick start, features, architecture, tech stack | 200+ |
| `ARCHITECTURE.md` | Layer diagram, dependency rules, data flow, extension guidelines | 300+ |
| `ARCHITECTURE-AUDIT-REPORT.md` | Before/after comparison, score improvement (14→88) | 400+ |
| `API_REFERENCE.md` | API endpoint documentation | 200+ |
| `DEVELOPER_GUIDE.md` | Developer onboarding guide | 200+ |

### Security Documentation
| Document | Purpose | Lines |
|----------|---------|-------|
| `SECURITY.md` | Security measures overview | 100+ |
| `SECURITY-HARDENING.md` | Detailed security hardening report (91/100) | 343+ |
| `AUTHORIZATION.md` | Authorization system documentation | 100+ |

### Payment Documentation
| Document | Purpose | Lines |
|----------|---------|-------|
| `PAYMENTS.md` | Enterprise payment system architecture | 530+ |
| `docs/PAYMENT-AUDIT-REPORT.md` | Payment system audit report | 200+ |

### Performance Documentation
| Document | Purpose | Lines |
|----------|---------|-------|
| `PERFORMANCE.md` | Performance engineering report (88/100) | 460+ |
| `DATABASE.md` | Database documentation | 200+ |

### Operations Documentation
| Document | Purpose | Lines |
|----------|---------|-------|
| `DEPLOYMENT.md` | Full deployment guide (Vercel + Docker) | 1,128+ |
| `DEVOPS.md` | DevOps documentation, acquisition readiness | 484+ |
| `OPERATIONS.md` | Operational procedures | 875+ |
| `OPERATIONS_MANUAL.md` | Operational manual | 200+ |
| `RUNBOOK.md` | 10-section operational runbook | 1,694+ |
| `TROUBLESHOOTING.md` | Common issues and solutions | 200+ |

### Testing & Quality
| Document | Purpose | Lines |
|----------|---------|-------|
| `TESTING.md` | Testing guide | 200+ |
| `CODE_QUALITY.md` | Code quality standards | 200+ |

### Production Readiness
| Document | Purpose | Lines |
|----------|---------|-------|
| `PRODUCTION_READINESS_REPORT.md` | 96/100 readiness assessment | 277+ |
| `GO_LIVE_GUIDE.md` | Step-by-step deployment guide | 300+ |
| `GO_LIVE_CHECKLIST.md` | Launch day checklist | 100+ |
| `PRE_LAUNCH_CHECKLIST.md` | Pre-launch verification | 120+ |
| `POST_DEPLOYMENT_CHECKLIST.md` | Post-deployment verification | 100+ |

### User Guides
| Document | Purpose | Lines |
|----------|---------|-------|
| `BUYER_GUIDE.md` | Buyer user guide | 100+ |
| `ADMIN_GUIDE.md` | Admin user guide | 100+ |
| `USER_GUIDE.md` | General user guide | 100+ |
| `DEMO_GUIDE.md` | 7 complete demonstration flows | 450+ |

### Acquisition & Handover
| Document | Purpose | Lines |
|----------|---------|-------|
| `HANDOVER.md` | Technical transition guide | 56+ |
| `docs/CREDENTIAL_ROTATION_CHECKLIST.md` | Credential rotation procedures | 100+ |

---

## 3. Licenses

### Open Source Dependencies
All dependencies are permissively licensed. No copyleft (GPL/AGPL) dependencies.

| Dependency | License | Risk |
|-----------|---------|------|
| Next.js | MIT | ✅ None |
| React | MIT | ✅ None |
| TypeScript | Apache-2.0 | ✅ None |
| Supabase Client | MIT | ✅ None |
| Stripe SDK | MIT | ✅ None |
| Tailwind CSS | MIT | ✅ None |
| Radix UI | MIT | ✅ None |
| shadcn/ui | MIT | ✅ None |
| Vitest | MIT | ✅ None |
| Zod | MIT | ✅ None |
| Recharts | MIT | ✅ None |
| Genkit | Apache-2.0 | ✅ None |
| Lucide React | ISC | ✅ None |
| date-fns | MIT | ✅ None |
| Husky | MIT | ✅ None |

### Application License
The VendorTrack application code itself is proprietary. The buyer acquires full ownership of all application source code, documentation, and associated intellectual property.

---

## 4. Third-Party Services

### Required Services (Production)
| Service | Purpose | Free Tier | Paid Tier | Monthly Cost |
|---------|---------|-----------|-----------|-------------|
| **Supabase** | Database + Auth + Storage | 500MB DB, 1GB storage | Pro: $25/mo | $25–$75 |
| **Vercel** | Hosting + CDN + Edge | 100GB bandwidth | Pro: $20/mo | $20–$40 |
| **Stripe** | Payment processing | No monthly fee | 2.9% + 30¢ per transaction | Variable |
| **Google Gemini** | AI product descriptions | 60 req/min | Pay-as-you-go | $0–$50 |
| **Redis** | Caching | N/A | Upstash: $10/mo or self-hosted | $0–$10 |
| **Sentry** | Error tracking | 5K events/mo | Team: $26/mo | $0–$26 |

### Optional Services (Monitoring)
| Service | Purpose | Monthly Cost |
|---------|---------|-------------|
| **Prometheus** | Metrics collection | Self-hosted (Docker) |
| **Grafana** | Dashboards | Self-hosted (Docker) |
| **Alertmanager** | Alert routing | Self-hosted (Docker) |
| **PagerDuty** | Critical alerting | Free–$29/mo |
| **Slack** | Warning alerting | Free tier available |

### Service Transfer Requirements
| Service | Transfer Method | Complexity |
|---------|----------------|------------|
| Supabase | Project ownership transfer or export/import | Low |
| Vercel | Team/project transfer | Low |
| Stripe | Connect account transfer | Medium |
| Google Gemini | API key rotation | Low |
| Redis | Instance migration or new provisioning | Low |
| Sentry | Organization/project transfer | Low |
| PagerDuty | Account transfer | Low |
| GitHub | Repository transfer | Low |

---

## 5. Environment Variables

### Client-Side Variables (NEXT_PUBLIC_ prefix)
These variables are included in the browser bundle and are safe to expose.

| Variable | Purpose | Example |
|----------|---------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | `pk_live_...` |

### Server-Side Variables (NEVER expose to browser)
These variables contain secrets and must only be used in server-side code.

| Variable | Purpose | Example |
|----------|---------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin access | `eyJ...` |
| `STRIPE_SECRET_KEY` | Stripe API access | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Webhook signature verification | `whsec_...` |
| `GEMINI_API_KEY` | Google Gemini AI access | `AIza...` |
| `REDIS_URL` | Redis connection string | `redis://...` |
| `SENTRY_DSN` | Sentry error tracking | `https://...@sentry.io/...` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry endpoint | `http://...` |
| `CRON_SECRET` | Cron job authentication | `random-secret` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `https://yourdomain.com` |

### Feature Flags (Optional)
| Variable | Purpose | Default |
|----------|---------|---------|
| `FEATURE_AI_DESCRIPTIONS` | Enable AI product descriptions | `true` |
| `FEATURE_ORDER_CHAT` | Enable buyer-seller chat | `true` |
| `FEATURE_REFUNDS` | Enable refund workflow | `true` |
| `FEATURE_SEARCH_SUGGESTIONS` | Enable search autocomplete | `true` |
| `FEATURE_SELLER_ONBOARDING` | Enable seller applications | `true` |

**Total: 30+ environment variables documented in `.env.example` and `.env.production.example`**

---

## 6. Deployment Process

### Quick Deploy (Vercel — Recommended)
```bash
# 1. Clone the repository
git clone https://github.com/your-org/vendortrack.git
cd vendortrack

# 2. Install dependencies
npm ci

# 3. Configure environment variables
cp .env.example .env.local
# Edit .env.local with production values

# 4. Deploy to Vercel
vercel deploy --prod

# 5. Seed demo data
npm run seed:demo

# 6. Verify deployment
npm run verify:deployment
```

### Self-Hosted Deploy (Docker)
```bash
# 1. Clone and configure
git clone https://github.com/your-org/vendortrack.git
cd vendortrack
cp .env.production.example .env

# 2. Build and run
docker build -t vendortrack:latest .
docker compose up -d

# 3. Seed demo data
docker compose exec app npm run seed:demo

# 4. Verify health
curl http://localhost:9002/api/health
```

### Deployment Verification
```bash
# Full deployment verification (9 categories)
npm run verify:deployment

# Production verification (8 categories)
npm run verify

# Acceptance tests (8 workflow suites)
npm run verify:acceptance

# Operational validation (9 categories)
npm run operational-validate
```

---

## 7. Assets Included

### Intellectual Property
| Asset | Description | Ownership |
|-------|-------------|-----------|
| Application Source Code | Full TypeScript/Next.js codebase | Transferred to buyer |
| Database Schema | PostgreSQL schema with RLS, RPCs, indexes | Transferred to buyer |
| Documentation | 25+ documentation files | Transferred to buyer |
| CI/CD Pipelines | GitHub Actions workflows | Transferred to buyer |
| Docker Configurations | Multi-stage Dockerfiles + compose files | Transferred to buyer |
| Monitoring Stack | Prometheus + Grafana + Alertmanager configs | Transferred to buyer |
| Test Suite | 250+ tests + verification scripts | Transferred to buyer |
| Operational Scripts | 12 scripts for backup, restore, deploy, verify | Transferred to buyer |
| Demo Data | Seed scripts with realistic marketplace data | Transferred to buyer |

### Not Included (Requires Separate Setup)
| Asset | Action Required |
|-------|----------------|
| Domain Name | Buyer registers or transfers their own domain |
| SSL Certificate | Automatically provided by Vercel or Let's Encrypt |
| Stripe Account | Buyer creates or transfers their own Stripe Connect account |
| Supabase Project | Buyer creates or transfers their own Supabase project |
| Google Gemini API Key | Buyer creates their own Google Cloud project |
| Sentry Account | Buyer creates or transfers their own Sentry organization |
| PagerDuty/Slack | Buyer configures their own alerting channels |

### Design Assets
| Asset | Status |
|-------|--------|
| UI Components | Built with shadcn/ui (MIT license, included in source) |
| Icon Library | Lucide React (ISC license, included in source) |
| Images | Placeholder images; buyer replaces with production images |
| Brand Assets | No brand assets included; buyer applies their own branding |

---

## 8. Data Room Access Checklist

### For Technical Due Diligence
- [ ] Repository access granted (GitHub)
- [ ] Read through `ARCHITECTURE.md` and `ARCHITECTURE-AUDIT-REPORT.md`
- [ ] Review `SECURITY-HARDENING.md` and `PAYMENTS.md`
- [ ] Examine `docs/supabase-schema.sql` for database design
- [ ] Review `src/__tests__/` for test coverage
- [ ] Run `npm ci && npm test` to verify all tests pass
- [ ] Run `npm run seed:demo && npm run verify:acceptance` for demo verification

### For Business Due Diligence
- [ ] Read `EXECUTIVE_SUMMARY.md` for product overview
- [ ] Review `PRODUCT_BROCHURE.md` for features and benefits
- [ ] Read `COMPETITIVE_ANALYSIS.md` for market positioning
- [ ] Review `INFRASTRUCTURE_COSTS.md` for operating costs
- [ ] Read `VALUATION_NOTES.md` for financial assessment
- [ ] Review `BUYER_FAQ.md` for common questions

### For Legal Due Diligence
- [ ] Review open-source license inventory (all MIT/Apache-2.0)
- [ ] Verify no copyleft (GPL/AGPL) dependencies
- [ ] Confirm no third-party data or content included
- [ ] Review `HANDOVER_PACKAGE.md` for ownership transfer process
- [ ] Verify service transfer requirements in `DATA_ROOM.md`

---

*Document Version: 1.0 | Date: 2026-07-31 | Classification: Confidential — For Acquisition Review Only*
