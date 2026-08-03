# VendorTrack Security Policy

This document defines the security practices, procedures, and guidelines for the VendorTrack application. All team members, contributors, and operators must follow these policies.

---

## 1. Secret Management

### 1.1 Environment Variables

All credentials and secrets are managed through environment variables. The application uses a **fail-fast** validation pattern: if any required variable is missing at startup, the application will refuse to start.

| Variable | Scope | Required | Description |
|----------|-------|----------|-------------|
| `STRIPE_SECRET_KEY` | Server-only | Yes | Stripe secret key for payment processing |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Client-safe | Yes | Stripe publishable key for Elements |
| `STRIPE_WEBHOOK_SECRET` | Server-only | Yes | Webhook signature verification |
| `NEXT_PUBLIC_SUPABASE_URL` | Client-safe | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-safe | Yes | Supabase anon key (RLS-protected) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Yes | Admin database access (bypasses RLS) |
| `GEMINI_API_KEY` | Server-only | No | AI product description generation |
| `ALGOLIA_APP_ID` | Client-safe | No | Search service (optional) |
| `ALGOLIA_API_KEY` | Server-only | No | Search admin key (optional) |

### 1.2 Server-Only vs Client-Safe

Variables prefixed with `NEXT_PUBLIC_` are embedded into the client JavaScript bundle by Next.js at build time. **Never assign server-only secrets to `NEXT_PUBLIC_` variables.**

**Server-only variables** (no `NEXT_PUBLIC_` prefix):
- `STRIPE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `GEMINI_API_KEY`
- `ALGOLIA_API_KEY`

These are only accessible in:
- API routes (`src/app/api/`)
- Server Actions (`'use server'` directives)
- Server Components (no `'use client'` directive)
- `src/instrumentation.ts`

### 1.3 Local Development

1. Copy `.env.example` to `.env.local`
2. Fill in all required values
3. Never commit `.env.local` to version control

```bash
cp .env.example .env.local
# Edit .env.local with real values
```

### 1.4 Production Deployment

Use your hosting platform's encrypted environment variable storage:
- **Vercel**: Project Settings → Environment Variables
- **AWS**: Secrets Manager or Parameter Store
- **GCP**: Secret Manager
- **Self-hosted**: HashiCorp Vault or encrypted `.env` files

---

## 2. Credential Rotation

### 2.1 Rotation Schedule

| Provider | Frequency | Trigger |
|----------|-----------|---------|
| Stripe | Every 90 days | Or immediately after any suspected leak |
| Supabase | Every 90 days | Or immediately after any suspected leak |
| Gemini / Google AI | Every 90 days | Or immediately after any suspected leak |
| Firebase | Every 90 days | Or immediately after any suspected leak |
| GitHub Token | Every 90 days | Or immediately after any suspected leak |
| Algolia | Every 90 days | Or immediately after any suspected leak |

### 2.2 Rotation Procedures

#### Stripe
1. Go to [Stripe Dashboard → Developers → API Keys](https://dashboard.stripe.com/apikeys)
2. Click "Roll key" on the existing secret key
3. Update the new key in your hosting platform's environment variables
4. Redeploy the application
5. Verify webhook processing still works

#### Supabase
1. Go to [Supabase Dashboard → Project Settings → API](https://supabase.com/dashboard)
2. Click "Reset" on the service_role key
3. Update the new key in your hosting platform's environment variables
4. Redeploy the application
5. Verify all API routes still function

#### Gemini / Google AI
1. Go to [Google AI Studio → API Keys](https://aistudio.google.com/apikey)
2. Delete the existing key
3. Create a new key
4. Update the new key in your hosting platform's environment variables
5. Redeploy

---

## 3. Incident Response

### 3.1 Secret Leak Response Procedure

If a secret is accidentally committed, pushed, or otherwise exposed:

1. **IMMEDIATE (0-15 minutes)**:
   - Rotate the exposed credential immediately
   - Do NOT just delete the secret from the repo — it may already be in git history
   - Notify the security team / project lead

2. **SHORT-TERM (15-60 minutes)**:
   - Purge the secret from git history using `git filter-repo` or BFG Repo Cleaner
   - Run `gitleaks detect` to verify no other secrets are present
   - Check access logs on the affected provider (Stripe, Supabase, etc.) for unauthorized usage

3. **LONG-TERM (1-24 hours)**:
   - Force-push the cleaned history to all remotes
   - All collaborators must re-clone the repository
   - Document the incident in the security log
   - Review and update this policy if needed

### 3.2 Git History Cleaning

To remove a secret from git history permanently:

```bash
# Option A: Using git filter-repo (recommended)
pip install git-filter-repo
git filter-repo --invert-paths --path .env --path .env.local

# Option B: Using BFG Repo Cleaner
java -jar bfg.jar --delete-files .env
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# After cleaning, force-push to all remotes
git push origin --force --all
```

---

## 4. Environment Setup

### 4.1 New Developer Onboarding

1. Clone the repository
2. Run `npm install`
3. Copy `.env.example` to `.env.local`
4. Obtain development credentials from the team lead
5. Fill in `.env.local` with development values
6. Run `npm run dev` to verify the application starts
7. Run `gitleaks detect --config=.gitleaks.toml` to verify no secrets are present

### 4.2 Key Storage

- **Development**: `.env.local` (gitignored, never committed)
- **Staging**: Hosting platform environment variables (encrypted at rest)
- **Production**: Hosting platform environment variables (encrypted at rest)
- **CI/CD**: GitHub Secrets (encrypted, never exposed in logs)

### 4.3 Forbidden Patterns

The following patterns are NEVER allowed in the repository:

- Real API keys in any file (including comments, documentation, or test files)
- `NEXT_PUBLIC_` prefix on server-only secrets
- Hardcoded connection strings with embedded credentials
- Private keys, certificates, or SSH keys in the repository
- Base64-encoded secrets in source code

---

## 5. Developer Guidelines

### 5.1 Adding a New Secret

1. Add the variable to `.env.example` with an empty value and a comment
2. Add the variable to the `ENV_SPEC` array in `src/lib/env.ts`
3. Mark it as `serverOnly: true` if it should never reach the client
4. Access it via `requireEnv('VARIABLE_NAME')` in server code
5. Never use `process.env.VARIABLE_NAME` directly — use the validation module

### 5.2 Adding a New API Route

1. Use `getSupabaseAdmin()` from `@/lib/supabase-admin` for admin operations
2. Use `createRouteHandlerClient({ cookies })` for user-scoped operations
3. Never import `SUPABASE_SERVICE_ROLE_KEY` directly — use `requireEnv()`
4. Never import `@supabase/supabase-js` directly in API routes — use the provided clients

### 5.3 Pre-Commit Hooks

The repository uses Husky pre-commit hooks that run:
1. **Gitleaks** — Secret scanning (blocks commits with secrets)
2. **ESLint** — Code quality checks
3. **TypeScript** — Type checking

To bypass hooks in emergencies (NOT recommended):
```bash
git commit --no-verify
```

### 5.4 CI/CD Pipeline

Every push and pull request triggers:
1. Secret scanning (Gitleaks + TruffleHog)
2. Build verification
3. Client bundle leak check (verifies no server secrets in `.next/static/`)

Deployments to production will fail if any secret is detected.

---

## 6. Security Architecture

### 6.1 Defense in Depth

```
Client (Browser)                    Server (Node.js)
┌─────────────────┐                ┌─────────────────────────┐
│ NEXT_PUBLIC_    │                │ Server-only variables   │
│  SUPABASE_URL   │                │  STRIPE_SECRET_KEY      │
│  SUPABASE_ANON  │                │  SUPABASE_SERVICE_ROLE  │
│  STRIPE_PK      │                │  STRIPE_WEBHOOK_SECRET  │
│                 │                │  GEMINI_API_KEY         │
│  RLS-protected  │                │                         │
│  queries only   │                │  Admin DB access        │
│                 │                │  Payment processing     │
│  Cannot access  │                │  Webhook verification   │
│  service role   │                │  AI generation          │
└─────────────────┘                └─────────────────────────┘
```

### 6.2 Environment Variable Validation

At application startup, `src/instrumentation.ts` calls `requireEnvironment()` which:
- Validates all required variables are present
- Checks format patterns (e.g., Stripe keys start with `sk_test_` or `sk_live_`)
- Detects placeholder values (e.g., "your-api-key")
- Warns about server-only variables with `NEXT_PUBLIC_` prefix
- Throws a detailed error if any check fails

### 6.3 Client Bundle Protection

The application uses multiple layers to prevent server secrets from reaching the client:

1. **Naming convention**: Server-only variables lack the `NEXT_PUBLIC_` prefix
2. **Runtime check**: `getSupabaseAdmin()` throws if called from `window` context
3. **Build-time check**: CI pipeline scans `.next/static/` for leaked secrets
4. **Pre-commit check**: Gitleaks scans staged files before they're committed

---

## 7. Audit Log

| Date | Event | Action |
|------|-------|--------|
| 2026-07-30 | Initial security hardening | All secrets removed from .env, env validation added, scanning configured |

---

## 8. Contact

For security concerns or to report a vulnerability, contact the project maintainers.
