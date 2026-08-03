# ============================================================
# VendorTrack — Credential Rotation Checklist
# ============================================================
#
# COMPLETE EVERY ITEM before marking this audit as resolved.
# Each exposed credential MUST be rotated — old keys are
# compromised regardless of whether they were used maliciously.
#
# ============================================================

## 🔴 CRITICAL — Rotate Immediately

### Stripe
- [ ] **Stripe Secret Key** (`sk_test_51Svc6F46ISTZn5oe...`)
  - Go to: https://dashboard.stripe.com/apikeys
  - Click "Roll key" on the existing secret key
  - New key is generated automatically
  - Update in hosting platform environment variables
  - Redeploy application
  - Verify: Process a test payment
  - [ ] Check Stripe Dashboard → Logs for unauthorized API calls
  - [ ] Review: Any payments, refunds, or customer data accessed with old key

- [ ] **Stripe Webhook Secret** (`whsec_...`)
  - Go to: https://dashboard.stripe.com/webhooks
  - Select the webhook endpoint → Click "Reset signing secret"
  - Update `STRIPE_WEBHOOK_SECRET` in hosting platform
  - Redeploy application
  - Verify: Send a test webhook event from Stripe Dashboard

- [ ] **Stripe Publishable Key** (`pk_test_51Svc6F46ISTZn5oe...`)
  - Publishable keys cannot be rolled independently
  - Rolling the secret key automatically rotates the publishable key
  - Update `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in hosting platform
  - Redeploy application

### Supabase
- [ ] **Supabase Service Role Key** (eyJhbGciOiJIUzI1NiIs...)
  - Go to: https://supabase.com/dashboard → Project Settings → API
  - Click "Reset" on the service_role key
  - ⚠️ This will invalidate ALL existing admin connections
  - Update `SUPABASE_SERVICE_ROLE_KEY` in hosting platform
  - Redeploy application
  - Verify: Test API routes that use admin client
  - [ ] Check Supabase Dashboard → Logs for unauthorized queries
  - [ ] Review: Any data access, modification, or deletion with old key

- [ ] **Supabase Anon Key** (eyJhbGciOiJIUzI1NiIs...)
  - Go to: https://supabase.com/dashboard → Project Settings → API
  - Click "Reset" on the anon key
  - ⚠️ This will invalidate ALL existing client connections
  - Update `NEXT_PUBLIC_SUPABASE_ANON_KEY` in hosting platform
  - Redeploy application
  - Verify: Test login, signup, and data browsing

- [ ] **Supabase Project URL** (`https://kljkhfgzxlkkbyilzkeh.supabase.co`)
  - Cannot be rotated directly (tied to project)
  - If compromise is suspected, create a new Supabase project
  - Migrate data using pg_dump / pg_restore
  - Update `NEXT_PUBLIC_SUPABASE_URL` in all environments

### Google AI / Gemini
- [ ] **Gemini API Key** (currently placeholder `your-gemini-key`)
  - If a real key was ever used, go to: https://aistudio.google.com/apikey
  - Delete the existing key
  - Create a new key
  - Update `GEMINI_API_KEY` in hosting platform
  - Redeploy application
  - Verify: Test AI product description generation

## 🟠 HIGH — Review and Rotate

### Firebase
- [ ] **Firebase Project ID** (`studio-649273204-a31cc`)
  - Go to: https://console.firebase.google.com
  - Review: No API keys or secrets in Firebase config
  - Check: Firebase Storage rules are properly configured
  - [ ] Review Firebase Authentication settings
  - [ ] Check for any unauthorized access in Firebase Usage Dashboard

### GitHub
- [ ] **GitHub Repository Access**
  - Go to: https://github.com/settings/tokens
  - Review all personal access tokens
  - Revoke any that were used in CI/CD pipelines
  - Generate new tokens with minimal required permissions
  - Update GitHub Secrets in repository settings
  - [ ] Review: Commit history for any tokens pushed accidentally

## 🟡 MEDIUM — Verify and Monitor

### Algolia
- [ ] **Algolia API Keys** (currently empty)
  - No action needed — keys were never configured
  - When configuring Algolia, use admin API keys only in server-side code

### Environment Verification
- [ ] All `.env.local` files are in `.gitignore`
- [ ] No `.env` files with real values are tracked in git
- [ ] All hosting platform environment variables are set correctly
- [ ] Gitleaks passes with zero findings: `gitleaks detect --config=.gitleaks.toml`
- [ ] Application starts successfully with new credentials
- [ ] All API routes return expected responses
- [ ] Stripe webhook processing works
- [ ] Supabase queries work (both admin and client)
- [ ] AI generation works (if Gemini key is configured)

### Post-Rotation Monitoring
- [ ] Monitor Stripe Dashboard for 48 hours for unauthorized activity
- [ ] Monitor Supabase Dashboard → Logs for 48 hours
- [ ] Monitor Google AI usage for 48 hours
- [ ] Set up alerts for unusual API usage on all providers
- [ ] Document rotation date in SECURITY.md audit log

## 📋 Completion Sign-Off

- [ ] All critical items above are checked
- [ ] No old credentials remain in any environment
- [ ] Git history has been cleaned (if applicable)
- [ ] All team members have been notified
- [ ] SECURITY.md audit log has been updated

**Rotation completed by:** _______________
**Date:** _______________
**Verified by:** _______________
