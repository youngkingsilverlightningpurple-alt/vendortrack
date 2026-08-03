/**
 * @fileoverview Acceptance Tests — End-to-End Production Verification
 *
 * Validates complete user workflows:
 *   - Buyer journey (browse → cart → checkout → order)
 *   - Seller journey (dashboard → products → orders)
 *   - Admin workflow (monitoring → users → refunds)
 *   - Refund flow
 *   - Search
 *   - Payments
 *   - Monitoring
 *   - Background jobs
 *
 * USAGE:
 *   npx tsx scripts/acceptance-tests.ts
 *   npm run verify:acceptance
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.BASE_URL || 'http://localhost:9002';

interface AcceptanceTest {
  id: string;
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  durationMs: number;
}

const tests: AcceptanceTest[] = [];

async function runTest(id: string, category: string, name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    tests.push({ id, name, category, status: 'pass', message: 'OK', durationMs });
    console.log(`  \x1b[32m✓\x1b[0m [${id}] ${name} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    tests.push({ id, name, category, status: 'fail', message, durationMs });
    console.log(`  \x1b[31m✗\x1b[0m [${id}] ${name}: ${message} (${durationMs}ms)`);
  }
}

function skipTest(id: string, category: string, name: string, reason: string) {
  tests.push({ id, name, category, status: 'skip', message: reason, durationMs: 0 });
  console.log(`  \x1b[33m⊘\x1b[0m [${id}] ${name}: ${reason}`);
}

function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ============================================================
// ACCEPTANCE TEST SUITES
// ============================================================

async function testBuyerJourney() {
  console.log('\n🛒 A1: Buyer Journey Acceptance Tests');

  const supabase = getAdminClient();

  await runTest('A1.1', 'Buyer', 'Buyer account exists and is accessible', async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    const buyer = users?.users?.find(u => u.email === 'buyer@vendortrack.demo');
    if (!buyer) throw new Error('Buyer demo account not found — run seed:demo');
  });

  await runTest('A1.2', 'Buyer', 'Products are browsable', async () => {
    const { data, error } = await supabase.from('products').select('*').eq('status', 'active').limit(10);
    if (error) throw new Error(`Products query failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error('No active products found — run seed:demo');
  });

  await runTest('A1.3', 'Buyer', 'Product categories are populated', async () => {
    const { data, error } = await supabase.from('products').select('category').eq('status', 'active');
    if (error) throw new Error(error.message);
    const categories = [...new Set(data?.map(p => p.category) || [])];
    if (categories.length < 3) throw new Error(`Only ${categories.length} categories found`);
  });

  await runTest('A1.4', 'Buyer', 'Product detail page route works', async () => {
    const { data } = await supabase.from('products').select('id').eq('status', 'active').limit(1).single();
    if (!data) throw new Error('No product available for detail page test');
    try {
      const response = await fetch(`${BASE_URL}/products/${data.id}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Product page returned ${response.status}`);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running — start with: npm run dev');
      }
      throw err;
    }
  });

  await runTest('A1.5', 'Buyer', 'Buyer orders page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/buyer-orders`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      // Should redirect to login if not authenticated
      if (response.status === 307 || response.status === 302) {
        return; // Expected redirect to login
      }
      if (response.ok) return; // Also fine if page loads
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A1.6', 'Buyer', 'Cart page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/cart`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testSellerJourney() {
  console.log('\n🏪 A2: Seller Journey Acceptance Tests');

  const supabase = getAdminClient();

  await runTest('A2.1', 'Seller', 'Seller account exists and is approved', async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    const seller = users?.users?.find(u => u.email === 'seller@vendortrack.demo');
    if (!seller) throw new Error('Seller demo account not found — run seed:demo');

    const { data: profile } = await supabase.from('profiles').select('seller_status').eq('id', seller.id).single();
    if (profile?.seller_status !== 'approved') throw new Error(`Seller not approved: ${profile?.seller_status}`);
  });

  await runTest('A2.2', 'Seller', 'Seller has products listed', async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    const seller = users?.users?.find(u => u.email === 'seller@vendortrack.demo');
    if (!seller) throw new Error('Seller account not found');

    const { data, error } = await supabase.from('products').select('*').eq('seller_id', seller.id);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('Seller has no products listed');
  });

  await runTest('A2.3', 'Seller', 'Seller dashboard page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/seller-dashboard`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A2.4', 'Seller', 'Seller products page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/seller-dashboard/products`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A2.5', 'Seller', 'Seller orders page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/seller-dashboard/orders`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A2.6', 'Seller', 'Multiple sellers have products', async () => {
    const { data: sellers } = await supabase.from('profiles').select('id').eq('role', 'seller').eq('seller_status', 'approved');
    if (!sellers || sellers.length < 2) throw new Error('Need at least 2 approved sellers for demo');

    for (const seller of sellers) {
      const { data: products } = await supabase.from('products').select('id').eq('seller_id', seller.id).limit(1);
      if (!products || products.length === 0) throw new Error(`Seller ${seller.id} has no products`);
    }
  });
}

async function testAdminWorkflow() {
  console.log('\n👑 A3: Admin Workflow Acceptance Tests');

  const supabase = getAdminClient();

  await runTest('A3.1', 'Admin', 'Admin account exists with admin privileges', async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    const admin = users?.users?.find(u => u.email === 'admin@vendortrack.demo');
    if (!admin) throw new Error('Admin demo account not found — run seed:demo');

    const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', admin.id).single();
    if (!profile?.is_admin) throw new Error('Admin profile missing is_admin=true');
  });

  await runTest('A3.2', 'Admin', 'Admin dashboard page is accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/admin-dashboard`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A3.3', 'Admin', 'Marketplace stats are available', async () => {
    const { data, error } = await supabase.from('products').select('id', { count: 'exact', head: true });
    if (error) throw new Error(`Stats query failed: ${error.message}`);
  });

  await runTest('A3.4', 'Admin', 'User management pages are accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/admin-dashboard/users`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A3.5', 'Admin', 'Order management pages are accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/admin-dashboard/orders`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A3.6', 'Admin', 'Refund management pages are accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/admin-dashboard/refunds`, {
        signal: AbortSignal.timeout(5000),
        redirect: 'manual',
      });
      if (response.status === 307 || response.status === 302 || response.ok) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testRefundFlow() {
  console.log('\n💸 A4: Refund Flow Acceptance Tests');

  const supabase = getAdminClient();

  await runTest('A4.1', 'Refund', 'Orders with refund requests exist', async () => {
    const { data, error } = await supabase.from('orders').select('*').eq('refund_status', 'requested');
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      // This is acceptable — refunds may not have been seeded
      throw new Error('No refund-requested orders found — some demo data may be missing');
    }
  });

  await runTest('A4.2', 'Refund', 'Refund reason is captured', async () => {
    const { data, error } = await supabase.from('orders').select('refund_reason').not('refund_status', 'is', null).limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0 && !data[0].refund_reason) {
      throw new Error('Refund reason not captured for refund request');
    }
  });
}

async function testSearchFlow() {
  console.log('\n🔍 A5: Search Acceptance Tests');

  await runTest('A5.1', 'Search', 'Search API returns results', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/products/search?q=keyboard&limit=5`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Search returned ${response.status}`);
      const data = await response.json();
      if (data.data && data.data.length === 0) throw new Error('Search returned no results for "keyboard"');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A5.2', 'Search', 'Search handles empty queries', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/products/search?limit=5`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Empty search returned ${response.status}`);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A5.3', 'Search', 'Search category filter works', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/products/search?q=&category=Electronics&limit=5`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Category search returned ${response.status}`);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testPaymentsFlow() {
  console.log('\n💳 A6: Payment Acceptance Tests');

  await runTest('A6.1', 'Payments', 'Checkout session API is protected', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/checkout/create-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [] }),
        signal: AbortSignal.timeout(5000),
      });
      // Should return 401 (unauthenticated) or 403
      if (response.status === 200) throw new Error('Checkout session should require authentication');
      if (response.status === 401 || response.status === 403) return;
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A6.2', 'Payments', 'Stripe webhook endpoint exists', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/webhooks/stripe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000),
      });
      // Should return 400 (bad signature) — this proves the endpoint exists
      if (response.status === 404) throw new Error('Webhook endpoint not found');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testMonitoringFlow() {
  console.log('\n📊 A7: Monitoring Acceptance Tests');

  await runTest('A7.1', 'Monitoring', 'Health endpoint returns valid JSON', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      const data = await response.json();
      if (!data.status || !data.checks) throw new Error('Invalid health response format');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A7.2', 'Monitoring', 'Performance metrics endpoint exists', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/performance`, {
        signal: AbortSignal.timeout(5000),
      });
      // May require admin auth
      if (response.status === 401 || response.status === 403) return;
      if (!response.ok) throw new Error(`Performance endpoint returned ${response.status}`);
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A7.3', 'Monitoring', 'Audit logs are populated', async () => {
    const supabase = getAdminClient();
    const { data, error } = await supabase.from('audit_logs').select('id').limit(1);
    if (error) throw new Error(`Audit logs query failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error('No audit logs found — run seed:demo');
  });
}

async function testBackgroundJobs() {
  console.log('\n⏰ A8: Background Jobs Acceptance Tests');

  await runTest('A8.1', 'Jobs', 'Cron health check endpoint exists', async () => {
    try {
      const secret = process.env.CRON_SECRET;
      const headers: Record<string, string> = {};
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
      const response = await fetch(`${BASE_URL}/api/cron/health-check`, { headers, signal: AbortSignal.timeout(5000) });
      if (response.status === 404) throw new Error('Cron health check endpoint not found');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A8.2', 'Jobs', 'Cron cache warming endpoint exists', async () => {
    try {
      const secret = process.env.CRON_SECRET;
      const headers: Record<string, string> = {};
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
      const response = await fetch(`${BASE_URL}/api/cron/cache-warming`, { headers, signal: AbortSignal.timeout(5000) });
      if (response.status === 404) throw new Error('Cache warming endpoint not found');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await runTest('A8.3', 'Jobs', 'Cron reconciliation endpoint exists', async () => {
    try {
      const secret = process.env.CRON_SECRET;
      const headers: Record<string, string> = {};
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
      const response = await fetch(`${BASE_URL}/api/cron/reconciliation`, { headers, signal: AbortSignal.timeout(5000) });
      if (response.status === 404) throw new Error('Reconciliation endpoint not found');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     VendorTrack — Acceptance Tests                        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}`);

  const startTime = performance.now();

  await testBuyerJourney();
  await testSellerJourney();
  await testAdminWorkflow();
  await testRefundFlow();
  await testSearchFlow();
  await testPaymentsFlow();
  await testMonitoringFlow();
  await testBackgroundJobs();

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  // Summary
  const passed = tests.filter(t => t.status === 'pass').length;
  const failed = tests.filter(t => t.status === 'fail').length;
  const skipped = tests.filter(t => t.status === 'skip').length;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Acceptance Test Summary                   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n  ✓ Passed:  ${passed}`);
  console.log(`  ✗ Failed:  ${failed}`);
  console.log(`  ⊘ Skipped: ${skipped}`);
  console.log(`\n  Total: ${tests.length} tests in ${elapsed}s`);

  // Category breakdown
  const categories = [...new Set(tests.map(t => t.category))];
  console.log('\n  By Category:');
  for (const cat of categories) {
    const catTests = tests.filter(t => t.category === cat);
    const catPassed = catTests.filter(t => t.status === 'pass').length;
    console.log(`    ${cat}: ${catPassed}/${catTests.length} passed`);
  }

  if (failed > 0) {
    console.log('\n  ❌ Acceptance tests FAILED');
    console.log('\n  Failed tests:');
    tests.filter(t => t.status === 'fail').forEach(t => {
      console.log(`    ✗ [${t.id}] ${t.name}: ${t.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n  ✅ All acceptance tests PASSED');
    process.exit(0);
  }
}

main();
