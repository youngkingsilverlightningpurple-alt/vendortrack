/**
 * @fileOverview OpenTelemetry Integration
 *
 * Provides distributed tracing for VendorTrack microservices.
 * Integrates with the existing performance monitor to export
 * traces and metrics to any OTLP-compatible backend.
 *
 * CONFIGURATION:
 *   OTEL_EXPORTER_OTLP_ENDPOINT — OTLP collector endpoint
 *   OTEL_SERVICE_NAME           — Service name (default: vendortrack)
 *   OTEL_TRACES_SAMPLER_RATE    — Trace sampling rate (0.0-1.0)
 */

import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';

const OTEL_ENDPOINT = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const SERVICE_NAME = process.env.OTEL_SERVICE_NAME || 'vendortrack';
const SERVICE_VERSION = process.env.npm_package_version || '0.1.0';
const SAMPLER_RATE = parseFloat(process.env.OTEL_TRACES_SAMPLER_RATE || '0.1');

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK.
 * Call once at server startup.
 */
export function initOpenTelemetry(): void {
  if (!OTEL_ENDPOINT) {
    console.warn('[OTel] OTEL_EXPORTER_OTLP_ENDPOINT not configured — tracing disabled');
    return;
  }

  try {
    const exporter = new OTLPTraceExporter({
      url: `${OTEL_ENDPOINT}/v1/traces`,
      headers: {},
    });

    sdk = new NodeSDK({
      resource: new Resource({
        [ATTR_SERVICE_NAME]: SERVICE_NAME,
        [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
      }),
      traceExporter: exporter,
      spanProcessors: [new SimpleSpanProcessor(exporter) as any],
    });

    sdk.start();
    console.log(`[OTel] Initialized — service=${SERVICE_NAME} endpoint=${OTEL_ENDPOINT}`);
  } catch (error) {
    console.error('[OTel] Failed to initialize:', error);
  }
}

/**
 * Shutdown OpenTelemetry gracefully.
 */
export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log('[OTel] Shutdown complete');
  }
}

/**
 * Get the active tracer.
 */
export function getTracer(name: string = SERVICE_NAME) {
  return trace.getTracer(name, SERVICE_VERSION);
}

/**
 * Create a traced span for an async operation.
 * Automatically records errors and duration.
 */
export async function traced<T>(
  name: string,
  fn: () => Promise<T>,
  attributes?: Record<string, string | number>
): Promise<T> {
  if (!OTEL_ENDPOINT) {
    return fn();
  }

  const tracer = getTracer();
  return tracer.startActiveSpan(name, { kind: SpanKind.SERVER }, async (span) => {
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }
    }

    try {
      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Create a traced database query span.
 */
export async function tracedQuery<T>(
  operation: string,
  table: string,
  fn: () => Promise<T>
): Promise<T> {
  return traced(`db.${operation}`, fn, {
    'db.operation': operation,
    'db.table': table,
    'db.system': 'postgresql',
  });
}

/**
 * Create a traced API request span.
 */
export async function tracedApi<T>(
  method: string,
  path: string,
  fn: () => Promise<T>
): Promise<T> {
  return traced(`api.${method}.${path}`, fn, {
    'http.method': method,
    'http.route': path,
  });
}

/**
 * Create a traced payment operation span.
 */
export async function tracedPayment<T>(
  operation: string,
  fn: () => Promise<T>,
  metadata?: Record<string, string>
): Promise<T> {
  return traced(`payment.${operation}`, fn, {
    'payment.operation': operation,
    ...metadata,
  });
}
