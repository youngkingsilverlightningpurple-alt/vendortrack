/**
 * @fileoverview Audit Log Repository
 *
 * All database access for audit logs goes through this module.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fromDatabaseError } from '@/lib/errors';

class AuditLogRepository {
  /** Insert an audit log entry */
  async insert(data: {
    traceId: string;
    eventType: string;
    severity: string;
    payload: Record<string, unknown>;
  }): Promise<void> {
    const admin = getSupabaseAdmin();
    const { error } = await ((admin.from('audit_logs') as any) as any).insert({
      trace_id: data.traceId,
      event_type: data.eventType,
      severity: data.severity,
      payload: data.payload,
    } as any);

    if (error) {
      // Audit logging must never break the application
      // Log but don't throw
      console.error('[AuditLogRepository] Failed to insert audit log:', error.message);
    }
  }

  /**
   * Insert a processed event record (for webhook idempotency).
   *
   * P0 FIX (war room): the previous implementation was fail-open — on ANY
   * non-23505 error (e.g. DB connection failure, network blip), it returned
   * `{ inserted: true }`. This meant the webhook proceeded to process the
   * event as if the idempotency record had been persisted, when in fact no
   * row existed. If Stripe retried that event after DB recovery, the second
   * delivery would also pass the idempotency check (no row exists) and the
   * event would be processed twice — duplicate fulfillment, duplicate refund,
   * duplicate ledger entries.
   *
   * Correct behavior:
   *   - 23505 (unique violation) → already processed → return `{ inserted: false }`
   *   - Any other error → idempotency could not be guaranteed → return
   *     `{ inserted: false, error }` so the caller can choose to return HTTP 500
   *     to Stripe, which causes Stripe to retry the webhook. On retry, the
   *     DB will (hopefully) be available and the idempotency insert will succeed.
   *
   * This is the correct tradeoff: a transient DB error causes a Stripe retry
   * (mild latency), but never causes duplicate processing.
   */
  async insertProcessedEvent(eventId: string): Promise<{ inserted: boolean; error?: string }> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('processed_events') as any)
      .insert({ id: eventId, created_at: new Date().toISOString() } as any);

    if (error) {
      // Unique constraint violation = already processed (the happy path for duplicates)
      if (error.code === '23505') {
        return { inserted: false };
      }
      // Any other error (DB connection, timeout, etc.) — do NOT fail open.
      // Return inserted:false so the webhook returns HTTP 500 and Stripe retries.
      console.error('[AuditLogRepository] Failed to insert processed event (returning inserted:false to force Stripe retry):', error.message);
      return { inserted: false, error: error.message };
    }
    return { inserted: true };
  }
}

export const auditLogRepository = new AuditLogRepository();
