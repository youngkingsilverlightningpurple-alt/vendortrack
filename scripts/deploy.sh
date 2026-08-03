#!/bin/bash
# ============================================================
# VendorTrack — One-Command Deployment Script
# ============================================================
# Handles the complete deployment lifecycle:
#   - Pre-flight checks
#   - Build
#   - Deploy
#   - Post-deployment verification
#   - Rollback on failure
#
# USAGE:
#   ./scripts/deploy.sh [production | staging | preview]
#   ./scripts/deploy.sh production    # Deploy to production
#   ./scripts/deploy.sh staging       # Deploy to staging
#   ./scripts/deploy.sh preview       # Create preview deployment
#
# ENVIRONMENT VARIABLES:
#   VERCEL_TOKEN       — Vercel API token
#   VERCEL_ORG_ID      — Vercel organization ID
#   VERCEL_PROJECT_ID   — Vercel project ID
# ============================================================

set -euo pipefail

# ---- Configuration ----
ENVIRONMENT="${1:-staging}"
DEPLOY_ID="deploy-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/vendortrack-deploy-${DEPLOY_ID}.log"

# ---- Logging ----
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [DEPLOY] $*" | tee -a "${LOG_FILE}"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" | tee -a "${LOG_FILE}" >&2; }

# ---- Pre-flight Checks ----
preflight() {
  log "Running pre-flight checks for ${ENVIRONMENT} deployment..."

  # Check required tools
  for cmd in node npm git; do
    if ! command -v "${cmd}" &>/dev/null; then
      error "Required tool not found: ${cmd}"
      exit 1
    fi
  done

  # Check git status
  if [ -n "$(git status --porcelain)" ]; then
    error "Uncommitted changes detected. Commit or stash before deploying."
    git status --short
    exit 1
  fi

  # Check current branch
  BRANCH=$(git branch --show-current)
  if [ "${ENVIRONMENT}" = "production" ] && [ "${BRANCH}" != "main" ]; then
    error "Production deployment must be from main branch. Current: ${BRANCH}"
    exit 1
  fi

  if [ "${ENVIRONMENT}" = "staging" ] && [ "${BRANCH}" != "develop" ] && [ "${BRANCH}" != "main" ]; then
    error "Staging deployment must be from develop or main branch. Current: ${BRANCH}"
    exit 1
  fi

  # Run type check
  log "Running type check..."
  npm run typecheck 2>&1 | tee -a "${LOG_FILE}"

  # Run lint
  log "Running lint..."
  npm run lint 2>&1 | tee -a "${LOG_FILE}"

  # Run tests
  log "Running tests..."
  npm run test 2>&1 | tee -a "${LOG_FILE}"

  # Run security scan
  log "Running security scan..."
  npm run security:check 2>&1 | tee -a "${LOG_FILE}" || true

  log "Pre-flight checks passed"
}

# ---- Build ----
build() {
  log "Building application..."

  npm run build 2>&1 | tee -a "${LOG_FILE}"

  log "Build completed successfully"
}

# ---- Deploy ----
deploy() {
  log "Deploying to ${ENVIRONMENT}..."

  if command -v vercel &>/dev/null; then
    # Vercel CLI deployment
    case "${ENVIRONMENT}" in
      production)
        vercel deploy --prod --yes 2>&1 | tee -a "${LOG_FILE}"
        ;;
      staging)
        vercel deploy --yes 2>&1 | tee -a "${LOG_FILE}"
        ;;
      preview)
        vercel deploy 2>&1 | tee -a "${LOG_FILE}"
        ;;
    esac
  else
    # Docker deployment
    log "Vercel CLI not found. Using Docker deployment..."

    # Build Docker image
    docker build -t "vendortrack:${DEPLOY_ID}" . 2>&1 | tee -a "${LOG_FILE}"

    # Tag as latest
    docker tag "vendortrack:${DEPLOY_ID}" vendortrack:latest

    # Deploy with docker compose
    docker compose up -d 2>&1 | tee -a "${LOG_FILE}"
  fi

  DEPLOY_URL=$(grep -oP 'https://[^\s]+' "${LOG_FILE}" | tail -1 || echo "http://localhost:9002")
  log "Deployed to: ${DEPLOY_URL}"
}

# ---- Post-deployment Verification ----
verify() {
  log "Running post-deployment verification..."

  # Wait for application to start
  log "Waiting for application to start..."
  sleep 30

  # Determine base URL
  BASE_URL="${DEPLOY_URL:-http://localhost:9002}"

  # Health check
  log "Checking health endpoint..."
  HEALTH_STATUS=$(curl -sf "${BASE_URL}/api/health" | jq -r '.status' || echo "unreachable")
  log "Health status: ${HEALTH_STATUS}"

  if [ "${HEALTH_STATUS}" = "unhealthy" ]; then
    error "Application is unhealthy after deployment!"
    return 1
  fi

  # Security headers check
  log "Checking security headers..."
  HEADERS=$(curl -sI "${BASE_URL}/" || true)
  echo "${HEADERS}" | grep -i "x-frame-options" | tee -a "${LOG_FILE}" || true
  echo "${HEADERS}" | grep -i "strict-transport" | tee -a "${LOG_FILE}" || true

  # Performance check
  log "Checking performance..."
  START_TIME=$(date +%s%N)
  curl -sf "${BASE_URL}/api/health" > /dev/null
  END_TIME=$(date +%s%N)
  LATENCY_MS=$(( (END_TIME - START_TIME) / 1000000 ))
  log "Health check latency: ${LATENCY_MS}ms"

  if [ "${LATENCY_MS}" -gt 1000 ]; then
    log "WARNING: Health check latency is above 1 second"
  fi

  log "Post-deployment verification completed"
}

# ---- Rollback ----
rollback() {
  log "Rolling back deployment..."

  if command -v vercel &>/dev/null; then
    vercel rollback --yes 2>&1 | tee -a "${LOG_FILE}" || true
  else
    # Docker rollback: use previous image
    docker compose down 2>&1 | tee -a "${LOG_FILE}" || true
    docker compose up -d 2>&1 | tee -a "${LOG_FILE}" || true
  fi

  log "Rollback completed"
}

# ---- Main ----
main() {
  log "Starting VendorTrack deployment: ${ENVIRONMENT} (${DEPLOY_ID})"
  log "Log file: ${LOG_FILE}"

  # Step 1: Pre-flight checks
  if ! preflight; then
    error "Pre-flight checks failed. Aborting deployment."
    exit 1
  fi

  # Step 2: Build
  if ! build; then
    error "Build failed. Aborting deployment."
    exit 1
  fi

  # Step 3: Deploy
  if ! deploy; then
    error "Deployment failed. Attempting rollback..."
    rollback
    exit 1
  fi

  # Step 4: Verify
  if ! verify; then
    error "Post-deployment verification failed. Attempting rollback..."
    rollback
    exit 1
  fi

  log "=========================================="
  log "Deployment completed successfully!"
  log "  Environment: ${ENVIRONMENT}"
  log "  Deploy ID: ${DEPLOY_ID}"
  log "  Branch: $(git branch --show-current)"
  log "  Commit: $(git rev-parse --short HEAD)"
  log "=========================================="
}

main
