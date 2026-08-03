/**
 * @fileoverview Structured Logger for VendorTrack
 *
 * Replaces all console.log/console.error/console.warn calls with a
 * structured, leveled logging system that supports:
 * - JSON-formatted output for production
 * - Context-rich log entries (traceId, component, action)
 * - Log level filtering
 * - Client/Server safe
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogContext = {
  /** The module or component generating the log */
  module?: string;
  /** The specific action being performed */
  action?: string;
  /** Trace ID for request correlation */
  traceId?: string;
  /** Additional structured data */
  data?: Record<string, unknown>;
};

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  action?: string;
  traceId?: string;
  data?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
};

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getCurrentLogLevel(): LogLevel {
  if (typeof window !== 'undefined') {
    // Client-side: use NEXT_PUBLIC_ env var or default to 'warn'
    return (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'warn';
  }
  // Server-side: use LOG_LEVEL or default to 'info'
  return (process.env.LOG_LEVEL as LogLevel) || 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[getCurrentLogLevel()];
}

function formatEntry(entry: LogEntry): string {
  if (process.env.NODE_ENV === 'production') {
    return JSON.stringify(entry);
  }
  // Development: readable format
  const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
  const module = entry.module ? ` [${entry.module}]` : '';
  const action = entry.action ? ` [${entry.action}]` : '';
  const traceId = entry.traceId ? ` [${entry.traceId}]` : '';
  let result = `${prefix}${module}${action}${traceId} ${entry.message}`;
  if (entry.data && Object.keys(entry.data).length > 0) {
    result += ` ${JSON.stringify(entry.data)}`;
  }
  if (entry.error) {
    result += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
    if (entry.error.stack) {
      result += `\n  ${entry.error.stack}`;
    }
  }
  return result;
}

function createEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    module: context?.module,
    action: context?.action,
    traceId: context?.traceId,
    data: context?.data,
  };

  if (error instanceof Error) {
    entry.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return entry;
}

/**
 * VendorTrack Structured Logger
 *
 * Usage:
 * ```ts
 * import { logger } from '@/lib/logger';
 *
 * logger.info('User logged in', { module: 'auth', action: 'login', data: { userId: user.id } });
 * logger.error('Payment failed', { module: 'payment', traceId }, error);
 * ```
 */
export const logger = {
  debug(message: string, context?: LogContext): void {
    if (!shouldLog('debug')) return;
    console.debug(formatEntry(createEntry('debug', message, context)));
  },

  info(message: string, context?: LogContext): void {
    if (!shouldLog('info')) return;
    console.info(formatEntry(createEntry('info', message, context)));
  },

  warn(message: string, context?: LogContext, error?: unknown): void {
    if (!shouldLog('warn')) return;
    console.warn(formatEntry(createEntry('warn', message, context, error)));
  },

  error(message: string, context?: LogContext, error?: unknown): void {
    if (!shouldLog('error')) return;
    console.error(formatEntry(createEntry('error', message, context, error)));
  },
};

/**
 * Create a scoped logger for a specific module.
 * Usage:
 * ```ts
 * const log = createLogger('payment');
 * log.info('Processing refund', { action: 'refund', data: { orderId } });
 * ```
 */
export function createLogger(module: string) {
  return {
    debug(message: string, context?: Omit<LogContext, 'module'>): void {
      logger.debug(message, { ...context, module });
    },
    info(message: string, context?: Omit<LogContext, 'module'>): void {
      logger.info(message, { ...context, module });
    },
    warn(message: string, context?: Omit<LogContext, 'module'>, error?: unknown): void {
      logger.warn(message, { ...context, module }, error);
    },
    error(message: string, context?: Omit<LogContext, 'module'>, error?: unknown): void {
      logger.error(message, { ...context, module }, error);
    },
  };
}
