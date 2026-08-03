#!/bin/bash
# ============================================================
# VendorTrack — Production Backup Script
# ============================================================
# Creates a comprehensive backup of:
#   - Database (via Supabase pg_dump)
#   - Redis (via BGSAVE)
#   - Environment configuration
#   - Application state
#
# USAGE:
#   ./scripts/backup.sh [--full | --db-only | --redis-only]
#
# SCHEDULE: Run daily at 03:00 UTC via cron
# ============================================================

set -euo pipefail

# ---- Configuration ----
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vendortrack}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS="${RETENTION_DAYS:-30}"
BACKUP_TYPE="${1:---full}"

# ---- Logging ----
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [BACKUP] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2; }

# ---- Create backup directory ----
mkdir -p "${BACKUP_DIR}/${TIMESTAMP}"

# ---- Database Backup ----
backup_database() {
  log "Starting database backup..."

  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    error "SUPABASE_DB_URL not set. Cannot backup database."
    return 1
  fi

  # Use pg_dump via Supabase connection string
  # The connection string is available from Supabase Dashboard > Settings > Database
  pg_dump "${SUPABASE_DB_URL}" \
    --no-owner \
    --no-privileges \
    --format=custom \
    --compress=9 \
    --file="${BACKUP_DIR}/${TIMESTAMP}/database.dump" \
    2>&1 | tee -a "${BACKUP_DIR}/${TIMESTAMP}/backup.log"

  # Verify backup
  if [ -f "${BACKUP_DIR}/${TIMESTAMP}/database.dump" ]; then
    SIZE=$(du -h "${BACKUP_DIR}/${TIMESTAMP}/database.dump" | cut -f1)
    log "Database backup completed: ${SIZE}"
  else
    error "Database backup failed!"
    return 1
  fi
}

# ---- Redis Backup ----
backup_redis() {
  log "Starting Redis backup..."

  REDIS_HOST="${REDIS_HOST:-localhost}"
  REDIS_PORT="${REDIS_PORT:-6379}"

  # Trigger BGSAVE on Redis
  redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" BGSAVE

  # Wait for BGSAVE to complete (max 60 seconds)
  for i in $(seq 1 60); do
    LASTSAVE=$(redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" LASTSAVE)
    if redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" INFO Persistence | grep -q "rdb_last_bgsave_status:ok"; then
      break
    fi
    sleep 1
  done

  # Copy the RDB file if accessible
  if [ -f "/data/dump.rdb" ]; then
    cp /data/dump.rdb "${BACKUP_DIR}/${TIMESTAMP}/redis-dump.rdb"
    log "Redis backup completed"
  else
    log "Redis RDB file not accessible locally (remote Redis). Backup via BGSAVE only."
  fi
}

# ---- Environment Configuration Backup ----
backup_env() {
  log "Backing up environment configuration..."

  # Save non-secret environment variable names (not values)
  env | grep -E '^(NEXT_PUBLIC_|NODE_ENV|PORT|LOG_LEVEL|VERCEL_)' | \
    sed 's/=.*/=***REDACTED***/' > "${BACKUP_DIR}/${TIMESTAMP}/env-manifest.txt"

  log "Environment manifest saved (values redacted)"
}

# ---- Backup Manifest ----
create_manifest() {
  log "Creating backup manifest..."

  cat > "${BACKUP_DIR}/${TIMESTAMP}/manifest.json" << EOF
{
  "timestamp": "${TIMESTAMP}",
  "type": "${BACKUP_TYPE}",
  "version": "$(cat package.json | grep version | head -1 | cut -d'"' -f4)",
  "components": {
    "database": $([ -f "${BACKUP_DIR}/${TIMESTAMP}/database.dump" ] && echo "true" || echo "false"),
    "redis": $([ -f "${BACKUP_DIR}/${TIMESTAMP}/redis-dump.rdb" ] && echo "true" || echo "false"),
    "env_manifest": true
  }
}
EOF

  log "Manifest created"
}

# ---- Cleanup Old Backups ----
cleanup_old_backups() {
  log "Cleaning up backups older than ${RETENTION_DAYS} days..."

  find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime +${RETENTION_DAYS} -exec rm -rf {} \;

  log "Cleanup complete"
}

# ---- Main ----
main() {
  log "Starting VendorTrack backup (type: ${BACKUP_TYPE})"

  case "${BACKUP_TYPE}" in
    --full)
      backup_database || true
      backup_redis || true
      backup_env
      ;;
    --db-only)
      backup_database
      ;;
    --redis-only)
      backup_redis
      ;;
    *)
      echo "Usage: $0 [--full | --db-only | --redis-only]"
      exit 1
      ;;
  esac

  create_manifest
  cleanup_old_backups

  log "Backup completed successfully"
}

main
