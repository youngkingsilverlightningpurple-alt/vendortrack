/**
 * @fileoverview Alertmanager Webhook Receiver
 *
 * Receives alerts from Prometheus Alertmanager and logs them
 * for operational visibility. This endpoint is called by
 * Alertmanager when alerts fire or resolve.
 *
 * SECURITY: Requires ALERTMANAGER_SECRET bearer token.
 *           Alerts are logged but no state-modifying actions are taken.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('alertmanager-webhook');

export const dynamic = 'force-dynamic';

/**
 * Verify the Alertmanager bearer token.
 * Fail-closed: if ALERTMANAGER_SECRET is not set, deny all requests.
 */
function verifyAlertmanagerAuth(request: NextRequest): boolean {
  const secret = process.env.ALERTMANAGER_SECRET;
  if (!secret) {
    // SECURITY: No secret configured — deny all access
    return false;
  }
  const authHeader = request.headers.get('authorization');
  return authHeader === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  // Step 1: Verify authentication
  if (!verifyAlertmanagerAuth(request)) {
    log.warn('Alertmanager webhook received without valid authentication');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Parse the Alertmanager payload
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    log.warn('Alertmanager webhook received invalid JSON payload');
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Step 3: Log the alert for operational visibility
  const alerts = (payload as any)?.alerts || [];
  const status = (payload as any)?.status || 'unknown';
  const groupKey = (payload as any)?.groupKey || 'unknown';

  if (status === 'firing') {
    for (const alert of alerts) {
      log.error('Alert firing', {
        action: 'alert_firing',
        data: {
          alertName: alert.labels?.alertname,
          severity: alert.labels?.severity,
          summary: alert.annotations?.summary,
          startsAt: alert.startsAt,
          groupKey,
        },
      });
    }
  } else if (status === 'resolved') {
    for (const alert of alerts) {
      log.info('Alert resolved', {
        action: 'alert_resolved',
        data: {
          alertName: alert.labels?.alertname,
          severity: alert.labels?.severity,
          endsAt: alert.endsAt,
          groupKey,
        },
      });
    }
  } else {
    log.info('Alertmanager webhook received', {
      action: 'alert_webhook',
      data: { status, groupKey, alertCount: alerts.length },
    });
  }

  return NextResponse.json({ received: true });
}
