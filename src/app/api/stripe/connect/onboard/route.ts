/**
 * @fileOverview Stripe Connect Onboarding API
 *
 * P0 FIX (war room): the audit identified that NO Stripe Connect onboarding
 * flow existed in the codebase. This API route is the entry point for
 * sellers to start the onboarding process.
 *
 * Flow:
 *   1. Seller visits /seller-dashboard/settings
 *   2. Seller clicks "Connect Stripe" button
 *   3. Button calls this API route (POST /api/stripe/connect/onboard)
 *   4. Route calls `getOrCreateConnectAccount()` from connect-service
 *   5. Route returns the onboarding URL to the client
 *   6. Client redirects to the URL (Stripe-hosted onboarding UI)
 *   7. Seller completes onboarding on Stripe
 *   8. Stripe redirects back to /seller-dashboard/settings?stripe_onboarding=complete
 *   9. Stripe fires `account.updated` webhook → `handleAccountUpdated()` syncs status to DB
 *
 * SECURITY:
 *   - Auth required (seller role)
 *   - CSRF protection (via middleware — POST requests check Origin)
 *   - Rate limiting: handled at middleware level for /api/* endpoints
 *
 * VERIFICATION: code-verified. Live verification requires real Stripe
 * Connect credentials (see connect-service.ts header).
 */

import { NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { getOrCreateConnectAccount, getAccountStatus } from '@/lib/payment/connect-service';
import { PaymentLogger } from '@/lib/payment/errors';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getErrorMessage } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST() {
  const traceId = `connect_onboard_${Date.now()}`;

  // Step 1: Authenticate the seller
  const auth = await requireAuth({
    permission: PERMISSIONS.PRODUCTS_WRITE,
    sellerOnly: true,
  });

  if (isAuthError(auth) || !auth.success) {
    return NextResponse.json(
      { error: 'Unauthorized — seller authentication required' },
      { status: 401 }
    );
  }

  const sellerId = auth.userId;
  const sellerEmail = auth.email;

  if (!sellerEmail) {
    return NextResponse.json(
      { error: 'Seller profile missing email address — cannot create Stripe Connect account' },
      { status: 400 }
    );
  }

  // Fetch the seller's profile to get their store name (used in Stripe metadata)
  const admin = getSupabaseAdmin();
  const { data: profile } = await (admin
    .from('profiles') as any)
    .select('full_name, store_name')
    .eq('id', sellerId)
    .single();
  const sellerName = profile?.store_name ?? profile?.full_name ?? sellerEmail.split('@')[0];

  PaymentLogger.info(traceId, 'connect_onboard_request', `Seller ${sellerId} requested Stripe Connect onboarding`, {
    sellerId,
    sellerEmail,
  });

  try {
    // Step 2: Get or create the Connect account + onboarding URL
    const result = await getOrCreateConnectAccount(sellerId, sellerEmail, sellerName);

    PaymentLogger.info(traceId, 'connect_onboard_success', `Stripe Connect onboarding URL generated for seller ${sellerId}`, {
      sellerId,
      stripeAccountId: result.accountId,
      hasOnboardingUrl: !!result.onboardingUrl,
      stripeConnected: result.status?.stripeConnected ?? false,
    });

    return NextResponse.json({
      url: result.onboardingUrl,
      accountId: result.accountId,
      status: result.status,
      // If onboardingUrl is null, the seller is already fully onboarded.
      alreadyConnected: result.onboardingUrl === null,
    });
  } catch (error) {
    PaymentLogger.error(
      traceId,
      'connect_onboard_failed',
      error instanceof Error ? error : new Error(getErrorMessage(error)),
      {
        sellerId,
        error: getErrorMessage(error),
      }
    );

    return NextResponse.json(
      {
        error: 'Failed to start Stripe Connect onboarding',
        detail: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint: returns the seller's current Stripe Connect status
 * (without generating a new onboarding URL). Used by the settings page
 * to display the current state.
 */
export async function GET() {
  const traceId = `connect_status_${Date.now()}`;

  const auth = await requireAuth({
    permission: PERMISSIONS.PRODUCTS_WRITE,
    sellerOnly: true,
  });

  if (isAuthError(auth) || !auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sellerId = auth.userId;

  // Fetch the seller's profile to get their stripe_account_id
  const admin = getSupabaseAdmin();
  const { data: profile } = await (admin
    .from('profiles') as any)
    .select('stripe_account_id, stripe_connected')
    .eq('id', sellerId)
    .single();
  const stripeAccountId = profile?.stripe_account_id ?? null;

  if (!stripeAccountId || stripeAccountId.startsWith('acct_TEST_')) {
    // No real Stripe Connect account yet (or only a seed-data fake account)
    return NextResponse.json({
      stripeConnected: false,
      stripeAccountId: null,
      message: 'No Stripe Connect account. Click "Connect Stripe" to start onboarding.',
    });
  }

  try {
    const status = await getAccountStatus(stripeAccountId);

    PaymentLogger.info(traceId, 'connect_status_retrieved', `Stripe Connect status retrieved for seller ${sellerId}`, {
      sellerId,
      stripeAccountId,
      stripeConnected: status.stripeConnected,
    });

    return NextResponse.json({
      stripeConnected: status.stripeConnected,
      stripeAccountId: status.stripeAccountId,
      chargesEnabled: status.chargesEnabled,
      payoutsEnabled: status.payoutsEnabled,
      detailsSubmitted: status.detailsSubmitted,
      requirements: status.requirements,
    });
  } catch (error) {
    PaymentLogger.error(
      traceId,
      'connect_status_failed',
      error instanceof Error ? error : new Error(getErrorMessage(error)),
      {
        sellerId,
        stripeAccountId,
        error: getErrorMessage(error),
      }
    );

    return NextResponse.json(
      {
        error: 'Failed to retrieve Stripe Connect status',
        detail: getErrorMessage(error),
      },
      { status: 500 }
    );
  }
}
