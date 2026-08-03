/**
 * @fileoverview Seed Reset — Clean Demo Data Reset
 *
 * Resets the demo environment to a clean state.
 * Removes all demo data and re-seeds with fresh data.
 *
 * USAGE:
 *   npx tsx scripts/seed-reset.ts
 *   npm run seed:reset
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEMO_EMAILS = [
  'admin@vendortrack.demo',
  'seller@vendortrack.demo',
  'eco@vendortrack.demo',
  'luxe@vendortrack.demo',
  'buyer@vendortrack.demo',
  'buyer2@vendortrack.demo',
];

async function deleteDemoData() {
  console.log('\n🗑️  Cleaning demo data...');

  // Delete in dependency order (reverse of creation)
  const tables = [
    'audit_logs',
    'payment_sessions',
    'processed_events',
    'messages',
    'conversations',
    'reviews',
    'orders',
    'products',
  ];

  for (const table of tables) {
    try {
      // For demo data, we delete all data since this is a demo reset
      const { error } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000');
      if (!error) {
        console.log(`  ✓ Cleared: ${table}`);
      } else {
        // Table might not exist or have RLS
        console.log(`  ⚠ ${table}: ${error.message}`);
      }
    } catch (err) {
      console.log(`  ⚠ ${table}: skipped`);
    }
  }
}

async function deleteDemoAccounts() {
  console.log('\n👤 Removing demo accounts...');

  const { data: users } = await supabase.auth.admin.listUsers();
  if (!users?.users) return;

  for (const user of users.users) {
    if (DEMO_EMAILS.includes(user.email || '')) {
      const { error } = await supabase.auth.admin.deleteUser(user.id);
      if (!error) {
        console.log(`  ✓ Deleted: ${user.email}`);
      } else {
        console.log(`  ⚠ Failed to delete ${user.email}: ${error.message}`);
      }
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          VendorTrack — Demo Reset                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  const startTime = performance.now();

  try {
    // Step 1: Delete demo data
    await deleteDemoData();

    // Step 2: Delete demo accounts
    await deleteDemoAccounts();

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  Reset Complete!                           ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nCompleted in ${elapsed}s`);
    console.log('\n💡 Run: npm run seed:demo  to re-populate with fresh data');

  } catch (err) {
    console.error('\n❌ Reset failed:', err);
    process.exit(1);
  }
}

main();
