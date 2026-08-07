/**
 * @fileoverview Alertmanager Webhook Receiver
 *
 * Receives alerts from Prometheus Alertmanager and logs them.
 * This endpoint is required by the monitoring stack.
 *
 * SECURITY: Protected by ALERTMANAGER_SECRET or CRON_SECRET.
 * Alertmanager sends webhooks here when alert rules fire.
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface AlertmanagerAlert {
  status: 'firing' | 'resolved';
  labels: Record<string, string>;
  annotations: Record<string, string>;
  startsAt: string;
  endsAt: string;
  generatorURL: string;
  fingerprint: string;
}

interface AlertmanagerWebhookPayload {
  receiver: string;
  status: 'firing' | 'resolved';
  alerts: AlertmanagerAlert[];
  groupLabels: Record<string, string>;
  commonLabels: Record<string, string>;
  commonAnnotations: Record<string, string>;
  externalURL: string;
  version: string;
  groupKey: string;
  truncatedAlerts: number;
}

function verifyWebhookRequest(request: NextRequest): boolean {
  const secret = process.env.ALERTMANAGER_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    // Fail-closed: deny access when no secret is configured
    console.error('[Alerts] No ALERTMANAGER_SECRET or CRON_SECRET configured — webhook denied');
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  // Verify authorization
  if (!verifyWebhookRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: AlertmanagerWebhookPayload = await request.json();

    // Process each alert
    for (const alert of payload.alerts) {
      const logLevel = alert.status === 'firing' ? 'error' : 'info';
      const message = `[Alert ${alert.status.toUpperCase()}] ${alert.labels.alertname || 'unknown'} — severity: ${alert.labels.severity || 'unknown'}`;

      if (logLevel === 'error') {
        console.error(message, {
          labels: alert.labels,
          annotations: alert.annotations,
          startsAt: alert.startsAt,
          fingerprint: alert.fingerprint,
        });
      } else {
        console.info(message, {
          labels: alert.labels,
          fingerprint: alert.fingerprint,
        });
      }
    }

    return NextResponse.json({
      status: 'ok',
      processed: payload.alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Alerts] Webhook processing failed:', error);
    return NextResponse.json(
      { error: 'Invalid webhook payload' },
      { status: 400 }
    );
  }
}

// Health check for the webhook endpoint
export async function GET() {
  const secretConfigured = !!(process.env.ALERTMANAGER_SECRET || process.env.CRON_SECRET);
  return NextResponse.json({
    status: 'ok',
    endpoint: '/api/alerts/webhook',
    authConfigured: secretConfigured,
    timestamp: new Date().toISOString(),
  });
}
