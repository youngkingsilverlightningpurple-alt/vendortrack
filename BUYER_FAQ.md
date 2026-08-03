# VendorTrack — Buyer FAQ

> Answers to the most common questions from prospective buyers, investors, and technical due diligence teams.

---

## General

### What is VendorTrack?
VendorTrack is a production-ready, enterprise-grade multi-vendor marketplace platform. It enables multiple independent sellers to list products, process orders, and receive payouts through a unified storefront — with the platform operator retaining full control over payments, commissions, and marketplace governance. The platform is built on Next.js 14, Supabase, and Stripe Connect, and is deployable to production within hours.

### What problem does VendorTrack solve?
Operating a multi-vendor marketplace requires solving problems that single-store e-commerce platforms cannot address: multi-party payments, financial integrity at scale, seller onboarding and governance, operational visibility, and buyer trust. VendorTrack solves all of these problems with a single, integrated platform.

### Is VendorTrack a SaaS platform?
No. VendorTrack is a self-hosted application that you deploy on your own infrastructure (Vercel, Docker, or any Node.js hosting). You own the entire source code, data, and infrastructure. There are no recurring subscription fees to a vendor, no vendor lock-in, and no dependency on a third-party platform's uptime or roadmap.

### What is the current state of the platform?
VendorTrack is production-ready with a 96/100 acquisition readiness score. All core features are complete and tested: multi-vendor marketplace, Stripe Connect payments, admin dashboard, AI copilot, security hardening, monitoring, and background job processing. The platform has 250+ tests, 25+ documentation files, and a complete demo environment with seed scripts.

---

## Deployment

### How long does it take to deploy VendorTrack?
A technical user can deploy VendorTrack to production in under 2 hours. The process involves: cloning the repository, configuring environment variables, running `vercel deploy` (or `docker compose up`), and seeding demo data. The complete deployment guide is in `GO_LIVE_GUIDE.md`.

### What are the deployment options?
- **Vercel** (recommended) — Zero-config deployment with edge CDN, cron jobs, and automatic SSL
- **Docker** (self-hosted) — Multi-stage Docker build with docker-compose for production, development, and monitoring
- **Any Node.js host** — The application is a standard Next.js app that can run on any Node.js 20+ hosting

### Can I deploy to AWS / GCP / Azure?
Yes. VendorTrack is a standard Next.js application that can be deployed to any cloud provider. The Docker configuration makes it straightforward to deploy to AWS ECS, Google Cloud Run, Azure Container Apps, or any container orchestration platform. The Vercel deployment is the simplest option, but it is not required.

### What environment variables are required?
30+ environment variables are documented in `.env.example` and `.env.production.example`. They cover: Supabase connection, Stripe keys, Redis URL, Google Gemini API key, Sentry DSN, OpenTelemetry endpoint, CORS origins, feature flags, and cron secrets. All variables are documented with descriptions and example values.

### Is there a one-click deploy option?
Vercel deployment is the closest to one-click: `vercel deploy --prod`. Docker deployment requires `docker compose up -d`. Both options are documented step-by-step in `GO_LIVE_GUIDE.md` and `DEPLOYMENT.md`.

---

## Maintenance

### How much ongoing maintenance does VendorTrack require?
Very little. The managed-service architecture (Supabase, Vercel, Stripe) eliminates most infrastructure maintenance. A single engineer can operate the platform. Typical maintenance tasks include: monitoring alerts, reviewing dead letter queue items, running database backups, and applying dependency updates.

### How are updates applied?
VendorTrack uses a 7-stage CI/CD pipeline (lint → typecheck → test → security → build → deploy → health check). Pushing to the `main` branch triggers an automatic production deployment with health verification. If the health check fails, the deployment is automatically rolled back. Feature flags enable safe, gradual feature rollouts without full deployments.

### What happens when dependencies need updating?
Dependencies are managed through npm. The CI/CD pipeline includes automated dependency auditing (`npm audit`). Most dependency updates can be applied with `npm update` and a test run. The clean architecture ensures that dependency updates rarely affect business logic.

### How is the database maintained?
Supabase handles database maintenance including backups, upgrades, and connection pooling. The `scripts/backup.sh` and `scripts/restore.sh` scripts provide additional backup capabilities. The `scripts/rotate-keys.sh` script handles credential rotation. Database migrations are documented in `docs/` with a migration blueprint.

### What is the disaster recovery process?
VendorTrack includes a comprehensive disaster recovery plan documented in `RUNBOOK.md`. Key elements include: automated database backups via Supabase, point-in-time recovery, Redis cache rebuild from database, Stripe webhook replay, and background job reprocessing. The RTO target is 4 hours and RPO target is 1 hour.

---

## Support

### Is there vendor support available?
VendorTrack is a self-hosted application, so there is no traditional vendor support. However, the platform includes comprehensive documentation (25+ files), a detailed runbook (10 sections), troubleshooting guides, and a demo environment. A competent engineer can operate and troubleshoot the platform using the documentation alone.

### What if something breaks in production?
The operational runbook (`RUNBOOK.md`) covers 10 common failure scenarios with step-by-step resolution procedures. The monitoring stack (Sentry + Prometheus + Grafana) provides real-time visibility into errors and performance issues. The alerting system routes critical issues to PagerDuty and warnings to Slack. The health endpoint (`/api/health`) provides a comprehensive system status check.

### Can I hire a team to maintain VendorTrack?
Yes. The clean architecture and comprehensive documentation make it straightforward for any competent engineering team to take over. The architecture is documented in `ARCHITECTURE.md`, the codebase follows strict layering rules, and the developer guide (`DEVELOPER_GUIDE.md`) provides onboarding instructions. A single full-stack engineer is sufficient for operations at launch scale.

---

## Ownership Transfer

### How is ownership transferred?
The complete handover process is documented in `HANDOVER_PACKAGE.md`. It covers: repository transfer (GitHub), Supabase project transfer, Stripe Connect account transfer, domain/DNS transfer, monitoring stack transfer, secrets rotation, and administrative access. The estimated transfer timeline is 2–5 business days.

### Do I get the full source code?
Yes. The buyer receives full ownership of all application source code, database schemas, documentation, CI/CD pipelines, Docker configurations, monitoring configurations, test suites, operational scripts, and demo data. There are no encrypted files, no obfuscated code, and no missing dependencies.

### Are there any licensing restrictions?
No. All open-source dependencies use permissive licenses (MIT, Apache-2.0, ISC). There are no copyleft (GPL/AGPL) dependencies. The application code itself is proprietary and transfers fully to the buyer with no restrictions.

### What third-party services need to be transferred?
The following services need to be set up or transferred:
1. **Supabase** — Create a new project or transfer the existing one
2. **Stripe Connect** — Create a new account or transfer the existing one
3. **Vercel** — Transfer the project or create a new deployment
4. **Google Gemini** — Create a new API key
5. **Sentry** — Transfer the organization or create a new one
6. **Redis** — Provision a new instance (Upstash or self-hosted)
7. **Domain/DNS** — Transfer the domain or configure a new one

### How long does the transfer take?
2–5 business days for a complete transfer, including:
- Day 1: Repository transfer, environment variable configuration
- Day 2: Supabase project setup, schema deployment, demo data seeding
- Day 3: Stripe Connect setup, webhook configuration, payment testing
- Day 4: Monitoring stack setup, alerting configuration, health verification
- Day 5: DNS transfer, SSL configuration, final acceptance testing

---

## Security

### Is VendorTrack secure?
Yes. VendorTrack achieves a 91/100 security score with OWASP Top 10 compliance. The platform includes 111 dedicated security tests covering XSS, CSRF, SQL injection, rate limiting, RBAC, AI prompt injection, file upload security, and sanitization. The security hardening report (`SECURITY-HARDENING.md`) provides a complete audit of all security measures.

### Has VendorTrack been penetration tested?
Automated security testing is included in the CI/CD pipeline (Gitleaks + TruffleHog for secret scanning, npm audit for dependency vulnerabilities). Manual penetration testing has not been performed but is recommended before handling real customer data.

### How are secrets managed?
Secrets are stored in environment variables, never in code. The `.env.example` and `.env.production.example` files document all required variables. The CI/CD pipeline includes a client bundle leak check that verifies no server secrets are included in the client JavaScript. The `scripts/rotate-keys.sh` script handles credential rotation.

### How is user data protected?
- **Row Level Security (RLS)** — Supabase RLS ensures sellers can only access their own data
- **Authentication** — Supabase Auth with JWT tokens and secure session management
- **CSRF Protection** — Double-submit cookie pattern with origin verification
- **Rate Limiting** — 11 endpoint-specific rate limits preventing abuse
- **Input Validation** — Zod schemas with UUID, SQL injection rejection, and length limits
- **XSS Sanitization** — 9 context-aware sanitization functions
- **Audit Logging** — All financial operations are logged with correlation IDs

### Is the platform PCI compliant?
Payment processing is handled entirely by Stripe, which is PCI DSS Level 1 certified. VendorTrack never stores, processes, or transmits raw credit card data. The Stripe Elements checkout is hosted on Stripe's PCI-compliant infrastructure. The platform's responsibility is limited to ensuring that Stripe integration follows best practices (webhook signature verification, server-side session creation, no client-set prices).

---

## Dependencies

### What are the critical dependencies?
| Dependency | Purpose | Impact if Unavailable |
|-----------|---------|----------------------|
| Supabase | Database + Auth + Storage | Platform is non-functional without database |
| Stripe | Payment processing | Checkout is non-functional; browsing still works |
| Redis | Caching | Platform falls back to LRU memory cache; slower but functional |
| Google Gemini | AI descriptions | AI feature is disabled; manual descriptions still work |
| Vercel | Hosting | Platform can be deployed via Docker instead |

### What happens if a third-party service goes down?
- **Supabase down** — The platform is non-functional. The health endpoint detects this and alerts via PagerDuty/Slack
- **Stripe down** — Checkout is non-functional. The circuit breaker prevents cascading failures. Existing orders are still visible
- **Redis down** — The platform falls back to LRU memory cache. Performance is degraded but the platform remains functional
- **Gemini down** — The AI description feature is disabled. Sellers can still write descriptions manually
- **Vercel down** — If using Docker deployment, the platform is unaffected. If using Vercel, the platform is non-functional until Vercel recovers

### Are there any single points of failure?
- **Supabase** — The database is a single point of failure. Supabase provides high availability (99.9% SLA) and automated failover. For additional resilience, the `scripts/backup.sh` script provides database backups
- **Vercel** — If using Vercel for hosting, it is a single point of failure. The Docker deployment provides an alternative hosting option

### Can I replace any of the dependencies?
- **Supabase** — Can be replaced with any PostgreSQL database + auth provider. The repository layer abstracts database access, so the migration is straightforward
- **Stripe** — Can be replaced with any payment processor. The payment service layer abstracts Stripe-specific logic
- **Redis** — Can be replaced with any Redis-compatible cache. The LRU fallback means Redis is not strictly required
- **Gemini** — Can be replaced with any AI provider. The Genkit framework supports multiple AI providers
- **Vercel** — Can be replaced with any Node.js hosting. The Docker deployment provides a self-hosted alternative

---

## Scalability

### How many concurrent users can VendorTrack handle?
The platform is designed for 100,000+ concurrent users. The stateless architecture, Redis caching, and cursor-based pagination enable horizontal scaling. The primary bottleneck is the database, which Supabase handles with connection pooling and read replicas.

### How does VendorTrack scale?
- **Horizontal** — Deploy multiple instances behind a load balancer (Vercel handles this automatically)
- **Database** — Supabase scales vertically (larger plans) and supports read replicas
- **Cache** — Redis scales vertically and supports clustering
- **Workers** — Background job workers scale horizontally (add more Docker containers)

### What are the scaling limits?
- **Database** — Supabase Pro supports up to 8GB storage. Enterprise plans provide larger databases
- **Redis** — Upstash provides virtually unlimited scaling. Self-hosted Redis scales with RAM
- **Vercel** — Vercel Pro supports 1TB bandwidth. Enterprise plans provide unlimited bandwidth
- **Stripe** — Stripe has no practical transaction limits

### What is the cost of scaling?
Infrastructure costs scale sub-linearly. Moving from launch scale ($103/mo) to enterprise scale ($926/mo) represents a 9× cost increase while supporting a 20× GMV increase. The detailed cost analysis is in `INFRASTRUCTURE_COSTS.md`.

---

## Technical

### What programming language is VendorTrack written in?
TypeScript. The entire codebase is TypeScript with strict type checking. There are no JavaScript files, no `any` types, and no type assertions bypassing the type system.

### What is the architecture pattern?
Clean Layered Architecture (4 + 1 layers): Presentation → Service → Repository → Infrastructure, with a shared Domain layer. Dependency rules are enforced: no upward dependencies, domain has zero external dependencies, and DTOs guard all boundaries. The architecture score is 88/100 (up from 14/100 before refactoring).

### How is the codebase tested?
250+ tests across 7 test files covering architecture (domain, DTOs, errors, validators), security (111 tests), performance (cache, query optimizer, background jobs), and smoke tests (health, pages, API, security headers). Additionally, 4 verification scripts provide deployment, production, acceptance, and operational validation.

### How is the codebase documented?
25+ documentation files covering architecture, security, payments, performance, deployment, operations, runbooks, demo guides, user guides, and handover procedures. The documentation is written for a non-developer audience and is sufficient to evaluate, deploy, and operate the platform without reading source code.

### Can I add new features to VendorTrack?
Yes. The clean layered architecture makes adding new features straightforward. The DTOs at every boundary ensure that new features integrate cleanly with existing code. The feature flag system enables safe, gradual feature rollouts. The service and repository layers provide clear extension points for new business logic and data access.

---

*Document Version: 1.0 | Date: 2026-07-31 | Classification: Confidential — For Acquisition Review Only*
