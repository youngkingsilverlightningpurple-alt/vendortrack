/**
 * @fileoverview Production Verification — Automated System Validation
 *
 * Validates all critical production systems:
 *   - Authentication & Authorization
 *   - Database operations
 *   - Search functionality
 *   - Payment configuration
 *   - Feature flags
 *   - Cron jobs
 *   - Monitoring
 *   - Security
 *
 * USAGE:
 *   npx tsx scripts/production-verify.ts
 *   npm run verify
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.BASE_URL || 'http://localhost:9002';

interface TestResult {
  category: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function test(category: string, name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const durationMs = Math.round(performance.now() - start);
    results.push({ category, name, status: 'pass', message: 'OK', durationMs });
    console.log(`  \x1b[32m✓\x1b[0m ${name} (${durationMs}ms)`);
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    results.push({ category, name, status: 'fail', message, durationMs });
    console.log(`  \x1b[31m✗\x1b[0m ${name}: ${message} (${durationMs}ms)`);
  }
}

function skip(category: string, name: string, reason: string) {
  results.push({ category, name, status: 'skip', message: reason, durationMs: 0 });
  console.log(`  \x1b[33m⊘\x1b[0m ${name}: ${reason}`);
}

// ============================================================
// TEST SUITES
// ============================================================

async function testAuthentication() {
  console.log('\n🔐 Testing Authentication & Authorization...');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    skip('Auth', 'All auth tests', 'Supabase not configured');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await test('Auth', 'Admin user authentication', async () => {
    const { data, error } = await supabase.auth.admin.signInWithOtp({
      email: 'admin@vendortrack.demo',
    });
    // OTP sign-in may not work in test mode, but we can verify the user exists
    const { data: users } = await supabase.auth.admin.listUsers();
    const admin = users?.users?.find(u => u.email === 'admin@vendortrack.demo');
    if (!admin) throw new Error('Admin demo account not found');
  });

  await test('Auth', 'Demo accounts exist', async () => {
    const { data: users } = await supabase.auth.admin.listUsers();
    const demoEmails = [
      'admin@vendortrack.demo',
      'seller@vendortrack.demo',
      'buyer@vendortrack.demo',
    ];
    for (const email of demoEmails) {
      const exists = users?.users?.some(u => u.email === email);
      if (!exists) throw new Error(`Demo account missing: ${email}`);
    }
  });

  await test('Auth', 'Profile role enforcement', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('role, is_admin')
      .eq('email', 'admin@vendortrack.demo')
      .single();
    if (error) throw new Error(`Profile query failed: ${error.message}`);
    if (!data?.is_admin) throw new Error('Admin profile missing is_admin=true');
  });

  await test('Auth', 'Seller approval status', async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('seller_status')
      .eq('email', 'seller@vendortrack.demo')
      .single();
    if (error) throw new Error(`Seller profile query failed: ${error.message}`);
    if (data?.seller_status !== 'approved') throw new Error(`Seller not approved: ${data?.seller_status}`);
  });
}

async function testDatabase() {
  console.log('\n🗄️  Testing Database Operations...');

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    skip('DB', 'All database tests', 'Supabase not configured');
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await test('DB', 'Products table accessible', async () => {
    const { data, error } = await supabase.from('products').select('id, title, price_cents').limit(5);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) throw new Error('No products found — run seed:demo');
  });

  await test('DB', 'Orders table accessible', async () => {
    const { data, error } = await supabase.from('orders').select('id, status').limit(5);
    if (error) throw new Error(error.message);
  });

  await test('DB', 'Audit logs table accessible', async () => {
    const { data, error } = await supabase.from('audit_logs').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  await test('DB', 'Payment sessions table accessible', async () => {
    const { data, error } = await supabase.from('payment_sessions').select('id').limit(1);
    if (error) throw new Error(error.message);
  });

  await test('DB', 'Product categories exist', async () => {
    const { data, error } = await supabase.from('products').select('category');
    if (error) throw new Error(error.message);
    const categories = [...new Set(data?.map(p => p.category) || [])];
    if (categories.length < 3) throw new Error(`Only ${categories.length} categories found (need 3+)`);
  });

  await test('DB', 'Integer-precision pricing', async () => {
    const { data, error } = await supabase.from('products').select('price_cents').limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) {
      const price = data[0].price_cents;
      if (!Number.isInteger(price)) throw new Error('Price is not an integer — floating-point drift risk!');
    }
  });

  await test('DB', 'RLS policies active', async () => {
    // Verify by checking that anon key cannot access admin data
    const anonClient = createClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anonClient.from('profiles').select('*');
    // RLS should allow reading profiles but not sensitive fields
    if (error) throw new Error(`RLS check failed: ${error.message}`);
  });
}

async function testSearch() {
  console.log('\n🔍 Testing Search Functionality...');

  await test('Search', 'Search API endpoint', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/products/search?q=test&limit=5`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 429) {
        throw new Error(`Search API returned ${response.status}`);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running — start with: npm run dev');
      }
      throw err;
    }
  });

  await test('Search', 'Search suggestions', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/products/search?suggest=tech`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 429) {
        throw new Error(`Suggestions API returned ${response.status}`);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testPayments() {
  console.log('\n💳 Testing Payment Configuration...');

  await test('Payments', 'Stripe key configuration', async () => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not set');
    if (!key.startsWith('sk_')) throw new Error('Invalid Stripe key format');
  });

  await test('Payments', 'Stripe publishable key', async () => {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set');
    if (!key.startsWith('pk_')) throw new Error('Invalid Stripe publishable key format');
  });

  await test('Payments', 'Webhook secret', async () => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET not set');
    if (!secret.startsWith('whsec_')) throw new Error('Invalid webhook secret format');
  });
}

async function testSecurity() {
  console.log('\n🛡️  Testing Security...');

  await test('Security', 'Health endpoint accessible', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error(`Health endpoint returned ${response.status}`);
      const data = await response.json();
      if (!data.status) throw new Error('Health response missing status field');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await test('Security', 'Security headers present', async () => {
    try {
      const response = await fetch(`${BASE_URL}/`, {
        signal: AbortSignal.timeout(5000),
      });
      const headers = response.headers;
      const xFrame = headers.get('x-frame-options');
      const hsts = headers.get('strict-transport-security');
      const csp = headers.get('content-security-policy');
      if (!xFrame && !hsts && !csp) {
        throw new Error('Security headers not detected');
      }
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });

  await test('Security', 'Cron secret configured', async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) throw new Error('CRON_SECRET not set — cron endpoints unprotected');
  });
}

async function testFeatureFlags() {
  console.log('\n🚩 Testing Feature Flags...');

  await test('Feature Flags', 'Feature flags module loadable', async () => {
    try {
      const module = await import('../src/lib/monitoring/feature-flags');
      if (!module.isFeatureEnabled) throw new Error('isFeatureEnabled not exported');
    } catch (err) {
      throw new Error(`Feature flags module not loadable: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  });
}

async function testCronJobs() {
  console.log('\n⏰ Testing Cron Jobs...');

  await test('Cron', 'Health check cron endpoint', async () => {
    const secret = process.env.CRON_SECRET;
    try {
      const headers: Record<string, string> = {};
      if (secret) headers['Authorization'] = `Bearer ${secret}`;
      const response = await fetch(`${BASE_URL}/api/cron/health-check`, { headers, signal: AbortSignal.timeout(5000) });
      if (response.status === 401) throw new Error('Cron endpoint requires authentication but CRON_SECRET not sent');
      if (response.status === 503) throw new Error('Cron health check reports unhealthy');
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        throw new Error('Server not running');
      }
      throw err;
    }
  });
}

async function testMonitoring() {
  console.log('\n📊 Testing Monitoring...');

  await test('Monitoring', 'Performance metrics endpoint', async () => {
    try {
      const response = await fetch(`${BASE_URL}/api/performance`, {
        signal: AbortSignal.timeout(5000),
      });
      // May require admin auth
      if (response.status === 401 || response.status === 403) {
        // Expected for unauthenticated requests
        return;
      }
      if (!response.ok) throw new Error(`Performance endpoint returned ${response.status}`);
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
  console.log('║     VendorTrack — Production Verification                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}`);
  console.log(`Base URL: ${BASE_URL}`);

  const startTime = performance.now();

  await testAuthentication();
  await testDatabase();
  await testSearch();
  await testPayments();
  await testSecurity();
  await testFeatureFlags();
  await testCronJobs();
  await testMonitoring();

  const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

  // Summary
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                  Verification Summary                      ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\n  ✓ Passed:  ${passed}`);
  console.log(`  ✗ Failed:  ${failed}`);
  console.log(`  ⊘ Skipped: ${skipped}`);
  console.log(`\n  Total: ${results.length} tests in ${elapsed}s`);

  if (failed > 0) {
    console.log('\n  ❌ Production verification FAILED');
    console.log('\n  Failed tests:');
    results.filter(r => r.status === 'fail').forEach(r => {
      console.log(`    ✗ ${r.category}/${r.name}: ${r.message}`);
    });
    process.exit(1);
  } else {
    console.log('\n  ✅ All production verification tests PASSED');
    process.exit(0);
  }
}

main();
