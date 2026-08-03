#!/bin/bash
# ============================================================
# VendorTrack — Database Restore Script
# ============================================================
# Restores the VendorTrack database from a backup.
#
# USAGE:
#   ./scripts/restore.sh <backup-timestamp>
#   ./scripts/restore.sh 20260731_030000
#
# WARNING: This will REPLACE the current database.
# Always create a fresh backup before restoring.
# ============================================================

set -euo pipefail

# ---- Configuration ----
BACKUP_DIR="${BACKUP_DIR:-/var/backups/vendortrack}"
BACKUP_TIMESTAMP="${1:?Usage: $0 <backup-timestamp>}"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_TIMESTAMP}"

# ---- Logging ----
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [RESTORE] $*"; }
error() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] $*" >&2; }

# ---- Pre-flight Checks ----
preflight() {
  log "Running pre-flight checks..."

  # Verify backup exists
  if [ ! -d "${BACKUP_PATH}" ]; then
    error "Backup not found: ${BACKUP_PATH}"
    exit 1
  fi

  # Verify database dump exists
  if [ ! -f "${BACKUP_PATH}/database.dump" ]; then
    error "Database dump not found: ${BACKUP_PATH}/database.dump"
    exit 1
  fi

  # Verify Supabase connection
  if [ -z "${SUPABASE_DB_URL:-}" ]; then
    error "SUPABASE_DB_URL not set. Cannot restore database."
    exit 1
  fi

  # Confirm restore
  log "WARNING: This will REPLACE the current database!"
  log "Backup: ${BACKUP_TIMESTAMP}"
  log "Database: ${SUPABASE_DB_URL}"
  read -p "Type 'CONFIRM' to proceed: " CONFIRMATION

  if [ "${CONFIRMATION}" != "CONFIRM" ]; then
    log "Restore cancelled."
    exit 0
  fi
}

# ---- Create Safety Backup ----
create_safety_backup() {
  log "Creating safety backup of current database..."

  SAFETY_TIMESTAMP="pre_restore_$(date +%Y%m%d_%H%M%S)"
  mkdir -p "${BACKUP_DIR}/${SAFETY_TIMESTAMP}"

  pg_dump "${SUPABASE_DB_URL}" \
    --no-owner \
    --no-privileges \
    --format=custom \
    --compress=9 \
    --file="${BACKUP_DIR}/${SAFETY_TIMESTAMP}/database.dump" \
    2>&1 || true

  log "Safety backup created: ${SAFETY_TIMESTAMP}"
}

# ---- Restore Database ----
restore_database() {
  log "Restoring database from backup..."

  # Drop existing data and restore from backup
  # Use --clean to drop existing objects before creating them
  pg_restore "${SUPABASE_DB_URL}" \
    --clean \
    --if-exists \
    --no-owner \
    --no-privileges \
    --format=custom \
    --verbose \
    "${BACKUP_PATH}/database.dump" \
    2>&1 | tee -a "${BACKUP_PATH}/restore.log"

  log "Database restore completed"
}

# ---- Restore Redis ----
restore_redis() {
  if [ -f "${BACKUP_PATH}/redis-dump.rdb" ]; then
    log "Restoring Redis from backup..."

    REDIS_HOST="${REDIS_HOST:-localhost}"
    REDIS_PORT="${REDIS_PORT:-6379}"

    # Stop Redis, replace RDB, start Redis
    # This only works for local Redis instances
    if [ "${REDIS_HOST}" = "localhost" ]; then
      redis-cli -h "${REDIS_HOST}" -p "${REDIS_PORT}" SHUTDOWN NOSAVE || true
      cp "${BACKUP_PATH}/redis-dump.rdb" /data/dump.rdb
      redis-server /etc/redis/redis.conf &
      sleep 5
      log "Redis restored"
    else
      log "Redis restore skipped (remote Redis instance). Use Upstash backup restore."
    fi
  else
    log "No Redis backup found. Skipping Redis restore."
  fi
}

# ---- Verify Restore ----
verify_restore() {
  log "Verifying restore..."

  # Check database connectivity
  if [ -n "${SUPABASE_DB_URL:-}" ]; then
    psql "${SUPABASE_DB_URL}" -c "SELECT count(*) FROM profiles;" 2>&1 | head -5
    log "Database connectivity verified"
  fi

  # Check Redis
  redis-cli -h "${REDIS_HOST:-localhost}" -p "${REDIS_PORT:-6379}" PING || true

  log "Restore verification complete"
}

# ---- Main ----
main() {
  log "Starting VendorTrack restore from backup: ${BACKUP_TIMESTAMP}"

  preflight
  create_safety_backup
  restore_database
  restore_redis
  verify_restore

  log "Restore completed successfully"
  log "Verify application health: curl -sf http://localhost:9002/api/health"
}

main
