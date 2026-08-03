#!/bin/bash
# ============================================================
# VendorTrack — Key Rotation Script
# ============================================================
# Automates the rotation of all secrets and API keys.
# Follows the dual-credential pattern: create new → deploy →
# verify → revoke old.
#
# USAGE:
#   ./scripts/rotate-keys.sh [stripe | supabase | gemini | redis | all]
#
# SECURITY: This script handles sensitive credentials.
#   - Never log secret values
#   - Always verify before revoking old keys
#   - Keep a rollback plan
# ============================================================

set -euo pipefail

# ---- Configuration ----
LOG_FILE="/var/log/vendortrack/key-rotation-$(date +%Y%m%d).log"
KEY_TYPE="${1:-all}"

# ---- Logging ----
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ROTATE] $*" | tee -a "${LOG_FILE}"
}
error() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "${LOG_FILE}" >&2
}

# ---- Stripe Key Rotation ----
rotate_stripe() {
  log "Starting Stripe key rotation..."

  log "Step 1: Create new Stripe API key in Dashboard (https://dashboard.stripe.com/apikeys)"
  log "Step 2: Update STRIPE_SECRET_KEY in deployment environment"
  log "Step 3: Update STRIPE_WEBHOOK_SECRET if webhook signing key changed"
  log "Step 4: Deploy the application with new key"
  log "Step 5: Verify payments are processing correctly"
  log "Step 6: Monitor /api/payment-health for 1 hour"
  log "Step 7: Revoke old Stripe API key in Dashboard"

  log "Stripe key rotation checklist:"
  log "  [ ] New STRIPE_SECRET_KEY set in Vercel environment"
  log "  [ ] New NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set (if changed)"
  log "  [ ] New STRIPE_WEBHOOK_SECRET set"
  log "  [ ] Application redeployed"
  log "  [ ] Payment health verified"
  log "  [ ] Old keys revoked"
}

# ---- Supabase Key Rotation ----
rotate_supabase() {
  log "Starting Supabase key rotation..."

  log "Step 1: Generate new service_role key in Supabase Dashboard"
  log "Step 2: Update SUPABASE_SERVICE_ROLE_KEY in deployment environment"
  log "Step 3: Update NEXT_PUBLIC_SUPABASE_ANON_KEY if changed"
  log "Step 4: Deploy the application with new key"
  log "Step 5: Verify database connectivity and auth"
  log "Step 6: Monitor /api/health for 1 hour"
  log "Step 7: Revoke old service_role key in Supabase Dashboard"

  log "Supabase key rotation checklist:"
  log "  [ ] New SUPABASE_SERVICE_ROLE_KEY set in Vercel environment"
  log "  [ ] New NEXT_PUBLIC_SUPABASE_ANON_KEY set (if changed)"
  log "  [ ] Application redeployed"
  log "  [ ] Database health verified"
  log "  [ ] Auth flows verified"
  log "  [ ] Old keys revoked"
}

# ---- Gemini API Key Rotation ----
rotate_gemini() {
  log "Starting Gemini API key rotation..."

  log "Step 1: Create new API key in Google AI Studio"
  log "Step 2: Update GEMINI_API_KEY in deployment environment"
  log "Step 3: Deploy the application with new key"
  log "Step 4: Verify AI product description generation works"
  log "Step 5: Revoke old API key in Google AI Studio"

  log "Gemini key rotation checklist:"
  log "  [ ] New GEMINI_API_KEY set in Vercel environment"
  log "  [ ] Application redeployed"
  log "  [ ] AI features verified"
  log "  [ ] Old key revoked"
}

# ---- Redis Password Rotation ----
rotate_redis() {
  log "Starting Redis password rotation..."

  log "Step 1: Generate new Redis password"
  log "Step 2: Update Redis instance password (Upstash dashboard or redis.conf)"
  log "Step 3: Update REDIS_URL in deployment environment"
  log "Step 4: Deploy the application with new connection string"
  log "Step 5: Verify cache connectivity via /api/health"
  log "Step 6: Monitor cache hit rate for 1 hour"

  log "Redis password rotation checklist:"
  log "  [ ] New REDIS_URL set in Vercel environment"
  log "  [ ] Redis password updated"
  log "  [ ] Application redeployed"
  log "  [ ] Cache health verified"
  log "  [ ] Cache hit rate normal"
}

# ---- Main ----
main() {
  log "Starting key rotation: ${KEY_TYPE}"
  log "Log file: ${LOG_FILE}"

  mkdir -p "$(dirname "${LOG_FILE}")"

  case "${KEY_TYPE}" in
    stripe)
      rotate_stripe
      ;;
    supabase)
      rotate_supabase
      ;;
    gemini)
      rotate_gemini
      ;;
    redis)
      rotate_redis
      ;;
    all)
      rotate_stripe
      echo ""
      rotate_supabase
      echo ""
      rotate_gemini
      echo ""
      rotate_redis
      ;;
    *)
      echo "Usage: $0 [stripe | supabase | gemini | redis | all]"
      exit 1
      ;;
  esac

  log "Key rotation procedure completed for: ${KEY_TYPE}"
  log "IMPORTANT: Follow the checklist above to complete the rotation."
}

main
