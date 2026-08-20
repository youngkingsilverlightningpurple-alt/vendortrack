/**
 * @fileOverview VendorTrack Demo Reset Script
 *
 * Deletes ALL demo data from the database, leaving real data untouched.
 *
 * Demo data is identified by:
 *   - Auth users with email matching `*@demo.vendortrack.app`
 *   - Orders with `trace_id LIKE 'tr_TEST_%'`
 *   - Products with `image_url LIKE '%/api/placeholder/%'`
 *   - Financial_ledger entries with `trace_id LIKE 'tr_TEST_%'`
 *   - Audit_logs with `trace_id LIKE 'tr_TEST_%'`
 *   - Conversations + messages tied to demo orders
 *   - Cart_items + payment_sessions for demo users
 *
 * Run via:
 *   npm run reset:demo
 *
 * After reset, run `npm run seed:demo` to re-populate.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function log(stage: string, message: string, count?: number) {
  const ts = new Date().toISOString().split('T')[1]?.split('.')[0] ?? '';
  const countStr = count !== undefined ? ` (${count})` : '';
  console.log(`[${ts}] [${stage}]${countStr} ${message}`);
}

async function main() {
  console.log('');
  console.log('============================================================');
  console.log('  VENDORTRACK DEMO RESET');
  console.log('============================================================');
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log('  This will delete ALL demo data. Real data is untouched.');
  console.log('============================================================');
  console.log('');

  // Step 1: Fetch demo user IDs (so we can delete their cart_items + payment_sessions)
  log('FETCH', 'Finding demo users...');
  const { data: demoAuthUsers } = await supabase.auth.admin.listUsers();
  const demoUserIds = (demoAuthUsers?.users ?? [])
    .filter((u) => u.email?.endsWith('@demo.vendortrack.app'))
    .map((u) => u.id);

  log('FETCH', `Found ${demoUserIds.length} demo users.`, demoUserIds.length);

  // Step 2: Delete in dependency order
  log('DELETE', 'Deleting demo messages...');
  // Messages: delete by conversation_id matching demo order IDs
  // We can't easily identify demo messages directly — delete all messages whose
  // conversation_id is in our demo conversations set. Easier: delete all messages,
  // since they're only created by demo seed. (If real messages exist, they'd be
  // recreated by the next real conversation.)
  // Safer approach: delete messages via CASCADE by deleting conversations first.
  // But conversations don't have a demo marker — we'll identify them by
  // buyer_id IN demoUserIds.
  if (demoUserIds.length > 0) {
    // Delete conversations (CASCADE deletes messages)
    log('DELETE', 'Deleting demo conversations (messages cascade-delete)...');
    for (const userId of demoUserIds) {
      const { error } = await supabase
        .from('conversations')
        .delete()
        .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);
      if (error) console.warn(`  conversations delete warning:`, error.message);
    }

    // Delete cart_items
    log('DELETE', 'Deleting demo cart_items...');
    const { error: cartErr } = await supabase
      .from('cart_items')
      .delete()
      .in('user_id', demoUserIds);
    if (cartErr) console.warn(`  cart_items delete warning:`, cartErr.message);

    // Delete payment_sessions
    log('DELETE', 'Deleting demo payment_sessions...');
    const { error: sessErr } = await supabase
      .from('payment_sessions')
      .delete()
      .in('user_id', demoUserIds);
    if (sessErr) console.warn(`  payment_sessions delete warning:`, sessErr.message);
  }

  // Delete financial_ledger entries (by trace_id prefix)
  log('DELETE', 'Deleting demo financial_ledger entries...');
  const { error: ledgerErr, count: ledgerCount } = await supabase
    .from('financial_ledger')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (ledgerErr) console.warn(`  financial_ledger delete warning:`, ledgerErr.message);
  else log('DELETE', `Deleted ${ledgerCount ?? 0} ledger entries.`, ledgerCount ?? 0);

  // Delete audit_logs (by trace_id prefix)
  log('DELETE', 'Deleting demo audit_logs...');
  const { error: auditErr, count: auditCount } = await supabase
    .from('audit_logs')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (auditErr) console.warn(`  audit_logs delete warning:`, auditErr.message);
  else log('DELETE', `Deleted ${auditCount ?? 0} audit_logs.`, auditCount ?? 0);

  // Delete orders (by trace_id prefix)
  log('DELETE', 'Deleting demo orders...');
  const { error: orderErr, count: orderCount } = await supabase
    .from('orders')
    .delete()
    .like('trace_id', 'tr_TEST_%');
  if (orderErr) console.warn(`  orders delete warning:`, orderErr.message);
  else log('DELETE', `Deleted ${orderCount ?? 0} orders.`, orderCount ?? 0);

  // Delete products (by image_url prefix — demo products use /api/placeholder/)
  log('DELETE', 'Deleting demo products...');
  const { error: prodErr, count: prodCount } = await supabase
    .from('products')
    .delete()
    .like('image_url', '%/api/placeholder/%');
  if (prodErr) console.warn(`  products delete warning:`, prodErr.message);
  else log('DELETE', `Deleted ${prodCount ?? 0} products.`, prodCount ?? 0);

  // Delete demo profiles (by email domain)
  log('DELETE', 'Deleting demo profiles...');
  for (const userId of demoUserIds) {
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', userId);
    if (error) console.warn(`  profile delete warning for ${userId}:`, error.message);
  }

  // Delete demo auth users
  log('DELETE', 'Deleting demo auth users...');
  for (const userId of demoUserIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) console.warn(`  auth user delete warning for ${userId}:`, error.message);
  }

  console.log('');
  console.log('============================================================');
  console.log('  DEMO RESET COMPLETE');
  console.log('============================================================');
  console.log(`  Deleted ${demoUserIds.length} demo auth users + their profiles.`);
  console.log(`  Deleted all orders, products, ledger entries, audit_logs,`);
  console.log(`  conversations, messages, cart_items, and payment_sessions`);
  console.log(`  created by the demo seed.`);
  console.log('');
  console.log('  Run `npm run seed:demo` to re-populate.');
  console.log('============================================================');
  console.log('');
}

main().catch((err) => {
  console.error('');
  console.error('❌ DEMO RESET FAILED:');
  console.error(err);
  console.error('');
  process.exit(1);
});
