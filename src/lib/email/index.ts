/**
 * @fileOverview Email Service — Real Resend Integration with Graceful Degradation
 *
 * P0 FIX (war room): the audit identified that NO email system was implemented.
 * The notification-service enqueued `'notification'` jobs, the worker had a
 * `console.log` stub, and no order confirmations / refunds / password resets
 * were ever sent.
 *
 * This module provides a REAL email send via Resend, with explicit graceful
 * degradation when Resend is not configured. The graceful degradation is
 * **honest** — it does not pretend to send emails. It:
 *   1. Records an audit log entry (`EMAIL_NOT_CONFIGURED`) so operators can see
 *      what would have been sent.
 *   2. Returns a structured result `{ sent: false, reason: 'not_configured' }`
 *      so callers (e.g. the worker) can mark the job as `completed` (not
 *      retried) without lying about success.
 *
 * When Resend IS configured (RESEND_API_KEY env var + `resend` package installed),
 * this module sends real emails through the Resend API.
 *
 * VERIFICATION STATUS:
 *   - Code-verified: TypeScript compiles, types are correct, audit log path
 *     works without Resend installed.
 *   - Live-verified: REQUIRES `resend` package installation + RESEND_API_KEY +
 *     verified sender domain. Operators must install `npm install resend` and
 *     configure the env var before this module will actually send emails.
 *     Until then, all emails are recorded as `EMAIL_NOT_CONFIGURED` in the
 *     audit log — no silent failure.
 */

import { PaymentLogger } from '@/lib/payment/errors';
import { auditLogRepository } from '@/repositories/audit-log-repository';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// ============================================================
// TYPES
// ============================================================

export type EmailTemplate =
  | 'order_confirmation_buyer'
  | 'payment_success_seller'
  | 'refund_processed_buyer'
  | 'refund_request_received_seller'
  | 'payout_sent_seller'
  | 'welcome_buyer'
  | 'welcome_seller'
  | 'password_reset';

export interface EmailRecipient {
  email: string;
  name?: string;
}

export interface SendEmailRequest {
  to: EmailRecipient;
  template: EmailTemplate;
  subject: string;
  /**
   * Template variables — merged into the email body. Each template defines
   * its own expected variables.
   */
  variables?: Record<string, string | number>;
  traceId: string;
}

export interface SendEmailResult {
  sent: boolean;
  reason?: 'not_configured' | 'invalid_recipient' | 'provider_error' | 'unknown_error';
  messageId?: string;
  error?: string;
}

// ============================================================
// RESEND CLIENT (lazy-loaded)
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _resendClient: any | null = null;
let _resendInitialized = false;
let _resendAvailable = false;

function getResendClient(): { available: true; client: NonNullable<typeof _resendClient> } | { available: false } {
  if (_resendInitialized) {
    if (_resendAvailable && _resendClient) {
      return { available: true, client: _resendClient };
    }
    return { available: false };
  }
  _resendInitialized = true;

  if (!process.env.RESEND_API_KEY) {
    _resendAvailable = false;
    return { available: false };
  }

  try {
    // Dynamic require so the package is optional. If `resend` is not in
    // package.json, this throws and we mark email as unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { Resend } = require('resend');
    _resendClient = new Resend(process.env.RESEND_API_KEY);
    _resendAvailable = true;
    return { available: true, client: _resendClient };
  } catch {
    _resendAvailable = false;
    return { available: false };
  }
}

// ============================================================
// TEMPLATE RENDERING
// ============================================================

/**
 * Render an email template to HTML + plain text.
 *
 * Templates are intentionally simple — they're plain HTML with {{variable}}
 * placeholders. This avoids pulling in a template engine dependency.
 */
function renderTemplate(
  template: EmailTemplate,
  variables: Record<string, string | number> = {}
): { subject: string; html: string; text: string } {
  // Helper: replace {{key}} with value
  const fill = (str: string): string =>
    str.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const v = variables[key];
      return v === undefined ? '' : String(v);
    });

  // Helper: format cents → dollars
  const formatCents = (cents: number): string => `$${(cents / 100).toFixed(2)}`;

  switch (template) {
    case 'order_confirmation_buyer': {
      const amount = formatCents(Number(variables.amountCents ?? 0));
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Order Confirmed</h1>
          <p>Hi {{buyerName}},</p>
          <p>Thanks for your purchase! Your order has been confirmed and the seller is preparing your items.</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Order ID</p>
            <p style="margin: 4px 0 16px; font-family: monospace;">{{orderId}}</p>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Amount</p>
            <p style="margin: 4px 0; font-size: 18px; font-weight: 600;">${amount}</p>
          </div>
          <p style="color: #64748b; font-size: 14px;">You can track your order status in your VendorTrack account.</p>
        </div>
      `;
      const text = `Order Confirmed\n\nHi {{buyerName}},\n\nThanks for your purchase! Your order {{orderId}} for ${amount} has been confirmed.\n\nYou can track your order status in your VendorTrack account.`;
      return { subject: `Order Confirmed — {{orderId}}`, html: fill(html), text: fill(text) };
    }
    case 'payment_success_seller': {
      const amount = formatCents(Number(variables.amountCents ?? 0));
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">You Made a Sale!</h1>
          <p>Hi {{sellerName}},</p>
          <p>Great news — you have a new order on VendorTrack.</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Order ID</p>
            <p style="margin: 4px 0 16px; font-family: monospace;">{{orderId}}</p>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Sale Amount (after 10% platform fee)</p>
            <p style="margin: 4px 0; font-size: 18px; font-weight: 600;">${amount}</p>
          </div>
          <p style="color: #64748b; font-size: 14px;">Please fulfill the order promptly. Funds will be transferred to your Stripe account.</p>
        </div>
      `;
      const text = `You Made a Sale!\n\nHi {{sellerName}},\n\nYou have a new order {{orderId}} for ${amount} (after platform fee).\n\nPlease fulfill the order promptly.`;
      return { subject: `New Sale — Order {{orderId}}`, html: fill(html), text: fill(text) };
    }
    case 'refund_processed_buyer': {
      const amount = formatCents(Number(variables.amountCents ?? 0));
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Refund Processed</h1>
          <p>Hi {{buyerName}},</p>
          <p>Your refund request has been approved and processed. The funds will appear on your original payment method within 5-10 business days.</p>
          <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Order ID</p>
            <p style="margin: 4px 0 16px; font-family: monospace;">{{orderId}}</p>
            <p style="margin: 0; color: #64748b; font-size: 14px;">Refund Amount</p>
            <p style="margin: 4px 0; font-size: 18px; font-weight: 600;">${amount}</p>
          </div>
        </div>
      `;
      const text = `Refund Processed\n\nHi {{buyerName}},\n\nYour refund for order {{orderId}} (${amount}) has been processed. Funds will appear on your original payment method within 5-10 business days.`;
      return { subject: `Refund Processed — {{orderId}}`, html: fill(html), text: fill(text) };
    }
    case 'refund_request_received_seller': {
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #d97706;">Refund Request Received</h1>
          <p>Hi {{sellerName}},</p>
          <p>A refund request has been submitted for order {{orderId}}.</p>
          <p style="background: #fef3c7; padding: 12px; border-radius: 6px; color: #92400e;">Reason: {{reason}}</p>
          <p style="color: #64748b; font-size: 14px;">Our team will review the request and process the refund if approved.</p>
        </div>
      `;
      const text = `Refund Request Received\n\nHi {{sellerName}},\n\nA refund request has been submitted for order {{orderId}}.\n\nReason: {{reason}}\n\nOur team will review and process if approved.`;
      return { subject: `Refund Request — Order {{orderId}}`, html: fill(html), text: fill(text) };
    }
    case 'payout_sent_seller': {
      const amount = formatCents(Number(variables.amountCents ?? 0));
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Payout Sent</h1>
          <p>Hi {{sellerName}},</p>
          <p>Your payout of ${amount} has been sent to your Stripe account.</p>
          <p style="color: #64748b; font-size: 14px;">Payout ID: {{payoutId}}</p>
        </div>
      `;
      const text = `Payout Sent\n\nHi {{sellerName}},\n\nYour payout of ${amount} has been sent to your Stripe account.\n\nPayout ID: {{payoutId}}`;
      return { subject: `Payout Sent — ${amount}`, html: fill(html), text: fill(text) };
    }
    case 'welcome_buyer': {
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Welcome to VendorTrack!</h1>
          <p>Hi {{buyerName}},</p>
          <p>Your buyer account has been created. Start exploring the marketplace now!</p>
          <p><a href="{{marketplaceUrl}}" style="background: #1a6b3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Browse Marketplace</a></p>
        </div>
      `;
      const text = `Welcome to VendorTrack!\n\nHi {{buyerName}},\n\nYour buyer account has been created. Start exploring the marketplace now: {{marketplaceUrl}}`;
      return { subject: `Welcome to VendorTrack!`, html: fill(html), text: fill(text) };
    }
    case 'welcome_seller': {
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Welcome to VendorTrack!</h1>
          <p>Hi {{sellerName}},</p>
          <p>Your seller account has been created. To start accepting payments, you'll need to connect your Stripe account.</p>
          <p><a href="{{settingsUrl}}" style="background: #1a6b3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Connect Stripe</a></p>
        </div>
      `;
      const text = `Welcome to VendorTrack!\n\nHi {{sellerName}},\n\nYour seller account has been created. To start accepting payments, connect your Stripe account: {{settingsUrl}}`;
      return { subject: `Welcome to VendorTrack — Set Up Your Store`, html: fill(html), text: fill(text) };
    }
    case 'password_reset': {
      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <h1 style="color: #1a6b3c;">Reset Your Password</h1>
          <p>Hi {{userName}},</p>
          <p>We received a request to reset your VendorTrack password. Click the button below to choose a new password:</p>
          <p><a href="{{resetUrl}}" style="background: #1a6b3c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a></p>
          <p style="color: #64748b; font-size: 14px;">This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `;
      const text = `Reset Your Password\n\nHi {{userName}},\n\nWe received a request to reset your VendorTrack password. Click the link below to choose a new password:\n\n{{resetUrl}}\n\nThis link expires in 1 hour.`;
      return { subject: `Reset Your VendorTrack Password`, html: fill(html), text: fill(text) };
    }
  }
}

// ============================================================
// EMAIL SEND
// ============================================================

/**
 * Send an email via Resend.
 *
 * If Resend is not configured (no RESEND_API_KEY or `resend` package not installed),
 * this function:
 *   1. Records an audit log entry (`EMAIL_NOT_CONFIGURED`) so operators can
 *      see what WOULD have been sent.
 *   2. Returns `{ sent: false, reason: 'not_configured' }`.
 *
 * The caller (typically the worker) should treat this as a successful job
 * completion — the email system is "working as designed" in its degraded state.
 * Retrying the job would just produce another audit log entry.
 *
 * VERIFICATION: this function is code-verified. Live verification requires:
 *   1. `npm install resend`
 *   2. RESEND_API_KEY env var configured
 *   3. Verified sender domain in Resend dashboard
 */
export async function sendEmail(request: SendEmailRequest): Promise<SendEmailResult> {
  const { to, template, subject, variables, traceId } = request;

  // Validate recipient
  if (!to.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.email)) {
    return { sent: false, reason: 'invalid_recipient', error: `Invalid email: ${to.email}` };
  }

  const clientResult = getResendClient();

  if (!clientResult.available) {
    // Honest graceful degradation: record what would have been sent.
    PaymentLogger.warn(
      traceId,
      'email_not_configured',
      `Email not sent (Resend not configured): ${template} to ${to.email}`,
      {
        template,
        recipient: to.email,
        subject,
        reason: 'not_configured',
      }
    );

    // Persist to audit_logs so the failure is queryable, not just in console.
    await auditLogRepository.insert({
      traceId,
      eventType: 'EMAIL_NOT_CONFIGURED',
      severity: 'WARN',
      payload: {
        template,
        recipient: to.email,
        recipientName: to.name ?? '',
        subject,
        variables: variables ?? {},
      },
    });

    return {
      sent: false,
      reason: 'not_configured',
    };
  }

  // Render template
  const rendered = renderTemplate(template, variables);

  // Send via Resend
  try {
    const from = process.env.RESEND_FROM_EMAIL || 'VendorTrack <noreply@vendortrack.app>';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await clientResult.client.emails.send({
      from,
      to: [to.email],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (error) {
      PaymentLogger.error(
        traceId,
        'email_provider_error',
        new Error(`Resend error: ${error.message}`),
        {
          template,
          recipient: to.email,
          error: error.message,
        }
      );

      await auditLogRepository.insert({
        traceId,
        eventType: 'EMAIL_PROVIDER_ERROR',
        severity: 'ERROR',
        payload: {
          template,
          recipient: to.email,
          error: error.message,
        },
      });

      return { sent: false, reason: 'provider_error', error: error.message };
    }

    PaymentLogger.info(
      traceId,
      'email_sent',
      `Email sent: ${template} to ${to.email}`,
      {
        template,
        recipient: to.email,
        messageId: data?.id ?? '',
      }
    );

    return { sent: true, messageId: data?.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    PaymentLogger.error(
      traceId,
      'email_unknown_error',
      error instanceof Error ? error : new Error(errorMessage),
      {
        template,
        recipient: to.email,
        error: errorMessage,
      }
    );

    await auditLogRepository.insert({
      traceId,
      eventType: 'EMAIL_UNKNOWN_ERROR',
      severity: 'ERROR',
      payload: {
        template,
        recipient: to.email,
        error: errorMessage,
      },
    });

    return { sent: false, reason: 'unknown_error', error: errorMessage };
  }
}

/**
 * Check if email is configured (for health checks).
 */
export function isEmailConfigured(): boolean {
  return getResendClient().available;
}

// ============================================================
// LOOKUP HELPERS
// ============================================================

/**
 * Look up a user's email and name by user ID.
 * Used by the worker to resolve recipient info from a job payload.
 */
export async function getUserContactInfo(userId: string): Promise<{ email: string; name: string } | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin
    .from('profiles') as any)
    .select('email, full_name')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return {
    email: data.email,
    name: data.full_name || data.email.split('@')[0],
  };
}

/**
 * Look up an order's buyer/seller + amount by order ID.
 */
export async function getOrderInfo(
  orderId: string
): Promise<{
  buyerId: string;
  sellerId: string;
  amountCents: number;
  buyerEmail: string;
  buyerName: string;
  sellerEmail: string;
  sellerName: string;
} | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await (admin
    .from('orders') as any)
    .select(`
      buyer_id,
      seller_id,
      amount_total_cents,
      buyer:profiles!orders_buyer_id_fkey(email, full_name),
      seller:profiles!orders_seller_id_fkey(email, full_name)
    `)
    .eq('id', orderId)
    .single();

  if (error || !data) return null;

  const buyer = (data as any).buyer;
  const seller = (data as any).seller;

  return {
    buyerId: data.buyer_id,
    sellerId: data.seller_id,
    amountCents: data.amount_total_cents,
    buyerEmail: buyer?.email ?? '',
    buyerName: buyer?.full_name ?? buyer?.email?.split('@')[0] ?? 'Buyer',
    sellerEmail: seller?.email ?? '',
    sellerName: seller?.full_name ?? seller?.email?.split('@')[0] ?? 'Seller',
  };
}
