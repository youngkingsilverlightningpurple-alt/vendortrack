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

  /** Insert a processed event record (for idempotency) */
  async insertProcessedEvent(eventId: string): Promise<{ inserted: boolean }> {
    const admin = getSupabaseAdmin();
    const { error } = await (admin
      .from('processed_events') as any)
      .insert({ id: eventId, created_at: new Date().toISOString() } as any);

    if (error) {
      // Unique constraint violation = already processed
      if (error.code === '23505') {
        return { inserted: false };
      }
      // Other errors — log but continue (fail-open for safety)
      console.error('[AuditLogRepository] Failed to insert processed event:', error.message);
    }
    return { inserted: true };
  }
}

export const auditLogRepository = new AuditLogRepository();
