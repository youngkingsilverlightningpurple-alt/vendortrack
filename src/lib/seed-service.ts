'use server';

/**
 * @fileOverview Seed Service — Admin Only
 *
 * SECURITY: All seed operations now require admin authorization.
 * Regular users cannot purge data or seed the marketplace.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, isAuthError } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';

const CATEGORIES = ['Components', 'Storage', 'Peripherals', 'Power', 'Audio', 'Displays'];
const SELLER_NAMES = [
  'Volt Systems', 'Nexus Gear', 'Silicon Valley Direct', 'Byte Size',
  'Circuit Master', 'Current Trends', 'Digital Forge', 'ElecTron',
  'Flash Point', 'GigaStore', 'HyperLink', 'Ionix Solutions'
];
const FIRST_NAMES = ['Alex', 'Sarah', 'James', 'Elena', 'Michael', 'Emma', 'David', 'Chloe', 'Robert', 'Lisa'];
const LAST_NAMES = ['Chen', 'Miller', 'Wilson', 'Gomez', 'Taylor', 'White', 'Lee', 'Baker', 'Smith', 'Zhang'];

/**
 * Purge all users — admin only.
 */
export async function purgeAllUsers(currentUserId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.USERS_DELETE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    return 0;
  }

  const admin = getSupabaseAdmin();
  const { data: users, error } = await ((admin.from('profiles') as any) as any).select('id').neq('id', currentUserId) as any;
  if (error) throw error;

  let deletedCount = 0;
  for (const user of (users || []) as any[]) {
    const { error: delError } = await ((admin.from('profiles') as any) as any).delete().eq('id', user.id);
    if (!delError) deletedCount++;
  }
  return deletedCount;
}

/**
 * Seed marketplace data — admin only.
 */
export async function seedMarketplaceData(adminId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.PLATFORM_MANAGE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    return { users: 0, products: 0, orders: 0 };
  }

  const admin = getSupabaseAdmin();
  console.log("Starting realistic systems initialization...");

  // 1. Create Sellers
  const sellerProfiles = [];
  for (let i = 0; i < 12; i++) {
    sellerProfiles.push({
      id: crypto.randomUUID(),
      full_name: `${FIRST_NAMES[i % 10]} ${LAST_NAMES[i % 10]}`,
      email: `ops@${SELLER_NAMES[i]!.toLowerCase().replace(' ', '')}.com`,
      role: 'seller',
      seller_status: 'approved',
      stripe_connected: true,
      store_name: SELLER_NAMES[i],
      store_description: `Official ${SELLER_NAMES[i]} distribution hub. Specialists in high-performance ${CATEGORIES[i % 6]} and accessories.`,
      stripe_account_id: `acct_${Math.random().toString(36).substr(2, 14)}`,
      created_at: new Date(Date.now() - (30 * 24 * 60 * 60 * 1000)).toISOString()
    });
  }

  // 2. Create Buyers
  const buyerProfiles = [];
  for (let i = 0; i < 50; i++) {
    buyerProfiles.push({
      id: crypto.randomUUID(),
      full_name: `${FIRST_NAMES[Math.floor(Math.random() * 10)]} ${LAST_NAMES[Math.floor(Math.random() * 10)]}`,
      email: `buyer${i}@vendortrack.io`,
      role: 'buyer',
      created_at: new Date(Date.now() - (Math.random() * 60 * 24 * 60 * 60 * 1000)).toISOString()
    });
  }

  await ((admin.from('profiles') as any) as any).insert([...sellerProfiles, ...buyerProfiles] as any);

  // 3. Generate 250 Products
  const products = [];
  for (let i = 0; i < 250; i++) {
    const seller = sellerProfiles[Math.floor(Math.random() * sellerProfiles.length)]!;
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]!;
    const priceCents = (Math.floor(Math.random() * 450) + 15) * 100 + 99;

    products.push({
      id: crypto.randomUUID(),
      seller_id: seller.id,
      title: `${category} Pro Series Model ${i + 100}`,
      category: category,
      description: `Industrial-grade ${category.toLowerCase()} solution with high-tolerance components.`,
      price_cents: priceCents,
      stock: Math.floor(Math.random() * 85),
      image_url: `/api/placeholder/${category.toLowerCase()}/${i}`,
      status: 'active',
      created_at: new Date(Date.now() - (Math.random() * 45 * 24 * 60 * 60 * 1000)).toISOString()
    });
  }
  await ((admin.from('products') as any) as any).insert(products as any);

  // 4. Generate 200 Orders
  const orders = [];
  const auditLogs = [];

  for (let i = 0; i < 200; i++) {
    const buyer = buyerProfiles[Math.floor(Math.random() * buyerProfiles.length)]!;
    const product = products[Math.floor(Math.random() * products.length)]!;
    const quantity = Math.floor(Math.random() * 2) + 1;
    const totalCents = product.price_cents * quantity;
    const commissionCents = Math.round(totalCents * 0.10);
    const traceId = `tr_${Math.random().toString(36).substr(2, 12)}`;

    let status = 'delivered';
    let refundStatus = 'none';
    if (i > 180) status = 'pending';
    if (i > 192) { status = 'refunded'; refundStatus = 'approved'; }
    if (i > 197) status = 'pending';

    const createdAt = new Date(Date.now() - (Math.random() * 30 * 24 * 60 * 60 * 1000)).toISOString();

    orders.push({
      id: crypto.randomUUID(),
      seller_id: product.seller_id,
      buyer_id: buyer.id,
      buyer_name: buyer.full_name,
      product_id: product.id,
      product_name: product.title,
      quantity: quantity,
      amount_total_cents: totalCents,
      commission_cents: commissionCents,
      status: status,
      refund_status: refundStatus,
      payment_intent_id: `pi_${Math.random().toString(36).substr(2, 14)}`,
      trace_id: traceId,
      created_at: createdAt
    });

    auditLogs.push({
      trace_id: traceId,
      event_type: 'PAYMENT_CAPTURED',
      severity: 'INFO',
      payload: { amount: totalCents, pi: `pi_${i}` },
      created_at: createdAt
    });
  }

  await ((admin.from('orders') as any) as any).insert(orders as any);
  await ((admin.from('audit_logs') as any) as any).insert(auditLogs as any);

  console.log("Systems Seeding Complete. Operational state: BELIEVABLE.");
  return { users: 63, products: 250, orders: 200 };
}
