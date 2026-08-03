# VendorTrack Documentation Portal

> Central navigation hub for all VendorTrack documentation.
> **Stack:** Next.js 14 | Supabase (PostgreSQL) | Stripe Connect | Redis | Google Genkit (Gemini 2.5)

---

## 1. Documentation Overview

This portal organizes every document in the VendorTrack knowledge base into a single,
navigable reference. The documentation set covers the full lifecycle of the platform:
from architectural decisions and security hardening through deployment, operations,
and acquisition due diligence.

### How to Use These Docs

| Goal | Start Here |
|---|---|
| Join the engineering team | DEVELOPER_GUIDE.md, then ARCHITECTURE.md |
| Deploy or operate the platform | DEPLOYMENT.md, then OPERATIONS.md |
| Administer users and permissions | ADMIN_GUIDE.md, then AUTHORIZATION.md |
| Evaluate the asset for acquisition | BUYER_GUIDE.md, then ARCHITECTURE.md |
| Integrate with the API | API_REFERENCE.md, then PAYMENTS.md |
| Resolve a production incident | RUNBOOK.md, then TROUBLESHOOTING.md |
| Understand the data model | DATABASE.md, then ARCHITECTURE.md |
| Quick handover summary | HANDOVER.md |

### Document Location Convention

All primary documents reside in the project root (`/`). Supporting SQL migrations,
blueprints, and checklists live in the `/docs` directory alongside this portal.

```
project-root/
  ARCHITECTURE.md
  DATABASE.md
  SECURITY.md
  ...
  docs/
    README.md              <-- you are here
    supabase-schema.sql
    supabase-*-migration.sql
    CREDENTIAL_ROTATION_CHECKLIST.md
    ...
```

---

## 2. Quick Navigation

### 2.1 For New Engineers (Onboarding Path)

The recommended reading order for engineers joining the project:

| Step | Document | Why |
|---|---|---|
| 1 | HANDOVER.md | 60-second project orientation |
| 2 | DEVELOPER_GUIDE.md | Environment setup, tooling, conventions |
| 3 | ARCHITECTURE.md | Layer diagram, data flow, domain boundaries |
| 4 | DATABASE.md | Schema, ER diagram, migration strategy |
| 5 | CODE_QUALITY.md | Linting, formatting, PR standards |
| 6 | TESTING.md | Test pyramid, coverage expectations, CI gates |
| 7 | API_REFERENCE.md | Endpoint catalog, auth patterns, error codes |
| 8 | AUTHORIZATION.md | RBAC model, role definitions, RLS policies |

### 2.2 For Operators (Deployment, Monitoring, Runbooks)

| Document | Focus |
|---|---|
| DEPLOYMENT.md | Infrastructure provisioning, release procedures, rollback |
| OPERATIONS.md | Day-to-day operational procedures and checklists |
| OPERATIONS_MANUAL.md | Extended operational reference and SOPs |
| RUNBOOK.md | Incident response playbooks and diagnostic flows |
| TROUBLESHOOTING.md | Symptom-based problem resolution guide |
| DEVOPS.md | CI/CD pipelines, container orchestration, observability |
| PERFORMANCE.md | Benchmarking, caching strategy, optimization targets |
| CREDENTIAL_ROTATION_CHECKLIST.md | Step-by-step credential rotation procedures |

### 2.3 For Administrators (Admin Guide, User Management)

| Document | Focus |
|---|---|
| ADMIN_GUIDE.md | Platform administration, seller verification, moderation |
| USER_GUIDE.md | End-user features, buyer/seller workflows |
| AUTHORIZATION.md | RBAC roles, permission matrix, RLS enforcement |
| SECURITY.md | Security policy, vulnerability reporting, compliance |
| SECURITY-HARDENING.md | OWASP Top 10 mitigations, input validation, CSRF protection |

### 2.4 For Buyers and Acquirers (Due Diligence)

| Document | Focus |
|---|---|
| BUYER_GUIDE.md | M&A due diligence package, asset valuation, risk assessment |
| README.md | Investor pitch, technical moats, deployment readiness |
| ARCHITECTURE.md | System design, scalability, technology choices |
| ARCHITECTURE-AUDIT-REPORT.md | Refactoring priorities, technical debt inventory |
| PAYMENTS.md | Stripe Connect integration, revenue model, commission logic |
| SECURITY.md | Security posture, compliance status, audit readiness |
| DATABASE.md | Data integrity guarantees, ACID compliance, migration history |

### 2.5 For Developers (API Reference, Developer Guide, Testing)

| Document | Focus |
|---|---|
| API_REFERENCE.md | Complete endpoint catalog with request/response schemas |
| DEVELOPER_GUIDE.md | Local development setup, debugging, contribution workflow |
| TESTING.md | Test strategy, fixtures, mocking patterns, CI integration |
| CODE_QUALITY.md | TypeScript/React conventions, naming, import rules |
| DATABASE.md | Schema reference, migration authoring, RLS policy testing |
| PAYMENTS.md | Stripe webhook handling, idempotency, refund flows |
| PERFORMANCE.md | Render profiling, bundle optimization, caching layers |

---

## 3. Document Inventory

### 3.1 Primary Documents

| Document | Audience | Purpose | Lines | Status |
|---|---|---|---|---|
| README.md | Investors, Buyers | Investor pitch deck and technical moat summary | 31 | Published |
| ARCHITECTURE.md | Engineers, Buyers | System architecture, layer diagram, data flow, domain boundaries | 460 | Published |
| ARCHITECTURE-AUDIT-REPORT.md | Engineers, Buyers | Refactoring priorities and technical debt inventory | 227 | Published |
| DATABASE.md | Engineers | Database schema reference, ER diagram, migration strategy | 499 | Published |
| SECURITY.md | Engineers, Admins, Buyers | Security policy, vulnerability reporting, compliance overview | 264 | Published |
| SECURITY-HARDENING.md | Engineers | OWASP Top 10 mitigations, input validation, CSRF/XSS defenses | 342 | Published |
| AUTHORIZATION.md | Engineers, Admins | RBAC system, role definitions, permission matrix, RLS policies | 281 | Published |
| PAYMENTS.md | Engineers, Buyers | Stripe Connect integration, commission logic, webhook handling | 544 | Published |
| PERFORMANCE.md | Engineers | Performance engineering, caching strategy, optimization targets | 459 | Published |
| DEVOPS.md | Operators, Engineers | CI/CD pipelines, container orchestration, observability stack | 484 | Published |
| OPERATIONS.md | Operators | Day-to-day operational procedures and health checklists | 875 | Published |
| DEPLOYMENT.md | Operators | Infrastructure provisioning, release procedures, rollback strategy | 1128 | Published |
| RUNBOOK.md | Operators | Incident response playbooks and diagnostic decision trees | 1694 | Published |
| CODE_QUALITY.md | Engineers | Coding standards, linting rules, PR review checklist | 316 | Published |
| API_REFERENCE.md | Engineers | API endpoint catalog with request/response schemas | -- | Planned |
| ADMIN_GUIDE.md | Admins | Platform administration, seller verification, moderation tools | -- | Planned |
| USER_GUIDE.md | End Users | Buyer and seller feature walkthroughs | -- | Planned |
| DEVELOPER_GUIDE.md | Engineers | Local setup, debugging, contribution workflow | -- | Planned |
| BUYER_GUIDE.md | Buyers, Acquirers | M&A due diligence package and asset valuation | -- | Planned |
| OPERATIONS_MANUAL.md | Operators | Extended operational reference and standard operating procedures | -- | Planned |
| TROUBLESHOOTING.md | Operators, Engineers | Symptom-based problem resolution guide | -- | Planned |
| TESTING.md | Engineers | Test strategy, fixtures, mocking patterns, CI integration | -- | Planned |
| HANDOVER.md | All | Quick handover summary and orientation document | 55 | Published |

> **Note:** Line counts reflect the current state of published documents. Planned
> documents are outlined but not yet authored. Counts are approximate and will
> change as documents are updated.

### 3.2 Supporting Documents

| Document | Audience | Purpose | Lines | Status |
|---|---|---|---|---|
| docs/supabase-migration-blueprint.md | Engineers | Migration strategy and ordering guide | 37 | Published |
| docs/blueprint.md | Engineers | Project blueprint reference | 17 | Published |
| docs/CREDENTIAL_ROTATION_CHECKLIST.md | Operators, Admins | Step-by-step credential rotation procedures | 125 | Published |
| docs/backend.json | Engineers | Backend service configuration reference | -- | Published |

---

## 4. Architecture Diagrams

The following diagrams are embedded within the primary documentation. Refer to the
source documents for full context and editable versions.

### 4.1 System Architecture Diagrams

| Diagram | Location | Description |
|---|---|---|
| Layer Diagram | ARCHITECTURE.md, Section 1 | Three-layer architecture: Presentation, Service, Repository |
| Dependency Rules | ARCHITECTURE.md, Section 2 | Allowed and forbidden dependency directions between layers |
| Data Flow | ARCHITECTURE.md, Section 4 | Request-to-response data flow through all layers |
| Request Lifecycle | ARCHITECTURE.md, Section 5 | Full request lifecycle from client to database and back |
| Domain Boundaries | ARCHITECTURE.md, Section 7 | Domain-driven design boundaries and service ownership |

### 4.2 Data Model Diagrams

| Diagram | Location | Description |
|---|---|---|
| ER Diagram | DATABASE.md, Section 2 | Entity-relationship diagram of all database tables |
| Schema Reference | DATABASE.md, Section 3+ | Column-level documentation for each table |

### 4.3 Security and Authorization Diagrams

| Diagram | Location | Description |
|---|---|---|
| RBAC Role Hierarchy | AUTHORIZATION.md | Role definitions and permission inheritance |
| Security Layers | SECURITY-HARDENING.md | Defense-in-depth layer diagram |

### 4.4 Payment Flow Diagrams

| Diagram | Location | Description |
|---|---|---|
| Checkout Flow | PAYMENTS.md | End-to-end checkout and payment capture flow |
| Webhook Processing | PAYMENTS.md | Stripe webhook event handling and idempotency |
| Refund Flow | PAYMENTS.md | Self-healing refund trigger on inventory race condition |

### 4.5 Deployment and Infrastructure Diagrams

| Diagram | Location | Description |
|---|---|---|
| CI/CD Pipeline | DEVOPS.md | Build, test, and deployment pipeline stages |
| Infrastructure Topology | DEPLOYMENT.md | Server, container, and service topology |
| Monitoring Stack | OPERATIONS.md | Observability and alerting architecture |

### Mermaid Diagram Availability

The current document set uses ASCII-art diagrams for maximum compatibility. When
migrating to interactive documentation platforms (Notion, GitBook, Confluence), these
diagrams should be converted to Mermaid syntax for renderability. The following
Mermaid diagram types are recommended for each conversion:

| Source Diagram | Mermaid Type |
|---|---|
| Layer Diagram | `graph TD` (top-down flowchart) |
| Data Flow | `sequenceDiagram` |
| ER Diagram | `erDiagram` |
| RBAC Hierarchy | `graph TD` with subgraphs |
| CI/CD Pipeline | `graph LR` (left-right flowchart) |
| Infrastructure Topology | `graph TD` with custom icons |

---

## 5. Migration Order

SQL migrations must be applied in strict sequential order to maintain schema integrity.
Each migration builds on the state established by its predecessor.

### 5.1 Migration Execution Sequence

| Order | File | Purpose | Lines |
|---|---|---|---|
| 001 | `docs/supabase-schema.sql` | Base schema: tables, constraints, indexes, enums | 154 |
| 002 | `docs/supabase-rls-migration.sql` | Row-Level Security policies for all tables | 330 |
| 003 | `docs/supabase-performance-migration.sql` | Indexes, query optimization, materialized views | 197 |
| 004 | `docs/supabase-payment-migration.sql` | Payment tables, Stripe Connect integration schema | 432 |
| 005 | `docs/supabase-devops-migration.sql` | Operational tables, audit log, health check functions | 180 |
| 006 | `docs/supabase-database-optimization-migration.sql` | Advanced optimizations, partitioning, vacuum config | 1106 |

### 5.2 Migration Guidelines

1. **Never skip a migration.** Each migration assumes the state produced by the
   previous one. Skipping will cause foreign key and column reference errors.
2. **Test in staging first.** Run the full migration sequence against a staging
   database before applying to production.
3. **Back up before migrating.** Take a `pg_dump` snapshot of the production
   database before applying any migration.
4. **Idempotent where possible.** Migrations use `IF NOT EXISTS` clauses to
   reduce the risk of partial failure on re-application.
5. **Rollback plan.** Each migration file should be accompanied by a rollback
   script (not yet authored; see ARCHITECTURE-AUDIT-REPORT.md for the backlog
   item).

### 5.3 Migration Dependency Graph

```
supabase-schema.sql
  |
  +--> supabase-rls-migration.sql
  |      |
  |      +--> supabase-performance-migration.sql
  |             |
  |             +--> supabase-payment-migration.sql
  |                    |
  |                    +--> supabase-devops-migration.sql
  |                           |
  |                           +--> supabase-database-optimization-migration.sql
```

---

## 6. Version History

### 6.1 Documentation Version Log

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0.0 | 2025-01-15 | VendorTrack Team | Initial documentation set: core architecture, database, security, payments |
| 1.1.0 | 2025-01-20 | VendorTrack Team | Added OPERATIONS.md, DEPLOYMENT.md, RUNBOOK.md |
| 1.2.0 | 2025-01-25 | VendorTrack Team | Added PERFORMANCE.md, DEVOPS.md, CODE_QUALITY.md |
| 1.3.0 | 2025-02-01 | VendorTrack Team | Added ARCHITECTURE-AUDIT-REPORT.md, SECURITY-HARDENING.md |
| 1.4.0 | 2025-02-05 | VendorTrack Team | Added AUTHORIZATION.md, CREDENTIAL_ROTATION_CHECKLIST.md |
| 1.5.0 | 2025-02-10 | VendorTrack Team | Added SQL migrations, HANDOVER.md, docs/README.md portal |
| 1.6.0 | -- | -- | Planned: API_REFERENCE.md, DEVELOPER_GUIDE.md, TESTING.md |
| 1.7.0 | -- | -- | Planned: ADMIN_GUIDE.md, USER_GUIDE.md, BUYER_GUIDE.md |
| 1.8.0 | -- | -- | Planned: OPERATIONS_MANUAL.md, TROUBLESHOOTING.md |

### 6.2 Document Status Definitions

| Status | Definition |
|---|---|
| Published | Reviewed, approved, and reflects current system state |
| Draft | Authored but not yet reviewed or approved |
| Planned | Outlined in the documentation backlog but not yet authored |
| Deprecated | Superseded by another document; retained for historical reference |
| Under Review | Authored and submitted for peer review; not yet approved |

---

## 7. Key Technology References

Quick reference links for the core technology stack.

| Technology | Version | Purpose | Key Docs |
|---|---|---|---|
| Next.js | 14 | Full-stack React framework (App Router) | ARCHITECTURE.md, DEVELOPER_GUIDE.md |
| Supabase | Latest | PostgreSQL database, Auth, Realtime, Storage | DATABASE.md, AUTHORIZATION.md |
| PostgreSQL | 15+ | Relational database with ACID guarantees | DATABASE.md, PERFORMANCE.md |
| Stripe Connect | Latest | Multi-vendor payment processing | PAYMENTS.md |
| Redis | 7+ | Caching, rate limiting, session store | PERFORMANCE.md, DEVOPS.md |
| Google Genkit | Latest | AI integration framework (Gemini 2.5) | ARCHITECTURE.md |
| TypeScript | 5+ | Primary programming language | CODE_QUALITY.md |
| Tailwind CSS | 3+ | Utility-first CSS framework | CODE_QUALITY.md |
| Vercel | -- | Deployment platform | DEPLOYMENT.md |

---

## 8. Document Cross-Reference Matrix

This matrix shows which documents reference each other, helping you understand
dependencies between documents when updating content.

|  | ARCH | DB | SEC | AUTH | PAY | PERF | DEVOPS | OPS | DEPLOY | RUNBOOK | CODE | HANDOVER |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **ARCHITECTURE** | -- | X | | | X | X | X | | | | | X |
| **DATABASE** | X | -- | X | X | X | X | | | | | | |
| **SECURITY** | X | X | -- | X | | | | | | | | |
| **AUTHORIZATION** | X | X | X | -- | | | | | | | | |
| **PAYMENTS** | X | X | | | -- | | | | | | | |
| **PERFORMANCE** | X | X | | | | -- | X | | | | | |
| **DEVOPS** | X | | | | | X | -- | X | X | | | |
| **OPERATIONS** | | | | | | | X | -- | X | X | | |
| **DEPLOYMENT** | | | | | | | X | X | -- | | | |
| **RUNBOOK** | | X | | | X | | | X | | -- | | |
| **CODE_QUALITY** | X | | | | | | | | | | -- | |
| **HANDOVER** | X | | | | | | | | | | | -- |

---

## 9. Contributing to Documentation

### 9.1 Documentation Standards

All documents in the VendorTrack knowledge base must follow these standards:

1. **Format:** Markdown (GitHub Flavored Markdown with table support).
2. **Structure:** Begin with a title (`#`), followed by a table of contents.
3. **Language:** Use clear, concise technical English. Avoid jargon without
   definition.
4. **Code examples:** Use fenced code blocks with language identifiers.
5. **Tables:** Use pipe-delimited tables for structured data. Keep column counts
   under 6 for readability.
6. **Headings:** Use ATX-style headings (`#`, `##`, `###`). Do not skip levels.
7. **Cross-references:** Use relative Markdown links to other documents in the
   repository.
8. **Line length:** Keep lines under 120 characters where practical.

### 9.2 Review Process

1. Author or update the document in a feature branch.
2. Open a pull request with the `documentation` label.
3. At least one peer review is required before merge.
4. Update the version history table in this portal when merging.
5. Update the line count in the document inventory table.

### 9.3 Adding a New Document

When adding a new document to the knowledge base:

1. Create the document in the project root or `/docs` as appropriate.
2. Add an entry to the Document Inventory table (Section 3).
3. Add the document to the relevant Quick Navigation audience table (Section 2).
4. Update the Cross-Reference Matrix (Section 8) if the document references
   or is referenced by other documents.
5. Update the Version History table (Section 6).
6. If the document introduces new SQL migrations, update the Migration Order
   table (Section 5).

---

## 10. Glossary

| Term | Definition |
|---|---|
| ACID | Atomicity, Consistency, Isolation, Durability -- database transaction guarantees |
| GMV | Gross Merchandise Value -- total value of goods sold through the platform |
| Idempotency | Property where performing an operation multiple times yields the same result |
| PL/pgSQL | PostgreSQL's procedural language for writing functions and triggers |
| RLS | Row-Level Security -- PostgreSQL feature restricting row access by user context |
| RBAC | Role-Based Access Control -- authorization model based on assigned roles |
| Trace ID | Global identifier attached to every request for forensic audit correlation |
| Stripe Connect | Stripe's multi-party payment platform for marketplace commission splitting |
| Destination Charge | Stripe payment model where the platform takes a commission before paying the vendor |
| Genkit | Google's AI integration framework for building generative AI features |
| Gemini 2.5 | Google's large language model used for AI-powered features in VendorTrack |
| Self-Healing | Automatic refund mechanism triggered when inventory race conditions are detected |
| Audit Trail | Chronological record of system events tagged with trace IDs for compliance |

---

## 11. Contact and Support

| Role | Responsibility |
|---|---|
| Platform Lead | Architecture decisions, documentation ownership |
| DevOps Lead | Infrastructure, deployment, runbook maintenance |
| Security Lead | Security policy, vulnerability triage, hardening |
| Product Lead | Feature documentation, user-facing guides |

For questions about a specific document, open an issue in the project repository
with the `documentation` label and reference the document name.

---

*This portal is maintained alongside the VendorTrack documentation set. Last updated:
2025-02-10. For the current version, see the Version History table in Section 6.*
