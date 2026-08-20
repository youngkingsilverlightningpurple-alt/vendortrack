# Demo Reset Guide

## How to Reset the Demo Environment

### Quick Reset
```bash
npm run seed:reset
```

This deletes ALL demo data from the database. Real data is untouched.

### Full Reset + Reseed
```bash
npm run seed:reset && npm run seed:demo
```

### Nuclear Reset (drops + recreates entire schema + seeds)
```bash
npm run seed
```

This runs `supabase db reset` (drops + recreates the entire database from migrations) then runs the demo seed. Use this only when you want a completely fresh database.

## What Gets Deleted

The reset script identifies demo data by these markers:

| Data Type | Identification Method |
|-----------|----------------------|
| Auth users | Email matches `*@demo.vendortrack.app` |
| Profiles | User ID in demo auth users list |
| Orders | `trace_id LIKE 'tr_TEST_%'` |
| Products | `image_url LIKE '%/api/placeholder/%'` |
| Financial ledger | `trace_id LIKE 'tr_TEST_%'` |
| Audit logs | `trace_id LIKE 'tr_TEST_%'` |
| Conversations | `buyer_id` or `seller_id` in demo users |
| Messages | CASCADE-deleted with conversations |
| Cart items | `user_id` in demo users |
| Payment sessions | `user_id` in demo users |

## What is NOT Deleted

- Real auth users (any email NOT ending in `@demo.vendortrack.app`)
- Real profiles, products, orders
- `processed_events` table (webhook idempotency — never reset)
- `background_jobs` table (worker queue — managed by worker)
- `reconciliation_reports` table (managed by cron)
- `feature_flags` table (8 default flags from migration)
- `backups`, `deployments`, `incidents` tables (operational data)

## Idempotency

The seed script is idempotent:
- **Auth users**: created via `auth.admin.createUser` — skipped if already exists (no error)
- **Profiles**: upserted by `id` (the auth user ID)
- **All other tables**: deleted first by demo markers, then re-inserted

Running `npm run seed:demo` twice produces the exact same dataset (modulo random date jitter + random Stripe ID suffixes).

## Production Guard

The seed script REFUSES to run if:
- `NODE_ENV === 'production'` AND
- `ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true'`

This prevents accidental contamination of a production database with demo data.

If you genuinely need to seed demo data in production (e.g. for a staging environment that has `NODE_ENV=production`):
```bash
ALLOW_DEMO_SEED_IN_PRODUCTION=true npm run seed:demo
```

**NOT recommended for production databases** — demo data uses `TEST_`-prefixed Stripe IDs that reconciliation would flag as orphans.

## Demo Mode Badge

To show the subtle "Demo Environment" badge in the authenticated layout header:
```bash
NEXT_PUBLIC_DEMO_MODE=true
```

Set this env var in your Vercel project settings for preview/demo deployments.

## Troubleshooting

### "Missing required environment variables"
Ensure these are set in `.env.local` (or Vercel env vars):
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### "Demo seeding is DISABLED in production"
Set `ALLOW_DEMO_SEED_IN_PRODUCTION=true` to override (not recommended for production databases).

### "Failed to create user: already registered"
This is expected if you've run the seed before. The script skips already-existing users and continues.

### Reset fails with FK constraint error
Run `npm run seed` instead (does `supabase db reset` first, which drops all FKs).

### Dashboard still shows old data after reset
- Hard-refresh your browser (Cmd+Shift+R / Ctrl+Shift+R)
- Log out and log back in (session may be cached)
- Check that the Supabase project you're hitting is the one you reset
