# VendorTrack — Infrastructure & Operational Costs

> A detailed cost analysis for deploying and operating VendorTrack in production, from launch scale to enterprise scale.

---

## Cost Philosophy

VendorTrack is designed around **managed services**, not self-hosted infrastructure. This means predictable, linear cost scaling with zero upfront infrastructure investment. The platform can be launched for under $200/month and scaled to handle 100,000+ concurrent users without architectural changes.

---

## Monthly Cost Breakdown — Launch Scale

*Assumptions: 100 sellers, 5,000 monthly transactions, $50 average order value, US East region*

| Service | Tier | Monthly Cost | Notes |
|---------|------|-------------|-------|
| **Supabase Pro** | $25/mo | $25 | 8GB database, 100GB storage, 500MB RAM |
| **Vercel Pro** | $20/mo per member | $20 | 1TB bandwidth, 100GB-Hrs serverless, 2 regions |
| **Stripe** | 2.9% + 30¢ per transaction | $895 | On $250,000 monthly GMV (5,000 × $50) |
| **Redis (Upstash)** | Pay-as-you-go | $10 | 10K commands/day, 256MB |
| **Google Gemini** | Pay-as-you-go | $20 | ~2,000 AI descriptions/month |
| **Sentry Team** | $26/mo | $26 | 50K events/month, 1 project |
| **Domain** | Annual / 12 | $2 | .com domain |
| **SSL Certificate** | Free (Vercel) | $0 | Automatic SSL via Vercel |
| **CDN** | Free (Vercel) | $0 | Edge CDN included with Vercel |
| **Monitoring** | Self-hosted (Docker) | $0 | Prometheus + Grafana + Alertmanager |
| **PagerDuty** | Free tier | $0 | Up to 5 users |
| **Slack** | Free tier | $0 | Alerting channel |
| | | **$998/mo** | **Total (excluding Stripe processing fees)** |

### Net Platform Revenue vs. Infrastructure Cost

| Metric | Value |
|--------|-------|
| Monthly GMV | $250,000 |
| Platform Commission (10%) | $25,000 |
| Stripe Processing Fees | $8,950 |
| **Net Platform Revenue** | **$16,050** |
| Infrastructure Cost | $103 |
| **Net Profit** | **$15,947** |

> **Key Insight**: At launch scale, infrastructure costs represent **0.6%** of net platform revenue. The platform is profitable from the first transaction.

---

## Monthly Cost Breakdown — Growth Scale

*Assumptions: 500 sellers, 25,000 monthly transactions, $50 average order value, US East + US West regions*

| Service | Tier | Monthly Cost | Notes |
|---------|------|-------------|-------|
| **Supabase Pro** | $25/mo + additional | $75 | 32GB database, 500GB storage, 2GB RAM |
| **Vercel Pro** | $20/mo per member | $60 | 2 team members, 2 regions |
| **Stripe** | 2.9% + 30¢ per transaction | $4,475 | On $1,250,000 monthly GMV |
| **Redis (Upstash)** | Pay-as-you-go | $30 | 100K commands/day, 1GB |
| **Google Gemini** | Pay-as-you-go | $50 | ~10,000 AI descriptions/month |
| **Sentry Team** | $26/mo | $26 | 50K events/month |
| **Monitoring** | Self-hosted (Docker) | $20 | Small VPS for Prometheus/Grafana |
| **PagerDuty** | Professional | $29 | Up to 10 users |
| | | **$765/mo** | **Total (excluding Stripe processing fees)** |

### Net Platform Revenue vs. Infrastructure Cost

| Metric | Value |
|--------|-------|
| Monthly GMV | $1,250,000 |
| Platform Commission (10%) | $125,000 |
| Stripe Processing Fees | $44,750 |
| **Net Platform Revenue** | **$80,250** |
| Infrastructure Cost | $765 |
| **Net Profit** | **$79,485** |

---

## Monthly Cost Breakdown — Enterprise Scale

*Assumptions: 2,000 sellers, 100,000 monthly transactions, $50 average order value, global deployment*

| Service | Tier | Monthly Cost | Notes |
|---------|------|-------------|-------|
| **Supabase Enterprise** | Custom | $300 | Dedicated instance, 100GB+ database, 4GB+ RAM |
| **Vercel Enterprise** | Custom | $150 | 5 team members, global regions, priority support |
| **Stripe** | 2.9% + 30¢ per transaction | $17,900 | On $5,000,000 monthly GMV |
| **Redis (Upstash)** | Enterprise | $100 | Dedicated instance, 5GB+ |
| **Google Gemini** | Pay-as-you-go | $200 | ~50,000 AI descriptions/month |
| **Sentry Business** | $80/mo | $80 | 200K events/month, 5 projects |
| **Monitoring** | Self-hosted (Docker) | $50 | Dedicated VPS for monitoring stack |
| **PagerDuty** | Business | $46 | Up to 25 users |
| **CDN** | Vercel Edge | $0 | Included with Vercel Enterprise |
| | | **$926/mo** | **Total (excluding Stripe processing fees)** |

### Net Platform Revenue vs. Infrastructure Cost

| Metric | Value |
|--------|-------|
| Monthly GMV | $5,000,000 |
| Platform Commission (10%) | $500,000 |
| Stripe Processing Fees | $179,000 |
| **Net Platform Revenue** | **$321,000** |
| Infrastructure Cost | $926 |
| **Net Profit** | **$320,074** |

---

## Cost Scaling Analysis

### Infrastructure Cost vs. Revenue

| Scale | Sellers | Monthly GMV | Infrastructure | Net Revenue | Infra as % of Revenue |
|-------|---------|-------------|---------------|-------------|----------------------|
| Launch | 100 | $250K | $103 | $16,050 | 0.6% |
| Growth | 500 | $1.25M | $765 | $80,250 | 1.0% |
| Enterprise | 2,000 | $5M | $926 | $321,000 | 0.3% |

### Key Observations
1. **Infrastructure costs scale sub-linearly** — Moving from launch to enterprise (20× GMV) only increases infrastructure costs by 9×
2. **Infrastructure is never a significant cost** — Even at launch scale, infrastructure is less than 1% of net revenue
3. **Stripe is the dominant variable cost** — Stripe processing fees represent ~90% of all costs at every scale
4. **No hidden costs** — No Kubernetes administrators, no database administrators, no DevOps engineers required

---

## One-Time Setup Costs

| Item | Cost | Notes |
|------|------|-------|
| Domain Registration | $10–$15/year | .com domain |
| SSL Certificate | $0 | Free via Vercel/Let's Encrypt |
| Supabase Project Setup | $0 | Included with plan |
| Stripe Connect Setup | $0 | No setup fee |
| Google Gemini API Key | $0 | No setup fee |
| Sentry Account Setup | $0 | Included with plan |
| Monitoring Stack Setup | $0 | Docker self-hosted |
| DNS Configuration | $0 | Free via Vercel/Cloudflare |
| **Total One-Time Cost** | **$10–$15** | **Domain registration only** |

---

## Team Cost Analysis

### Minimum Viable Team

| Role | Count | Monthly Cost | Notes |
|------|-------|-------------|-------|
| Full-Stack Engineer | 1 | $8,000–$15,000 | Operates and maintains the platform |
| **Total** | **1** | **$8,000–$15,000** | **Single-engineer operations** |

### Growth Team

| Role | Count | Monthly Cost | Notes |
|------|-------|-------------|-------|
| Full-Stack Engineer | 1 | $8,000–$15,000 | Platform operations |
| Frontend Engineer | 1 | $6,000–$12,000 | Feature development |
| Product Manager | 1 | $6,000–$10,000 | Product strategy |
| **Total** | **3** | **$20,000–$37,000** | **Feature development team** |

### Enterprise Team

| Role | Count | Monthly Cost | Notes |
|------|-------|-------------|-------|
| Senior Engineer | 2 | $20,000–$30,000 | Platform + feature development |
| Product Manager | 1 | $6,000–$10,000 | Product strategy |
| Designer | 1 | $5,000–$8,000 | UX/UI |
| Customer Support | 1 | $3,000–$5,000 | Seller/buyer support |
| **Total** | **5** | **$34,000–$53,000** | **Full marketplace team** |

---

## Cost Comparison vs. SaaS Alternatives

| Platform | Monthly Cost (100 sellers) | Monthly Cost (500 sellers) | Vendor Lock-In |
|----------|--------------------------|--------------------------|---------------|
| **VendorTrack** | $103 (infra only) | $765 (infra only) | ✅ None |
| **Sharetribe Pro** | $399 + transaction fees | $399 + transaction fees | ❌ High |
| **Marketplacer** | $500+ | $1,500+ | ❌ High |
| **Arcadier Pro** | $399 + transaction fees | $399 + transaction fees | ❌ High |
| **CS-Cart** | $0 (self-hosted) + server | $0 (self-hosted) + server | ⚠️ Medium |

> **Note**: SaaS platforms charge recurring subscription fees regardless of your marketplace's revenue. VendorTrack's infrastructure costs scale with actual usage, not with a fixed subscription tier.

---

## Storage Cost Projections

| Data Type | Volume (Launch) | Volume (Growth) | Volume (Enterprise) | Cost |
|-----------|----------------|-----------------|---------------------|------|
| Database | 1 GB | 5 GB | 25 GB | Included in Supabase |
| Product Images | 1 GB | 10 GB | 50 GB | Included in Supabase |
| Logs | 500 MB | 2 GB | 10 GB | Included in Sentry |
| Redis Cache | 256 MB | 1 GB | 5 GB | Included in Upstash |
| **Total Storage** | **2.75 GB** | **18 GB** | **90 GB** | **Included in plans** |

---

## Cost Risk Factors

### Low Risk
- **Supabase pricing** — Well-documented, predictable, and scales linearly
- **Vercel pricing** — Usage-based with generous free tiers
- **Stripe pricing** — Standard 2.9% + 30¢, no surprises

### Medium Risk
- **Redis** — If Redis is self-hosted, the operational cost of managing a Redis instance (monitoring, backups, failover) should be factored in
- **Gemini API** — AI usage can spike if sellers generate many descriptions; token budgets and rate limiting are in place to control costs

### Low Risk (Mitigated)
- **Bandwidth overages** — Vercel's CDN and edge caching minimize bandwidth costs
- **Database storage** — Supabase's storage limits are generous and increase with plan tier
- **Sentry event volume** — Rate limiting and sampling prevent unexpected event volume

---

## Summary

| Scale | Infrastructure | Team | Total Monthly | Net Revenue | ROI |
|-------|---------------|------|--------------|-------------|-----|
| Launch | $103/mo | $8K–$15K | $8.1K–$15.1K | $16,050 | 106–198% |
| Growth | $765/mo | $20K–$37K | $20.8K–$37.8K | $80,250 | 212–386% |
| Enterprise | $926/mo | $34K–$53K | $34.9K–$53.9K | $321,000 | 596–920% |

**Key Takeaway**: VendorTrack's managed-service architecture makes infrastructure costs negligible at every scale. The primary cost driver is team size, and the platform is designed for single-engineer operations at launch scale. The ROI is positive from the first month of operation.

---

*Document Version: 1.0 | Date: 2026-07-31 | Classification: Confidential — For Acquisition Review Only*
