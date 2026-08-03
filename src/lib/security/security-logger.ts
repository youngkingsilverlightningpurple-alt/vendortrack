/**
 * @fileoverview Security Logging & Monitoring
 *
 * Centralizes all security-related logging with:
 *   - Structured security event format
 *   - Correlation IDs for request tracing
 *   - Security event classification (auth, access, rate-limit, CSRF, etc.)
 *   - Severity-based alerting thresholds
 *   - Integration with the existing audit log system
 *
 * Covers:
 *   - Failed logins
 *   - Permission denials
 *   - Rate-limit hits
 *   - CSRF failures
 *   - Payment anomalies
 *   - Prompt injection attempts
 *   - File upload violations
 *   - XSS attempts
 *   - Input validation failures
 *
 * OWASP: A09:2021 — Security Logging and Monitoring Failures
 * SOC 2: CC7.2 — Identify and Manage Security Events
 * ISO 27001: A.12.4 — Logging and Monitoring
 */

import { createLogger } from '@/lib/logger';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

const log = createLogger('security');

// ============================================================
// SECURITY EVENT TYPES
// ============================================================

export enum SecurityEventType {
  // Authentication
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  PASSWORD_RESET_REQUESTED = 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED = 'PASSWORD_RESET_COMPLETED',

  // Authorization
  ACCESS_DENIED = 'ACCESS_DENIED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_ESCALATION_ATTEMPT = 'ROLE_ESCALATION_ATTEMPT',
  IDOR_ATTEMPT = 'IDOR_ATTEMPT',
  OWNERSHIP_VIOLATION = 'OWNERSHIP_VIOLATION',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BURST_LIMIT_EXCEEDED = 'BURST_LIMIT_EXCEEDED',

  // CSRF
  CSRF_TOKEN_MISSING = 'CSRF_TOKEN_MISSING',
  CSRF_TOKEN_INVALID = 'CSRF_TOKEN_INVALID',
  CSRF_ORIGIN_MISMATCH = 'CSRF_ORIGIN_MISMATCH',

  // Input Validation
  INPUT_VALIDATION_FAILED = 'INPUT_VALIDATION_FAILED',
  MALFORMED_PAYLOAD = 'MALFORMED_PAYLOAD',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',

  // File Upload
  UPLOAD_BLOCKED = 'UPLOAD_BLOCKED',
  UPLOAD_MIME_MISMATCH = 'UPLOAD_MIME_MISMATCH',
  UPLOAD_SIZE_EXCEEDED = 'UPLOAD_SIZE_EXCEEDED',
  UPLOAD_VIRUS_DETECTED = 'UPLOAD_VIRUS_DETECTED',

  // AI Security
  PROMPT_INJECTION_ATTEMPT = 'PROMPT_INJECTION_ATTEMPT',
  AI_TOKEN_BUDGET_EXCEEDED = 'AI_TOKEN_BUDGET_EXCEEDED',
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',

  // Payment
  PAYMENT_ANOMALY = 'PAYMENT_ANOMALY',
  REFUND_ANOMALY = 'REFUND_ANOMALY',
  STRIPE_WEBHOOK_INVALID = 'STRIPE_WEBHOOK_INVALID',

  // General
  SECURITY_HEADER_VIOLATION = 'SECURITY_HEADER_VIOLATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

// ============================================================
// SECURITY EVENT SEVERITY
// ============================================================

export enum SecuritySeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Map event types to default severity levels.
 */
const EVENT_SEVERITY: Record<SecurityEventType, SecuritySeverity> = {
  [SecurityEventType.LOGIN_SUCCESS]: SecuritySeverity.INFO,
  [SecurityEventType.LOGIN_FAILURE]: SecuritySeverity.LOW,
  [SecurityEventType.LOGOUT]: SecuritySeverity.INFO,
  [SecurityEventType.SESSION_EXPIRED]: SecuritySeverity.LOW,
  [SecurityEventType.PASSWORD_RESET_REQUESTED]: SecuritySeverity.INFO,
  [SecurityEventType.PASSWORD_RESET_COMPLETED]: SecuritySeverity.INFO,

  [SecurityEventType.ACCESS_DENIED]: SecuritySeverity.MEDIUM,
  [SecurityEventType.PERMISSION_DENIED]: SecuritySeverity.MEDIUM,
  [SecurityEventType.ROLE_ESCALATION_ATTEMPT]: SecuritySeverity.HIGH,
  [SecurityEventType.IDOR_ATTEMPT]: SecuritySeverity.HIGH,
  [SecurityEventType.OWNERSHIP_VIOLATION]: SecuritySeverity.MEDIUM,

  [SecurityEventType.RATE_LIMIT_EXCEEDED]: SecuritySeverity.LOW,
  [SecurityEventType.BURST_LIMIT_EXCEEDED]: SecuritySeverity.LOW,

  [SecurityEventType.CSRF_TOKEN_MISSING]: SecuritySeverity.MEDIUM,
  [SecurityEventType.CSRF_TOKEN_INVALID]: SecuritySeverity.HIGH,
  [SecurityEventType.CSRF_ORIGIN_MISMATCH]: SecuritySeverity.HIGH,

  [SecurityEventType.INPUT_VALIDATION_FAILED]: SecuritySeverity.LOW,
  [SecurityEventType.MALFORMED_PAYLOAD]: SecuritySeverity.MEDIUM,
  [SecurityEventType.SQL_INJECTION_ATTEMPT]: SecuritySeverity.CRITICAL,
  [SecurityEventType.XSS_ATTEMPT]: SecuritySeverity.HIGH,

  [SecurityEventType.UPLOAD_BLOCKED]: SecuritySeverity.MEDIUM,
  [SecurityEventType.UPLOAD_MIME_MISMATCH]: SecuritySeverity.HIGH,
  [SecurityEventType.UPLOAD_SIZE_EXCEEDED]: SecuritySeverity.LOW,
  [SecurityEventType.UPLOAD_VIRUS_DETECTED]: SecuritySeverity.CRITICAL,

  [SecurityEventType.PROMPT_INJECTION_ATTEMPT]: SecuritySeverity.HIGH,
  [SecurityEventType.AI_TOKEN_BUDGET_EXCEEDED]: SecuritySeverity.LOW,
  [SecurityEventType.AI_RATE_LIMITED]: SecuritySeverity.LOW,

  [SecurityEventType.PAYMENT_ANOMALY]: SecuritySeverity.HIGH,
  [SecurityEventType.REFUND_ANOMALY]: SecuritySeverity.HIGH,
  [SecurityEventType.STRIPE_WEBHOOK_INVALID]: SecuritySeverity.HIGH,

  [SecurityEventType.SECURITY_HEADER_VIOLATION]: SecuritySeverity.MEDIUM,
  [SecurityEventType.SUSPICIOUS_ACTIVITY]: SecuritySeverity.HIGH,
};

// ============================================================
// SECURITY EVENT STRUCTURE
// ============================================================

export interface SecurityEvent {
  /** Unique event ID */
  eventId: string;
  /** Event type */
  eventType: SecurityEventType;
  /** Severity level */
  severity: SecuritySeverity;
  /** Timestamp (ISO 8601) */
  timestamp: string;
  /** Correlation ID for request tracing */
  correlationId: string;
  /** Trace ID for distributed tracing */
  traceId?: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** User role at time of event */
  userRole?: string;
  /** Client IP address */
  ipAddress?: string;
  /** User agent */
  userAgent?: string;
  /** Request path */
  path?: string;
  /** HTTP method */
  method?: string;
  /** Human-readable description */
  description: string;
  /** Additional structured data */
  metadata?: Record<string, unknown>;
  /** Whether this event requires immediate attention */
  requiresAlert: boolean;
}

// ============================================================
// ALERTING THRESHOLDS
// ============================================================

/**
 * Events that should trigger immediate alerts.
 */
const ALERT_SEVERITIES = new Set([
  SecuritySeverity.HIGH,
  SecuritySeverity.CRITICAL,
]);

/**
 * Events that indicate potential attack patterns.
 * Multiple events from the same user in a short time window
 * should trigger an escalation alert.
 */
const ATTACK_PATTERN_EVENTS = new Set([
  SecurityEventType.LOGIN_FAILURE,
  SecurityEventType.ACCESS_DENIED,
  SecurityEventType.PERMISSION_DENIED,
  SecurityEventType.ROLE_ESCALATION_ATTEMPT,
  SecurityEventType.IDOR_ATTEMPT,
  SecurityEventType.CSRF_TOKEN_INVALID,
  SecurityEventType.SQL_INJECTION_ATTEMPT,
  SecurityEventType.XSS_ATTEMPT,
  SecurityEventType.PROMPT_INJECTION_ATTEMPT,
]);

// ============================================================
// SECURITY EVENT LOGGER
// ============================================================

/**
 * Log a security event.
 *
 * This function:
 *   1. Logs the event to the application logger (structured JSON)
 *   2. Persists the event to the audit_logs table
 *   3. Triggers alerts if the severity requires it
 *
 * @param event - The security event to log
 */
export async function logSecurityEvent(event: Omit<SecurityEvent, 'eventId' | 'timestamp' | 'requiresAlert'>): Promise<void> {
  const eventId = `sec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const timestamp = new Date().toISOString();
  const severity = event.severity || EVENT_SEVERITY[event.eventType] || SecuritySeverity.MEDIUM;
  const requiresAlert = ALERT_SEVERITIES.has(severity);

  const fullEvent: SecurityEvent = {
    ...event,
    eventId,
    timestamp,
    severity,
    requiresAlert,
  };

  // 1. Log to application logger
  const logFn = severity === SecuritySeverity.CRITICAL ? log.error.bind(log) :
    severity === SecuritySeverity.HIGH ? log.warn.bind(log) :
    severity === SecuritySeverity.MEDIUM ? log.warn.bind(log) :
    log.info.bind(log);

  logFn(`Security event: ${event.eventType}`, {
    action: event.eventType,
    traceId: event.traceId,
    data: {
      eventId,
      severity,
      userId: event.userId,
      path: event.path,
      description: event.description,
      metadata: event.metadata,
    },
  });

  // 2. Persist to audit_logs table
  try {
    const admin = getSupabaseAdmin();
    await ((admin.from('audit_logs') as any) as any).insert({
      trace_id: event.correlationId || eventId,
      event_type: event.eventType,
      severity: severity,
      payload: {
        eventId,
        userId: event.userId,
        userRole: event.userRole,
        ipAddress: event.ipAddress,
        path: event.path,
        method: event.method,
        description: event.description,
        metadata: event.metadata,
        timestamp,
      },
    } as any);
  } catch (error) {
    // Audit logging must NEVER break the application
    log.error('Failed to persist security event to audit_logs', {
      action: 'audit_log_failure',
      data: { eventId },
    }, error);
  }

  // 3. Alert if required
  if (requiresAlert) {
    await triggerSecurityAlert(fullEvent);
  }

  // 4. Track attack patterns
  if (ATTACK_PATTERN_EVENTS.has(event.eventType) && event.userId) {
    await trackAttackPattern(event.userId, event.eventType);
  }
}

// ============================================================
// SECURITY ALERTING
// ============================================================

/**
 * Trigger a security alert.
 * In production, integrate with:
 *   - PagerDuty / OpsGenie for on-call alerts
 *   - Slack / Teams for team notifications
 *   - SIEM for correlation
 *
 * Currently logs to the application logger and creates an
 * admin notification in the database.
 */
async function triggerSecurityAlert(event: SecurityEvent): Promise<void> {
  log.error(`SECURITY ALERT [${event.severity}]: ${event.eventType}`, {
    action: 'security_alert',
    data: {
      eventId: event.eventId,
      eventType: event.eventType,
      severity: event.severity,
      userId: event.userId,
      path: event.path,
      description: event.description,
    },
  });

  // Create admin notification for high-severity events
  try {
    const admin = getSupabaseAdmin();
    await ((admin.from('admin_notifications') as any) as any).insert({
      type: 'security_alert',
      title: `Security Alert: ${event.eventType}`,
      message: event.description,
      severity: event.severity === SecuritySeverity.CRITICAL ? 'critical' : 'warning',
      metadata: {
        eventId: event.eventId,
        eventType: event.eventType,
        userId: event.userId,
        path: event.path,
        timestamp: event.timestamp,
      },
    } as any);
  } catch (error) {
    // Alerting must not break the application
    log.error('Failed to create admin security notification', {
      action: 'alert_notification_failure',
    }, error);
  }
}

// ============================================================
// ATTACK PATTERN TRACKING
// ============================================================

interface AttackPatternTracker {
  count: number;
  firstSeen: number;
  lastSeen: number;
  events: SecurityEventType[];
}

/**
 * Simple in-memory attack pattern tracker.
 * Tracks the number of attack-pattern events per user
 * within a sliding time window.
 *
 * In production, replace with Redis or database-backed tracker.
 */
class AttackPatternStore {
  private patterns = new Map<string, AttackPatternTracker>();
  private readonly WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly THRESHOLD = 5; // 5 events in 15 minutes = escalation

  record(userId: string, eventType: SecurityEventType): { escalated: boolean; count: number } {
    const key = userId;
    const now = Date.now();
    const tracker = this.patterns.get(key);

    if (!tracker || now - tracker.firstSeen > this.WINDOW_MS) {
      // Reset window
      this.patterns.set(key, {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        events: [eventType],
      });
      return { escalated: false, count: 1 };
    }

    tracker.count++;
    tracker.lastSeen = now;
    tracker.events.push(eventType);

    const escalated = tracker.count >= this.THRESHOLD;

    if (escalated) {
      log.error(`SECURITY ESCALATION: User ${userId} has ${tracker.count} suspicious events in 15 minutes`, {
        action: 'security_escalation',
        data: { userId, count: tracker.count, events: tracker.events },
      });
    }

    return { escalated, count: tracker.count };
  }

  getCount(userId: string): number {
    const tracker = this.patterns.get(userId);
    if (!tracker || Date.now() - tracker.firstSeen > this.WINDOW_MS) {
      return 0;
    }
    return tracker.count;
  }
}

const attackStore = new AttackPatternStore();

/**
 * Track attack patterns for a user.
 * If a user accumulates too many suspicious events,
 * trigger an escalation.
 */
async function trackAttackPattern(userId: string, eventType: SecurityEventType): Promise<void> {
  const { escalated, count } = attackStore.record(userId, eventType);

  if (escalated) {
    await logSecurityEvent({
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      severity: SecuritySeverity.CRITICAL,
      correlationId: `escalation_${Date.now()}`,
      userId,
      description: `User has ${count} suspicious security events in 15 minutes. Possible attack in progress.`,
      metadata: { eventCount: count, latestEvent: eventType },
    });
  }
}

// ============================================================
// CONVENIENCE FUNCTIONS
// ============================================================

/**
 * Log a failed login attempt.
 */
export async function logLoginFailure(
  email: string,
  ipAddress?: string,
  userAgent?: string,
  reason?: string
): Promise<void> {
  await logSecurityEvent({
    eventType: SecurityEventType.LOGIN_FAILURE,
    severity: SecuritySeverity.LOW,
    correlationId: `login_${Date.now()}`,
    ipAddress,
    userAgent,
    description: `Failed login attempt for ${email}`,
    metadata: { email, reason },
  });
}

/**
 * Log a rate limit event.
 */
export async function logRateLimitEvent(
  identifier: string,
  path: string,
  limitType: 'sustained' | 'burst',
  metadata?: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    eventType: limitType === 'burst'
      ? SecurityEventType.BURST_LIMIT_EXCEEDED
      : SecurityEventType.RATE_LIMIT_EXCEEDED,
    severity: SecuritySeverity.LOW,
    correlationId: `rl_${Date.now()}`,
    path,
    description: `Rate limit exceeded for ${identifier} on ${path}`,
    metadata: { identifier, limitType, ...metadata },
  });
}

/**
 * Log a CSRF failure.
 */
export async function logCSRFPerformance(
  reason: string,
  path: string,
  ipAddress?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  let eventType = SecurityEventType.CSRF_TOKEN_INVALID;
  if (reason.includes('missing')) eventType = SecurityEventType.CSRF_TOKEN_MISSING;
  if (reason.includes('origin')) eventType = SecurityEventType.CSRF_ORIGIN_MISMATCH;

  await logSecurityEvent({
    eventType,
    severity: SecuritySeverity.HIGH,
    correlationId: `csrf_${Date.now()}`,
    ipAddress,
    path,
    description: `CSRF protection triggered: ${reason}`,
    metadata: { reason, ...metadata },
  });
}

/**
 * Log a prompt injection attempt.
 */
export async function logPromptInjectionAttempt(
  userId: string,
  riskScore: number,
  patterns: string[],
  metadata?: Record<string, unknown>
): Promise<void> {
  await logSecurityEvent({
    eventType: SecurityEventType.PROMPT_INJECTION_ATTEMPT,
    severity: SecuritySeverity.HIGH,
    correlationId: `pi_${Date.now()}`,
    userId,
    description: `Prompt injection attempt detected (risk score: ${riskScore})`,
    metadata: { riskScore, patternCount: patterns.length, patterns: patterns.slice(0, 5), ...metadata },
  });
}

/**
 * Generate a correlation ID for request tracing.
 */
export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}
