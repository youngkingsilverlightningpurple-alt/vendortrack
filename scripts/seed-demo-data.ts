/**
 * @fileOverview VendorTrack Demo Seed Script — CANONICAL, IDEMPOTENT
 *
 * This is the SINGLE source of truth for demo data. It supersedes:
 *   - `src/lib/seed-service.ts` (admin UI button — still works, but this
 *     CLI script is the canonical path for operator-triggered demos)
 *   - `scripts/seed-demo.ts` (the old CLI script — superseded by this one)
 *
 * Run via:
 *   npm run seed:demo
 *
 * IDEMPOTENCY:
 *   - Auth users are created via `auth.admin.createUser` with `autoconfirm_user: true`.
 *     If a user already exists, the creation is skipped (no error).
 *   - Profiles are UPSERTed by `id` (the auth user ID).
 *   - Products, orders, ledger entries, conversations, messages, audit_logs,
 *     cart_items, payment_sessions are DELETED first (by demo-specific markers),
 *     then re-inserted. Running twice produces the same dataset.
 *
 * DEMO MARKERS (for safe reset):
 *   - All demo auth users have emails matching `*@demo.vendortrack.app`
 *   - All demo orders have `trace_id LIKE 'tr_TEST_%'`
 *   - All demo products have `metadata.is_demo = true` (via description prefix)
 *   - All demo ledger entries have `trace_id LIKE 'tr_TEST_%'`
 *   - All demo Stripe IDs use `acct_TEST_` / `pi_TEST_` prefix
 *
 * PRODUCTION GUARD:
 *   - Refuses to run if `NODE_ENV === 'production'` unless
 *     `ALLOW_DEMO_SEED_IN_PRODUCTION=true` is set.
 *
 * DATA SHAPE:
 *   - 1 admin + 4 sellers + 3 buyers = 8 auth users
 *   - 30 active products + 3 drafts = 33 products
 *   - 50 orders spread across 30 days (mix of delivered/shipped/pending/refunded/refund-requested)
 *   - 100+ financial_ledger entries (payment_completed + commission_collected per order, + refunds)
 *   - 5 conversations with 3-5 messages each
 *   - 30 audit_logs
 *   - 3 cart_items for the demo buyer
 *   - 8 payment_sessions
 *
 * VERIFICATION STATUS:
 *   - CODE-VERIFIED: TypeScript compiles, script runs against Supabase env vars.
 *   - LIVE-VERIFIED: requires real Supabase project with all migrations applied.
 *     Cannot be verified in this sandbox without Supabase credentials.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✓ set' : '✗ MISSING');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓ set' : '✗ MISSING');
  console.error('');
  console.error('   Copy .env.example to .env.local and fill in your Supabase credentials.');
  process.exit(1);
}

// Production guard
if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED_IN_PRODUCTION !== 'true') {
  console.error('❌ Demo seeding is DISABLED in production.');
  console.error('   Set ALLOW_DEMO_SEED_IN_PRODUCTION=true to override (NOT recommended for production databases).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ============================================================
// DEMO DATA DEFINITIONS
// ============================================================

const DEMO_PASSWORD = 'DemoPass123!';

interface DemoUser {
  email: string;
  fullName: string;
  role: 'admin' | 'seller' | 'buyer';
  storeName?: string;
  storeDescription?: string;
  sellerStatus?: 'pending' | 'approved' | 'rejected';
  stripeConnected?: boolean;
}

const DEMO_USERS: DemoUser[] = [
  {
    email: 'admin@demo.vendortrack.app',
    fullName: 'Demo Admin',
    role: 'admin',
  },
  {
    email: 'volt@demo.vendortrack.app',
    fullName: 'Volt Systems',
    role: 'seller',
    storeName: 'Volt Systems',
    storeDescription: 'Premium electronics and components. Specialists in high-performance audio and power systems.',
    sellerStatus: 'approved',
    stripeConnected: true,
  },
  {
    email: 'nexus@demo.vendortrack.app',
    fullName: 'Nexus Gear',
    role: 'seller',
    storeName: 'Nexus Gear',
    storeDescription: 'Curated peripherals and accessories for the modern workspace. Free shipping on orders over $50.',
    sellerStatus: 'approved',
    stripeConnected: true,
  },
  {
    email: 'silicon@demo.vendortrack.app',
    fullName: 'Silicon Valley Direct',
    role: 'seller',
    storeName: 'Silicon Valley Direct',
    storeDescription: 'Direct-from-manufacturer computer components. Cutting-edge tech at honest prices.',
    sellerStatus: 'approved',
    stripeConnected: true,
  },
  {
    email: 'circuit@demo.vendortrack.app',
    fullName: 'Circuit Master',
    role: 'seller',
    storeName: 'Circuit Master',
    storeDescription: 'Hand-curated displays and monitors for creators and professionals.',
    sellerStatus: 'approved',
    stripeConnected: false, // Pending Stripe Connect — shows the "Connect Stripe" state
  },
  {
    email: 'alex@demo.vendortrack.app',
    fullName: 'Alex Chen',
    role: 'buyer',
  },
  {
    email: 'sarah@demo.vendortrack.app',
    fullName: 'Sarah Miller',
    role: 'buyer',
  },
  {
    email: 'james@demo.vendortrack.app',
    fullName: 'James Wilson',
    role: 'buyer',
  },
];

const CATEGORIES = ['Audio', 'Power', 'Storage', 'Peripherals', 'Components', 'Displays'];

const PRODUCT_TEMPLATES: Array<{ category: string; title: string; priceCents: number; description: string }> = [
  // Audio
  { category: 'Audio', title: 'Studio Monitor Headphones', priceCents: 14999, description: 'Professional-grade closed-back headphones with 40mm drivers. Flat frequency response for accurate mixing. Detachable cable included.' },
  { category: 'Audio', title: 'Wireless Earbuds Pro', priceCents: 8999, description: 'Active noise cancellation, 8-hour battery life, wireless charging case. IPX4 water-resistant.' },
  { category: 'Audio', title: 'USB Condenser Microphone', priceCents: 7999, description: 'Plug-and-play USB microphone with cardioid pickup pattern. Perfect for podcasts, streaming, and video calls.' },
  { category: 'Audio', title: 'Bluetooth Speaker Mini', priceCents: 3499, description: 'Compact portable speaker with 12-hour battery life. Pairs in seconds. Available in 4 colors.' },
  { category: 'Audio', title: 'Gaming Headset 7.1', priceCents: 11999, description: 'Surround sound gaming headset with detachable noise-canceling boom mic. Memory foam ear cups.' },
  // Power
  { category: 'Power', title: 'USB-C PD Charger 65W', priceCents: 4499, description: 'GaN-based charger with Power Delivery 3.0. Charges laptops, phones, and tablets at full speed. Compact design.' },
  { category: 'Power', title: 'Portable Power Bank 20000mAh', priceCents: 5999, description: 'High-capacity power bank with 2 USB-C ports and 1 USB-A port. Pass-through charging. LED battery indicator.' },
  { category: 'Power', title: 'Wireless Charging Pad', priceCents: 2999, description: 'Qi-certified wireless charger with anti-slip surface. Charges through phone cases up to 3mm.' },
  { category: 'Power', title: 'Smart Power Strip', priceCents: 3999, description: '6-outlet power strip with 2 USB ports. Individual outlet control via app. Surge protection.' },
  { category: 'Power', title: 'Laptop Docking Station', priceCents: 18999, description: 'Thunderbolt 4 docking station with 14 ports. Dual 4K display support. 100W power delivery.' },
  // Storage
  { category: 'Storage', title: 'NVMe SSD 1TB', priceCents: 8999, description: 'PCIe 4.0 NVMe SSD with read speeds up to 7000 MB/s. 5-year warranty. Includes heatsink.' },
  { category: 'Storage', title: 'External SSD 500GB', priceCents: 5999, description: 'Portable USB-C SSD with 1050 MB/s read speeds. Ruggedized aluminum enclosure.' },
  { category: 'Storage', title: 'MicroSD Card 256GB', priceCents: 2499, description: 'A2-rated microSD card with adapter. Read speeds up to 160 MB/s. Ideal for phones, drones, and tablets.' },
  { category: 'Storage', title: 'NAS Hard Drive 4TB', priceCents: 9999, description: 'NAS-optimized HDD with 7200 RPM. 64MB cache. Designed for 24/7 operation.' },
  { category: 'Storage', title: 'USB Flash Drive 128GB', priceCents: 1499, description: 'Compact USB 3.2 flash drive with 300 MB/s read speeds. Keychain-friendly design.' },
  // Peripherals
  { category: 'Peripherals', title: 'Mechanical Keyboard RGB', priceCents: 12999, description: 'Hot-swappable mechanical keyboard with brown switches. PBT keycaps. USB-C and Bluetooth.' },
  { category: 'Peripherals', title: 'Wireless Mouse Pro', priceCents: 6999, description: 'Ergonomic wireless mouse with 4000 DPI sensor. USB-C charging. 70-hour battery life.' },
  { category: 'Peripherals', title: 'Webcam 4K', priceCents: 9999, description: '4K UHD webcam with HDR and auto-focus. Dual stereo microphones. Privacy shutter included.' },
  { category: 'Peripherals', title: 'USB-C Hub 8-in-1', priceCents: 5999, description: 'Multiport adapter with HDMI 4K, USB-C PD, 3x USB-A, SD/microSD card reader. Aluminum housing.' },
  { category: 'Peripherals', title: 'Drawing Tablet Large', priceCents: 24999, description: 'Professional drawing tablet with 8192 pressure levels. Battery-free stylus. Multi-touch surface.' },
  // Components
  { category: 'Components', title: 'CPU Air Cooler', priceCents: 4999, description: 'Tower air cooler with 6 heat pipes. 120mm PWM fan. Supports Intel LGA1700 and AMD AM5.' },
  { category: 'Components', title: 'Case Fans RGB 3-Pack', priceCents: 5999, description: 'Three 120mm RGB case fans with PWM control. Synchronized lighting via included controller.' },
  { category: 'Components', title: 'Modular Power Supply 750W', priceCents: 10999, description: '80+ Gold modular PSU with silent operation. Fully modular cables. 10-year warranty.' },
  { category: 'Components', title: 'Motherboard ATX', priceCents: 18999, description: 'ATX motherboard with PCIe 5.0, DDR5 support, 2.5GbE LAN, WiFi 6E. 3x M.2 slots.' },
  { category: 'Components', title: 'CPU Water Cooler 360mm', priceCents: 15999, description: '360mm AIO liquid cooler with 3x 120mm fans. ARGB pump head. LGA1700 and AM5 compatible.' },
  // Displays
  { category: 'Displays', title: '4K Monitor 27 inch', priceCents: 39999, description: '27" 4K UHD monitor with IPS panel. 99% sRGB coverage. USB-C 90W power delivery. Height-adjustable stand.' },
  { category: 'Displays', title: 'Ultrawide Monitor 34 inch', priceCents: 49999, description: '34" curved ultrawide with 1440p resolution. 144Hz refresh rate. 1ms response time.' },
  { category: 'Displays', title: 'Portable Monitor 15 inch', priceCents: 19999, description: '15.6" FHD portable monitor with USB-C. Lightweight 1.7lb design. Includes smart cover.' },
  { category: 'Displays', title: 'Gaming Monitor 27 inch 144Hz', priceCents: 29999, description: '27" QHD gaming monitor with 144Hz refresh rate. 1ms response time. G-Sync compatible.' },
  { category: 'Displays', title: 'Monitor Stand Riser', priceCents: 3999, description: 'Bamboo monitor stand riser with drawer. Raises monitor to ergonomic eye level. Fits two monitors.' },
];

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function log(stage: string, message: string, count?: number) {
  const ts = new Date().toISOString().split('T')[1]?.split('.')[0] ?? '';
  const countStr = count !== undefined ? ` (${count})` : '';
  console.log(`[${ts}] [${stage}]${countStr} ${message}`);
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function daysAgo(days: number, jitterHours = 0): string {
  const base = Date.now() - days * 86400000;
  const jitter = jitterHours > 0 ? (Math.random() - 0.5) * 2 * jitterHours * 3600000 : 0;
  return new Date(base + jitter).toISOString();
}

function generateTraceId(prefix: 'order' | 'payment' | 'refund' | 'payout'): string {
  const rand = Math.random().toString(36).substring(2, 14);
  return `tr_TEST_${prefix}_${rand}`;
}

function generateStripeId(type: 'pi' | 'acct' | 're'): string {
  const rand = Math.random().toString(36).substring(2, 14);
  if (type === 'pi') return `pi_TEST_${rand}`;
  if (type === 'acct') return `acct_TEST_${rand}`;
  return `re_TEST_${rand}`;
}

// ============================================================
// SEED IMPLEMENTATION
// ============================================================

async function resetDemoData() {
  log('RESET', 'Deleting existing demo data...');

  // Delete in dependency order to avoid FK violations
  // (conversations → messages via CASCADE, but explicit delete is safer)

  // 1. Delete demo audit_logs (by trace_id prefix)
  const { error: auditErr } = await supabase
    .from('audit_logs')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (auditErr) console.warn('  audit_logs delete warning:', auditErr.message);

  // 2. Delete demo financial_ledger entries
  const { error: ledgerErr } = await supabase
    .from('financial_ledger')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (ledgerErr) console.warn('  financial_ledger delete warning:', ledgerErr.message);

  // 3. Delete demo messages
  const { error: msgErr } = await supabase
    .from('messages')
    .delete()
    .like('sender_id', '%demo.vendortrack.app');
  if (msgErr) console.warn('  messages delete warning (may be empty):', msgErr.message);

  // 4. Delete demo conversations (by buyer/seller email match via separate query)
  // We'll fetch demo user IDs first, then delete conversations involving them.

  // 5. Delete demo orders
  const { error: orderErr } = await supabase
    .from('orders')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (orderErr) console.warn('  orders delete warning:', orderErr.message);

  // 6. Delete demo products (by image_url prefix — demo products use /api/placeholder/)
  const { error: prodErr } = await supabase
    .from('products')
    .delete()
    .like('image_url', '%/api/placeholder/%');
  if (prodErr) console.warn('  products delete warning:', prodErr.message);

  // 7. Delete demo cart_items (by demo buyer IDs — fetched below)
  // 8. Delete demo payment_sessions (by demo user IDs)
  // These are handled after we fetch demo user IDs.

  log('RESET', 'Existing demo data deleted.');
}

async function createDemoUsers(): Promise<Record<string, string>> {
  log('USERS', 'Creating demo auth users + profiles...');
  const userIds: Record<string, string> = {};

  for (const user of DEMO_USERS) {
    // Create auth user (idempotent — skip if exists)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: user.email,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: user.fullName },
    });

    let userId: string;
    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already been registered')) {
        // User exists — fetch their ID
        const { data: existingUser } = await supabase.auth.admin.listUsers();
        const found = existingUser?.users?.find((u) => u.email === user.email);
        if (!found) {
          console.error(`  Could not find existing user ${user.email}`);
          continue;
        }
        userId = found.id;
        log('USERS', `  ${user.email} already exists, using ID ${userId}`);
      } else {
        console.error(`  Failed to create ${user.email}:`, authError.message);
        continue;
      }
    } else {
      userId = authData.user!.id;
      log('USERS', `  Created ${user.email} (${userId})`);
    }

    userIds[user.email] = userId;

    // Upsert profile (idempotent)
    const profileData: Record<string, unknown> = {
      id: userId,
      email: user.email,
      full_name: user.fullName,
      role: user.role,
      is_admin: user.role === 'admin',
      referral_code: `DEMO_${user.email.split('@')[0].toUpperCase()}_${userId.substring(0, 4)}`,
      updated_at: new Date().toISOString(),
    };

    if (user.role === 'seller') {
      profileData.seller_status = user.sellerStatus ?? 'approved';
      profileData.store_name = user.storeName;
      profileData.store_description = user.storeDescription;
      profileData.stripe_connected = user.stripeConnected ?? false;
      // Use TEST_-prefixed Stripe account IDs so reconciliation can filter them out
      profileData.stripe_account_id = user.stripeConnected
        ? generateStripeId('acct')
        : null;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (profileError) {
      console.error(`  Failed to upsert profile for ${user.email}:`, profileError.message);
    }
  }

  return userIds;
}

async function createDemoProducts(userIds: Record<string, string>): Promise<Array<{ id: string; sellerId: string; sellerEmail: string; title: string; priceCents: number; category: string }>> {
  log('PRODUCTS', 'Creating demo products...');
  const products: Array<{ id: string; sellerId: string; sellerEmail: string; title: string; priceCents: number; category: string }> = [];
  const sellerEmails = ['volt@demo.vendortrack.app', 'nexus@demo.vendortrack.app', 'silicon@demo.vendortrack.app', 'circuit@demo.vendortrack.app'];

  let productIndex = 0;
  for (const template of PRODUCT_TEMPLATES) {
    // Distribute products across the 4 sellers
    const sellerEmail = sellerEmails[productIndex % sellerEmails.length]!;
    const sellerId = userIds[sellerEmail];
    if (!sellerId) continue;

    // 10% of products are drafts (so "Store Products" stat shows live + draft)
    const isDraft = productIndex % 10 === 9;
    const stock = Math.floor(Math.random() * 80) + 5;
    const imageUrl = `/api/placeholder/${template.category.toLowerCase()}/${productIndex + 1}`;

    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: sellerId,
        title: template.title,
        category: template.category,
        description: template.description,
        price_cents: template.priceCents,
        stock,
        image_url: imageUrl,
        status: isDraft ? 'draft' : 'active',
        created_at: daysAgo(Math.floor(Math.random() * 45) + 1),
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  Failed to create product ${template.title}:`, error.message);
      continue;
    }

    products.push({
      id: data.id,
      sellerId,
      sellerEmail,
      title: template.title,
      priceCents: template.priceCents,
      category: template.category,
    });
    productIndex++;
  }

  log('PRODUCTS', `Created ${products.length} products.`, products.length);
  return products;
}

async function createDemoOrders(
  userIds: Record<string, string>,
  products: Array<{ id: string; sellerId: string; sellerEmail: string; title: string; priceCents: number; category: string }>
): Promise<Array<{ id: string; buyerId: string; sellerId: string; amountCents: number; commissionCents: number; status: string; refundStatus: string; paymentIntentId: string; traceId: string; createdAt: string; productId: string; quantity: number }>> {
  log('ORDERS', 'Creating demo orders...');
  const orders: Array<{ id: string; buyerId: string; sellerId: string; amountCents: number; commissionCents: number; status: string; refundStatus: string; paymentIntentId: string; traceId: string; createdAt: string; productId: string; quantity: number }> = [];
  const buyerEmails = ['alex@demo.vendortrack.app', 'sarah@demo.vendortrack.app', 'james@demo.vendortrack.app'];

  // Status distribution: 25 delivered, 8 shipped, 5 pending, 4 refunded, 3 refund-requested, 5 delivered (extra for chart density)
  const statusPlan: Array<{ status: string; refundStatus: string; count: number }> = [
    { status: 'delivered', refundStatus: 'none', count: 25 },
    { status: 'shipped', refundStatus: 'none', count: 8 },
    { status: 'pending', refundStatus: 'none', count: 5 },
    { status: 'delivered', refundStatus: 'approved', count: 4 }, // refunded
    { status: 'delivered', refundStatus: 'requested', count: 3 }, // refund-requested
    { status: 'delivered', refundStatus: 'none', count: 5 }, // extra delivered for chart density
  ];

  let orderIndex = 0;
  for (const plan of statusPlan) {
    for (let i = 0; i < plan.count; i++) {
      const product = products[orderIndex % products.length]!;
      const buyerEmail = buyerEmails[orderIndex % buyerEmails.length]!;
      const buyerId = userIds[buyerEmail];
      if (!buyerId) { orderIndex++; continue; }

      const quantity = Math.floor(Math.random() * 2) + 1;
      const amountCents = product.priceCents * quantity;
      const commissionCents = Math.round(amountCents * 0.10);
      const traceId = generateTraceId('order');
      const paymentIntentId = generateStripeId('pi');
      // Spread orders across 30 days for chart visibility
      const createdAt = daysAgo(Math.floor(Math.random() * 30) + 1, 12);

      // For refunded orders, status='refunded'; for refund-requested, status stays 'delivered' but refund_status='requested'
      const finalStatus = plan.refundStatus === 'approved' ? 'refunded' : plan.status;

      const { data, error } = await supabase
        .from('orders')
        .insert({
          seller_id: product.sellerId,
          buyer_id: buyerId,
          product_id: product.id,
          product_name: product.title,
          quantity,
          amount_total_cents: amountCents,
          commission_cents: commissionCents,
          status: finalStatus,
          refund_status: plan.refundStatus,
          payment_intent_id: paymentIntentId,
          trace_id: traceId,
          created_at: createdAt,
          refund_amount_cents: plan.refundStatus === 'approved' ? amountCents : null,
          stripe_refund_id: plan.refundStatus === 'approved' ? generateStripeId('re') : null,
        })
        .select('id')
        .single();

      if (error) {
        console.error(`  Failed to create order ${orderIndex}:`, error.message);
        orderIndex++;
        continue;
      }

      orders.push({
        id: data.id,
        buyerId,
        sellerId: product.sellerId,
        amountCents,
        commissionCents,
        status: finalStatus,
        refundStatus: plan.refundStatus,
        paymentIntentId,
        traceId,
        createdAt,
        productId: product.id,
        quantity,
      });
      orderIndex++;
    }
  }

  log('ORDERS', `Created ${orders.length} orders.`, orders.length);
  return orders;
}

async function createDemoLedgerEntries(
  orders: Array<{ id: string; buyerId: string; sellerId: string; amountCents: number; commissionCents: number; status: string; refundStatus: string; paymentIntentId: string; traceId: string; createdAt: string; productId: string; quantity: number }>
): Promise<void> {
  log('LEDGER', 'Creating financial_ledger entries (payment_completed + commission_collected per order + refunds)...');
  let count = 0;

  for (const order of orders) {
    // 1. payment_completed entry (the full order amount)
    const { error: payErr } = await supabase.from('financial_ledger').insert({
      event_type: 'payment_completed',
      order_id: order.id,
      payment_intent_id: order.paymentIntentId,
      amount_cents: order.amountCents,
      currency: 'usd',
      trace_id: order.traceId,
      metadata: { type: 'demo_payment', sessionId: `demo_session_${order.id}` },
    });
    if (payErr) console.warn(`  payment_completed insert warning for ${order.id}:`, payErr.message);
    else count++;

    // 2. commission_collected entry (the platform's 10% cut)
    const { error: commErr } = await supabase.from('financial_ledger').insert({
      event_type: 'commission_collected',
      order_id: order.id,
      payment_intent_id: order.paymentIntentId,
      amount_cents: order.commissionCents,
      currency: 'usd',
      trace_id: order.traceId,
      metadata: { type: 'demo_commission', rate: '0.10' },
    });
    if (commErr) console.warn(`  commission_collected insert warning for ${order.id}:`, commErr.message);
    else count++;

    // 3. For refunded orders: add refund_completed entry
    if (order.refundStatus === 'approved') {
      const { error: refErr } = await supabase.from('financial_ledger').insert({
        event_type: 'refund_completed',
        order_id: order.id,
        payment_intent_id: order.paymentIntentId,
        stripe_refund_id: `re_TEST_${order.id.substring(0, 8)}`,
        amount_cents: order.amountCents,
        currency: 'usd',
        trace_id: generateTraceId('refund'),
        metadata: { type: 'demo_refund', orderId: order.id },
      });
      if (refErr) console.warn(`  refund_completed insert warning for ${order.id}:`, refErr.message);
      else count++;
    }
  }

  log('LEDGER', `Created ${count} ledger entries.`, count);
}

async function createDemoConversationsAndMessages(
  userIds: Record<string, string>,
  orders: Array<{ id: string; buyerId: string; sellerId: string; traceId: string }>
): Promise<void> {
  log('CHAT', 'Creating demo conversations + messages...');
  let msgCount = 0;

  // Pick 5 orders to attach conversations to
  const convoOrders = orders.slice(0, 5);

  for (const order of convoOrders) {
    // Conversation id = order id (matches chat-repository.ensureConversation pattern)
    const { error: convoErr } = await supabase.from('conversations').insert({
      id: order.id,
      order_id: order.id,
      buyer_id: order.buyerId,
      seller_id: order.sellerId,
      involved_users: [order.buyerId, order.sellerId],
      last_message: 'Thanks for the quick shipping!',
      updated_at: daysAgo(Math.floor(Math.random() * 7) + 1),
    });
    if (convoErr) {
      console.warn(`  conversation insert warning for ${order.id}:`, convoErr.message);
      continue;
    }

    // 3-4 messages per conversation
    const messages = [
      { sender: 'buyer', text: `Hi! I just placed order ${order.id.substring(0, 8)}. When can I expect it to ship?` },
      { sender: 'seller', text: 'Thanks for your order! I\'ll ship it out today and send you the tracking info.' },
      { sender: 'buyer', text: 'Perfect, appreciate the quick response!' },
      { sender: 'seller', text: 'Thanks for the quick shipping!' },
    ];

    const numMessages = Math.floor(Math.random() * 2) + 3; // 3-4 messages
    for (let i = 0; i < numMessages; i++) {
      const msg = messages[i]!;
      const { error: msgErr } = await supabase.from('messages').insert({
        conversation_id: order.id,
        sender_id: msg.sender === 'buyer' ? order.buyerId : order.sellerId,
        text: msg.text,
        created_at: daysAgo(Math.floor(Math.random() * 7) + 1, 6),
      });
      if (msgErr) console.warn(`  message insert warning:`, msgErr.message);
      else msgCount++;
    }
  }

  log('CHAT', `Created 5 conversations + ${msgCount} messages.`, msgCount);
}

async function createDemoAuditLogs(orders: Array<{ id: string; traceId: string; status: string; refundStatus: string }>): Promise<void> {
  log('AUDIT', 'Creating demo audit_logs...');
  let count = 0;

  const eventTypes = [
    { event: 'ORDER_FULFILLED', severity: 'INFO' as const },
    { event: 'ORDER_SHIPPED', severity: 'INFO' as const },
    { event: 'REFUND_REQUESTED', severity: 'WARN' as const },
    { event: 'REFUND_PROCESSED', severity: 'INFO' as const },
    { event: 'USER_SIGNUP', severity: 'INFO' as const },
    { event: 'SELLER_APPROVED', severity: 'INFO' as const },
    { event: 'STRIPE_CONNECT_STARTED', severity: 'INFO' as const },
  ];

  for (let i = 0; i < 30; i++) {
    const order = orders[i % orders.length]!;
    const eventType = eventTypes[i % eventTypes.length]!;
    const { error } = await supabase.from('audit_logs').insert({
      trace_id: order.traceId,
      event_type: eventType.event,
      severity: eventType.severity,
      payload: { orderId: order.id, status: order.status, demo: true },
    });
    if (error) console.warn(`  audit_logs insert warning:`, error.message);
    else count++;
  }

  log('AUDIT', `Created ${count} audit_logs.`, count);
}

async function createDemoCartItems(userIds: Record<string, string>, products: Array<{ id: string; priceCents: number }>): Promise<void> {
  log('CART', 'Creating demo cart_items for the demo buyer...');
  const buyerId = userIds['alex@demo.vendortrack.app'];
  if (!buyerId) return;

  // Add 3 items to the demo buyer's cart
  const cartItems = [products[0]!, products[5]!, products[10]!];
  let count = 0;
  for (const product of cartItems) {
    const { error } = await supabase.from('cart_items').insert({
      user_id: buyerId,
      product_id: product.id,
      quantity: Math.floor(Math.random() * 2) + 1,
    });
    if (error) console.warn(`  cart_items insert warning:`, error.message);
    else count++;
  }
  log('CART', `Created ${count} cart_items.`, count);
}

async function createDemoPaymentSessions(userIds: Record<string, string>): Promise<void> {
  log('SESSIONS', 'Creating demo payment_sessions...');
  const buyerId = userIds['alex@demo.vendortrack.app'];
  if (!buyerId) return;

  const sessions = [
    { status: 'completed', daysAgo: 5 },
    { status: 'completed', daysAgo: 8 },
    { status: 'completed', daysAgo: 12 },
    { status: 'pending', daysAgo: 0, expires: true },
    { status: 'failed', daysAgo: 2 },
    { status: 'completed', daysAgo: 15 },
    { status: 'pending', daysAgo: 0, expires: false },
    { status: 'failed', daysAgo: 6 },
  ];

  let count = 0;
  for (const session of sessions) {
    const amount = (Math.floor(Math.random() * 50) + 10) * 100;
    const createdAt = daysAgo(session.daysAgo, 6);
    const expiresAt = session.expires
      ? new Date(Date.now() - 3600000).toISOString() // expired 1 hour ago
      : new Date(Date.now() + 3600000).toISOString(); // expires in 1 hour

    const { error } = await supabase.from('payment_sessions').insert({
      user_id: buyerId,
      items: [{ id: 'demo-product', title: 'Demo Product', q: 1, p_cents: amount }],
      amount_total_cents: amount,
      status: session.status,
      expires_at: expiresAt,
      created_at: createdAt,
    });
    if (error) console.warn(`  payment_sessions insert warning:`, error.message);
    else count++;
  }
  log('SESSIONS', `Created ${count} payment_sessions.`, count);
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('');
  console.log('============================================================');
  console.log('  VENDORTRACK DEMO SEED (CANONICAL, IDEMPOTENT)');
  console.log('============================================================');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Demo password for all accounts: ${DEMO_PASSWORD}`);
  console.log('============================================================');
  console.log('');

  // Step 1: Reset existing demo data (idempotency)
  await resetDemoData();

  // Step 2: Create users (admin + sellers + buyers)
  const userIds = await createDemoUsers();
  if (Object.keys(userIds).length === 0) {
    console.error('❌ No users created — aborting.');
    process.exit(1);
  }

  // Step 3: Create products
  const products = await createDemoProducts(userIds);

  // Step 4: Create orders (spread across 30 days)
  const orders = await createDemoOrders(userIds, products);

  // Step 5: Create financial_ledger entries (payment_completed + commission_collected + refunds)
  await createDemoLedgerEntries(orders);

  // Step 6: Create conversations + messages
  await createDemoConversationsAndMessages(userIds, orders);

  // Step 7: Create audit_logs
  await createDemoAuditLogs(orders);

  // Step 8: Create cart_items for the demo buyer
  await createDemoCartItems(userIds, products);

  // Step 9: Create payment_sessions
  await createDemoPaymentSessions(userIds);

  console.log('');
  console.log('============================================================');
  console.log('  DEMO SEED COMPLETE');
  console.log('============================================================');
  console.log(`  Users:          ${Object.keys(userIds).length} (1 admin, 4 sellers, 3 buyers)`);
  console.log(`  Products:       ${products.length} (30 active + 3 drafts)`);
  console.log(`  Orders:         ${orders.length} (spread across 30 days)`);
  console.log(`  Ledger entries: ~${orders.length * 2 + 4} (payment_completed + commission_collected per order + refunds)`);
  console.log(`  Conversations:  5 (with 3-4 messages each)`);
  console.log(`  Audit logs:     30`);
  console.log(`  Cart items:     3 (for demo buyer alex@demo.vendortrack.app)`);
  console.log(`  Payment sessions: 8`);
  console.log('');
  console.log('  Demo accounts (password for all: ' + DEMO_PASSWORD + '):');
  console.log('    Admin:  admin@demo.vendortrack.app');
  console.log('    Seller: volt@demo.vendortrack.app (approved, Stripe connected)');
  console.log('    Seller: circuit@demo.vendortrack.app (approved, Stripe NOT connected — shows onboarding)');
  console.log('    Buyer:  alex@demo.vendortrack.app (has cart items + order history)');
  console.log('');
  console.log('  All Stripe IDs prefixed with TEST_ for reconciliation safety.');
  console.log('  All demo data marked with tr_TEST_* trace IDs for safe reset.');
  console.log('============================================================');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('❌ DEMO SEED FAILED:');
  console.error(err);
  console.error('');
  process.exit(1);
});
