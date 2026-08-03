/**
 * @fileoverview Demo Seed Data — Production-Ready Marketplace Dataset
 *
 * Creates realistic marketplace data for buyer demonstrations:
 *   - 3 demo accounts (buyer, seller, admin)
 *   - 6 product categories
 *   - 24 products across 3 sellers
 *   - 30 orders with various statuses
 *   - 15 reviews
 *   - 10 conversations/messages
 *   - 25 notifications
 *   - Analytics data
 *
 * SECURITY: This script uses the Supabase SERVICE ROLE KEY.
 * It must NEVER be exposed to client-side code.
 *
 * USAGE:
 *   npx tsx scripts/seed-demo.ts
 *   npm run seed:demo
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment
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

// ============================================================
// DEMO ACCOUNTS
// ============================================================

const DEMO_ACCOUNTS = {
  admin: {
    email: 'admin@vendortrack.demo',
    password: 'DemoAdmin2024!',
    full_name: 'Sarah Chen',
    role: 'admin' as const,
    is_admin: true,
    seller_status: null,
    store_name: null,
  },
  seller1: {
    email: 'seller@vendortrack.demo',
    password: 'DemoSeller2024!',
    full_name: 'Marcus Johnson',
    role: 'seller' as const,
    is_admin: false,
    seller_status: 'approved',
    store_name: 'TechTrend Gadgets',
  },
  seller2: {
    email: 'eco@vendortrack.demo',
    password: 'DemoEco2024!',
    full_name: 'Priya Patel',
    role: 'seller' as const,
    is_admin: false,
    seller_status: 'approved',
    store_name: 'EcoWare Essentials',
  },
  seller3: {
    email: 'luxe@vendortrack.demo',
    password: 'DemoLuxe2024!',
    full_name: 'James Wright',
    role: 'seller' as const,
    is_admin: false,
    seller_status: 'approved',
    store_name: 'LuxeLeather Co.',
  },
  buyer: {
    email: 'buyer@vendortrack.demo',
    password: 'DemoBuyer2024!',
    full_name: 'Emily Rodriguez',
    role: 'buyer' as const,
    is_admin: false,
    seller_status: null,
    store_name: null,
  },
  buyer2: {
    email: 'buyer2@vendortrack.demo',
    password: 'DemoBuyer22024!',
    full_name: 'David Kim',
    role: 'buyer' as const,
    is_admin: false,
    seller_status: null,
    store_name: null,
  },
};

// ============================================================
// CATEGORIES
// ============================================================

const CATEGORIES = [
  'Electronics',
  'Sustainable Living',
  'Fashion & Accessories',
  'Home & Kitchen',
  'Sports & Outdoors',
  'Books & Media',
];

// ============================================================
// PRODUCTS
// ============================================================

const PRODUCTS = [
  // TechTrend Gadgets (seller1)
  {
    title: 'Pro Mechanical Keyboard',
    category: 'Electronics',
    description: 'Premium mechanical keyboard with Cherry MX switches, RGB backlighting, and aluminum frame. Features hot-swappable switches, programmable macros, and USB-C connectivity. Perfect for developers and gamers who demand precision and durability.',
    price_cents: 14999,
    stock: 45,
    image_url: 'https://picsum.photos/seed/keyboard/600/600',
    status: 'active' as const,
  },
  {
    title: 'Wireless Noise-Canceling Headphones',
    category: 'Electronics',
    description: 'Studio-grade wireless headphones with active noise cancellation, 30-hour battery life, and premium memory foam ear cushions. Supports aptX HD and LDAC codecs for audiophile-quality sound reproduction.',
    price_cents: 29999,
    stock: 30,
    image_url: 'https://picsum.photos/seed/headphones/600/600',
    status: 'active' as const,
  },
  {
    title: '4K Ultra-Wide Monitor',
    category: 'Electronics',
    description: '34-inch ultra-wide curved monitor with 4K resolution, 144Hz refresh rate, and 1ms response time. HDR600 certified with 98% DCI-P3 color gamut. Ideal for creative professionals and immersive gaming.',
    price_cents: 79999,
    stock: 12,
    image_url: 'https://picsum.photos/seed/monitor/600/600',
    status: 'active' as const,
  },
  {
    title: 'Smart Home Hub Pro',
    category: 'Electronics',
    description: 'Central smart home controller supporting Zigbee, Z-Wave, WiFi, and Thread protocols. Features local processing, 7-inch touchscreen display, and compatibility with all major smart home ecosystems.',
    price_cents: 19999,
    stock: 60,
    image_url: 'https://picsum.photos/seed/smarthome/600/600',
    status: 'active' as const,
  },
  {
    title: 'Portable SSD 2TB',
    category: 'Electronics',
    description: 'Ultra-fast portable SSD with 2TB capacity, 2000MB/s read speed, and IP65 water resistance. Compact aluminum body with hardware encryption and USB-C 3.2 Gen 2 interface.',
    price_cents: 17999,
    stock: 80,
    image_url: 'https://picsum.photos/seed/ssd/600/600',
    status: 'active' as const,
  },
  {
    title: 'Ergonomic Wireless Mouse',
    category: 'Electronics',
    description: 'Vertical ergonomic mouse with adjustable DPI (800-4000), 6 programmable buttons, and dual connectivity (Bluetooth + USB). Reduces wrist strain with 57-degree natural handshake position.',
    price_cents: 6999,
    stock: 100,
    image_url: 'https://picsum.photos/seed/mouse/600/600',
    status: 'active' as const,
  },
  {
    title: 'USB-C Docking Station',
    category: 'Electronics',
    description: '15-in-1 USB-C docking station with triple display support, 100W power delivery, and 10Gbps data transfer. Includes HDMI, DisplayPort, Ethernet, SD card reader, and 4 USB-A ports.',
    price_cents: 12999,
    stock: 35,
    image_url: 'https://picsum.photos/seed/dock/600/600',
    status: 'active' as const,
  },
  {
    title: 'Webcam 4K Pro',
    category: 'Electronics',
    description: 'Professional 4K webcam with AI-powered auto-framing, noise-canceling dual microphones, and HDR. Compatible with all major video conferencing platforms. Includes privacy shutter.',
    price_cents: 15999,
    stock: 25,
    image_url: 'https://picsum.photos/seed/webcam/600/600',
    status: 'active' as const,
  },

  // EcoWare Essentials (seller2)
  {
    title: 'Bamboo Cutlery Set',
    category: 'Sustainable Living',
    description: 'Complete reusable bamboo cutlery set including fork, knife, spoon, chopsticks, and cleaning brush. Comes in organic cotton carrying pouch. 100% biodegradable and sustainably sourced.',
    price_cents: 2499,
    stock: 200,
    image_url: 'https://picsum.photos/seed/bamboo/600/600',
    status: 'active' as const,
  },
  {
    title: 'Beeswax Food Wraps (Pack of 6)',
    category: 'Sustainable Living',
    description: 'Organic cotton beeswax food wraps in assorted sizes. Replace plastic wrap with these reusable, washable, and compostable alternatives. Lasts up to 1 year with proper care.',
    price_cents: 1999,
    stock: 150,
    image_url: 'https://picsum.photos/seed/beeswax/600/600',
    status: 'active' as const,
  },
  {
    title: 'Stainless Steel Water Bottle',
    category: 'Sustainable Living',
    description: 'Double-wall vacuum insulated stainless steel bottle. Keeps drinks cold for 24 hours or hot for 12 hours. BPA-free, leak-proof, and available in 750ml capacity. Lifetime warranty.',
    price_cents: 3499,
    stock: 180,
    image_url: 'https://picsum.photos/seed/bottle/600/600',
    status: 'active' as const,
  },
  {
    title: 'Solar Power Bank 20000mAh',
    category: 'Sustainable Living',
    description: 'High-capacity solar-powered portable charger with dual USB output. Waterproof and shock-resistant design. Features LED flashlight and battery level indicator. Perfect for outdoor adventures.',
    price_cents: 4999,
    stock: 90,
    image_url: 'https://picsum.photos/seed/solar/600/600',
    status: 'active' as const,
  },
  {
    title: 'Organic Cotton Tote Bag',
    category: 'Sustainable Living',
    description: 'Heavy-duty organic cotton tote bag with reinforced handles and inner pocket. Screen-printed with eco-friendly water-based inks. Machine washable, holds up to 20kg.',
    price_cents: 1499,
    stock: 300,
    image_url: 'https://picsum.photos/seed/tote/600/600',
    status: 'active' as const,
  },
  {
    title: 'Compost Bin Starter Kit',
    category: 'Sustainable Living',
    description: 'Indoor composting system with activated charcoal filter, BPA-free bucket, and starter compost mix. Odor-free design perfect for kitchen use. Includes 50 biodegradable bags.',
    price_cents: 3999,
    stock: 70,
    image_url: 'https://picsum.photos/seed/compost/600/600',
    status: 'active' as const,
  },
  {
    title: 'Reusable Silicone Storage Bags',
    category: 'Sustainable Living',
    description: 'Set of 8 food-grade silicone storage bags in various sizes. Leak-proof, freezer-safe, microwave-safe, and dishwasher-safe. Replace single-use plastic bags permanently.',
    price_cents: 2999,
    stock: 120,
    image_url: 'https://picsum.photos/seed/silicone/600/600',
    status: 'active' as const,
  },
  {
    title: 'Recycled Glass Food Containers',
    category: 'Sustainable Living',
    description: 'Set of 5 glass food containers made from 100% recycled glass with bamboo lids. Oven, microwave, and freezer safe. Airtight silicone seal keeps food fresh longer.',
    price_cents: 4499,
    stock: 55,
    image_url: 'https://picsum.photos/seed/glass/600/600',
    status: 'active' as const,
  },

  // LuxeLeather Co. (seller3)
  {
    title: 'Full-Grain Leather Messenger Bag',
    category: 'Fashion & Accessories',
    description: 'Handcrafted full-grain leather messenger bag with brass hardware. Features padded laptop compartment (up to 15"), multiple organizer pockets, and adjustable shoulder strap. Ages beautifully with patina.',
    price_cents: 24999,
    stock: 15,
    image_url: 'https://picsum.photos/seed/messenger/600/600',
    status: 'active' as const,
  },
  {
    title: 'Italian Leather Wallet',
    category: 'Fashion & Accessories',
    description: 'Slim bifold wallet in premium Italian vegetable-tanned leather. Features 8 card slots, 2 bill compartments, and RFID blocking. Handstitched with waxed linen thread.',
    price_cents: 8999,
    stock: 40,
    image_url: 'https://picsum.photos/seed/wallet/600/600',
    status: 'active' as const,
  },
  {
    title: 'Leather Journal with Lock',
    category: 'Fashion & Accessories',
    description: 'A5 leather journal with antique brass lock and key. Contains 240 pages of acid-free cream paper. Features a pen holder, ribbon bookmark, and inner pocket. Perfect gift for writers.',
    price_cents: 4999,
    stock: 50,
    image_url: 'https://picsum.photos/seed/journal/600/600',
    status: 'active' as const,
  },
  {
    title: 'Leather Laptop Sleeve',
    category: 'Fashion & Accessories',
    description: 'Premium leather sleeve for 13-14 inch laptops. Memory foam padding with soft microfiber lining. Magnetic closure and front pocket for accessories. Burnished edges for a refined finish.',
    price_cents: 7999,
    stock: 30,
    image_url: 'https://picsum.photos/seed/sleeve/600/600',
    status: 'active' as const,
  },
  {
    title: 'Handcrafted Leather Belt',
    category: 'Fashion & Accessories',
    description: 'Full-grain leather belt with solid brass buckle. 1.5 inch width, hand-dyed and edge-painted. Available in sizes 28-42. Each belt is unique due to natural leather variations.',
    price_cents: 5999,
    stock: 60,
    image_url: 'https://picsum.photos/seed/belt/600/600',
    status: 'active' as const,
  },
  {
    title: 'Leather Key Organizer',
    category: 'Fashion & Accessories',
    description: 'Compact leather key organizer holding up to 6 keys. Prevents key scratching and jingling. Stainless steel hardware with screw-in mechanism for easy key changes.',
    price_cents: 2499,
    stock: 80,
    image_url: 'https://picsum.photos/seed/keys/600/600',
    status: 'active' as const,
  },
  {
    title: 'Leather Watch Roll',
    category: 'Fashion & Accessories',
    description: 'Travel watch roll in suede-lined leather. Holds 3 watches securely with elastic keepers. Snap closure and compact design fits in any bag. Perfect for collectors on the move.',
    price_cents: 6999,
    stock: 20,
    image_url: 'https://picsum.photos/seed/watchroll/600/600',
    status: 'active' as const,
  },
  {
    title: 'Leather Coaster Set',
    category: 'Home & Kitchen',
    description: 'Set of 4 hand-stitched leather coasters with cork backing. Absorbs condensation and protects surfaces. Comes in a gift box. Available in tan, dark brown, and black.',
    price_cents: 3499,
    stock: 45,
    image_url: 'https://picsum.photos/seed/coasters/600/600',
    status: 'active' as const,
  },
];

// ============================================================
// ORDER STATUSES
// ============================================================

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
const REFUND_STATUSES = [null, null, null, null, 'requested', 'approved', 'rejected']; // Mostly null

// ============================================================
// SEED FUNCTIONS
// ============================================================

async function createDemoAccounts() {
  console.log('\n👤 Creating demo accounts...');

  const accountIds: Record<string, string> = {};

  for (const [key, account] of Object.entries(DEMO_ACCOUNTS)) {
    try {
      // Try to create the auth user
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
      });

      if (authError) {
        // If user already exists, try to find them
        if (authError.message.includes('already registered')) {
          const { data: listData } = await supabase.auth.admin.listUsers();
          const existingUser = listData?.users?.find(u => u.email === account.email);
          if (existingUser) {
            accountIds[key] = existingUser.id;
            console.log(`  ✓ Found existing: ${account.email}`);
            continue;
          }
        }
        console.error(`  ✗ Failed to create ${account.email}: ${authError.message}`);
        continue;
      }

      if (authData?.user) {
        accountIds[key] = authData.user.id;
        console.log(`  ✓ Created: ${account.email}`);
      }
    } catch (err) {
      console.error(`  ✗ Error creating ${account.email}:`, err);
    }
  }

  // Update profiles
  console.log('\n📋 Updating profiles...');
  for (const [key, account] of Object.entries(DEMO_ACCOUNTS)) {
    const userId = accountIds[key];
    if (!userId) continue;

    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email: account.email,
        full_name: account.full_name,
        role: account.role,
        is_admin: account.is_admin,
        seller_status: account.seller_status,
        store_name: account.store_name,
        stripe_connected: account.role === 'seller',
      }, { onConflict: 'id' });

    if (error) {
      console.error(`  ✗ Profile update failed for ${account.email}: ${error.message}`);
    } else {
      console.log(`  ✓ Profile updated: ${account.full_name} (${account.role})`);
    }
  }

  return accountIds;
}

async function createProducts(accountIds: Record<string, string>) {
  console.log('\n📦 Creating products...');

  const sellerMap: Record<string, string> = {
    'TechTrend Gadgets': accountIds.seller1,
    'EcoWare Essentials': accountIds.seller2,
    'LuxeLeather Co.': accountIds.seller3,
  };

  const productIds: string[] = [];

  for (const product of PRODUCTS) {
    const sellerId = sellerMap[Object.keys(sellerMap).find(k =>
      product.category === 'Electronics' && k === 'TechTrend Gadgets' ||
      product.category === 'Sustainable Living' && k === 'EcoWare Essentials' ||
      (product.category === 'Fashion & Accessories' || product.category === 'Home & Kitchen') && k === 'LuxeLeather Co.'
    ) || 'TechTrend Gadgets'];

    if (!sellerId) {
      console.error(`  ✗ No seller found for product: ${product.title}`);
      continue;
    }

    const { data, error } = await supabase
      .from('products')
      .insert({
        seller_id: sellerId,
        title: product.title,
        category: product.category,
        description: product.description,
        price_cents: product.price_cents,
        stock: product.stock,
        image_url: product.image_url,
        status: product.status,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`  ✗ Failed to create product ${product.title}: ${error.message}`);
    } else {
      productIds.push(data.id);
      console.log(`  ✓ Created: ${product.title} ($${(product.price_cents / 100).toFixed(2)})`);
    }
  }

  return productIds;
}

async function createOrders(accountIds: Record<string, string>, productIds: string[]) {
  console.log('\n🛒 Creating orders...');

  if (productIds.length === 0) {
    console.log('  ⚠ No products available, skipping orders');
    return;
  }

  const buyerIds = [accountIds.buyer, accountIds.buyer2].filter(Boolean);
  const sellerIds = [accountIds.seller1, accountIds.seller2, accountIds.seller3].filter(Boolean);

  if (buyerIds.length === 0 || sellerIds.length === 0) {
    console.log('  ⚠ No buyer/seller accounts available, skipping orders');
    return;
  }

  const orderCount = 30;
  let created = 0;

  for (let i = 0; i < orderCount; i++) {
    const buyerId = buyerIds[i % buyerIds.length];
    const productIndex = i % productIds.length;
    const productId = productIds[productIndex];

    // Get product details for price
    const { data: product } = await supabase
      .from('products')
      .select('price_cents, seller_id')
      .eq('id', productId)
      .single();

    if (!product) continue;

    const quantity = Math.floor(Math.random() * 3) + 1;
    const amountTotalCents = product.price_cents * quantity;
    const commissionCents = Math.round(amountTotalCents * 0.10);
    const statusIndex = Math.min(Math.floor(i / 6), ORDER_STATUSES.length - 1);
    const status = ORDER_STATUSES[statusIndex];
    const refundStatus = status === 'delivered' ? REFUND_STATUSES[i % REFUND_STATUSES.length] : null;

    const { error } = await supabase.from('orders').insert({
      buyer_id: buyerId,
      seller_id: product.seller_id,
      product_id: productId,
      quantity,
      amount_total_cents: amountTotalCents,
      commission_cents: commissionCents,
      status,
      refund_status: refundStatus,
      refund_reason: refundStatus === 'requested' ? 'Item arrived damaged' : refundStatus === 'approved' ? 'Defective product' : null,
      payment_intent_id: `pi_demo_${Date.now()}_${i}`,
      trace_id: `trace_demo_${Date.now()}_${i}`,
      created_at: new Date(Date.now() - (orderCount - i) * 86400000).toISOString(),
    });

    if (!error) {
      created++;
    }
  }

  console.log(`  ✓ Created ${created} orders with various statuses`);
}

async function createReviews(accountIds: Record<string, string>, productIds: string[]) {
  console.log('\n⭐ Creating reviews...');

  if (productIds.length === 0) return;

  const buyerIds = [accountIds.buyer, accountIds.buyer2].filter(Boolean);
  if (buyerIds.length === 0) return;

  const reviewTemplates = [
    { rating: 5, comment: 'Absolutely outstanding quality! Exceeded my expectations in every way. The craftsmanship is impeccable and the attention to detail is remarkable.' },
    { rating: 4, comment: 'Great product overall. Very well made and exactly as described. Shipping was fast and the packaging was secure. Would definitely recommend.' },
    { rating: 5, comment: 'This is exactly what I was looking for. The build quality is superb and it works perfectly. Five stars without hesitation!' },
    { rating: 3, comment: 'Decent product but a bit overpriced for what you get. The quality is fine but nothing exceptional. Delivery was on time though.' },
    { rating: 4, comment: 'Very happy with this purchase. The product is well-designed and functional. Minor cosmetic issue but nothing that affects usability.' },
    { rating: 5, comment: 'Premium quality at a fair price. I have been using this daily for a month now and it still looks brand new. Highly recommended!' },
    { rating: 4, comment: 'Solid product with excellent materials. The design is thoughtful and practical. Only giving 4 stars because the instructions could be clearer.' },
    { rating: 5, comment: 'Best purchase I have made this year. The quality is immediately apparent and it works flawlessly. Worth every penny!' },
    { rating: 3, comment: 'Product works as expected but the quality is average. Not bad, not great. Would consider other options at this price point.' },
    { rating: 5, comment: 'Incredible value for money. The craftsmanship is top-tier and the product exceeds expectations. Will definitely buy from this seller again.' },
    { rating: 4, comment: 'Really impressed with the quality and design. The only minor issue is the color is slightly different from the photos. Otherwise perfect.' },
    { rating: 5, comment: 'This is a premium product that delivers on its promises. The materials are high-quality and the design is elegant. Highly satisfied!' },
    { rating: 2, comment: 'Disappointed with the quality. The product feels cheap and does not match the description. Requested a refund.' },
    { rating: 4, comment: 'Good product for the price. It does what it says and does it well. The packaging was excellent and delivery was prompt.' },
    { rating: 5, comment: 'Outstanding! The seller clearly cares about quality. Every detail is perfect from the packaging to the product itself. A+ experience.' },
  ];

  let created = 0;
  for (let i = 0; i < Math.min(reviewTemplates.length, productIds.length); i++) {
    const buyerId = buyerIds[i % buyerIds.length];
    const productId = productIds[i];
    const review = reviewTemplates[i];

    // Check if reviews table exists
    const { error } = await supabase.from('reviews').insert({
      product_id: productId,
      user_id: buyerId,
      rating: review.rating,
      comment: review.comment,
      created_at: new Date(Date.now() - (reviewTemplates.length - i) * 86400000).toISOString(),
    });

    if (!error) {
      created++;
    }
  }

  console.log(`  ✓ Created ${created} reviews`);
}

async function createConversations(accountIds: Record<string, string>) {
  console.log('\n💬 Creating conversations and messages...');

  const buyerIds = [accountIds.buyer, accountIds.buyer2].filter(Boolean);
  const sellerIds = [accountIds.seller1, accountIds.seller2, accountIds.seller3].filter(Boolean);

  if (buyerIds.length === 0 || sellerIds.length === 0) return;

  const conversations = [
    { buyer: buyerIds[0], seller: sellerIds[0], messages: [
      { sender: 'buyer', content: 'Hi, I am interested in the Pro Mechanical Keyboard. Is it available in Cherry MX Brown switches?' },
      { sender: 'seller', content: 'Yes! We have Cherry MX Brown, Blue, and Red switches available. The Brown switches are great for typing and gaming. Would you like to place an order?' },
      { sender: 'buyer', content: 'Great, I will take one in Brown. Do you offer any warranty?' },
      { sender: 'seller', content: 'Absolutely! All our keyboards come with a 2-year manufacturer warranty. We also offer a 30-day return policy if you are not satisfied.' },
    ]},
    { buyer: buyerIds[0], seller: sellerIds[1], messages: [
      { sender: 'buyer', content: 'Hello! I love the Bamboo Cutlery Set. Is the carrying pouch machine washable?' },
      { sender: 'seller', content: 'Hi there! Yes, the organic cotton pouch is machine washable on a gentle cycle. We recommend air drying to maintain the fabric quality.' },
    ]},
    { buyer: buyerIds[buyerIds.length > 1 ? 1 : 0], seller: sellerIds[2], messages: [
      { sender: 'buyer', content: 'Hi, I am looking at the Full-Grain Leather Messenger Bag. Can you tell me more about the leather quality?' },
      { sender: 'seller', content: 'Of course! We use full-grain vegetable-tanned leather from Italian tanneries. It develops a beautiful patina over time. Each bag is handcrafted by our artisans in Florence.' },
      { sender: 'buyer', content: 'That sounds amazing! Does it come in other colors?' },
      { sender: 'seller', content: 'Yes, we offer it in Cognac (shown), Dark Brown, and Black. All colors develop their own unique patina character over time.' },
    ]},
  ];

  let created = 0;
  for (const conv of conversations) {
    // Try to create conversation (may not exist as table)
    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert({
        buyer_id: conv.buyer,
        seller_id: conv.seller,
      })
      .select('id')
      .single();

    if (convError || !convData) {
      // Table might not exist, skip
      continue;
    }

    for (const msg of conv.messages) {
      await supabase.from('messages').insert({
        conversation_id: convData.id,
        sender_id: msg.sender === 'buyer' ? conv.buyer : conv.seller,
        content: msg.content,
        created_at: new Date(Date.now() - Math.random() * 604800000).toISOString(),
      });
    }
    created++;
  }

  console.log(`  ✓ Created ${created} conversations with messages`);
}

async function createAuditLogs(accountIds: Record<string, string>) {
  console.log('\n📊 Creating audit logs...');

  const allIds = Object.values(accountIds);
  const eventTypes = [
    'user.login', 'user.signup', 'product.created', 'product.updated',
    'order.created', 'order.fulfilled', 'payment.captured', 'payment.refunded',
    'refund.requested', 'refund.approved', 'admin.action', 'security.event',
  ];
  const severities = ['INFO', 'INFO', 'INFO', 'WARN', 'INFO', 'CRITICAL'];

  const logs = [];
  for (let i = 0; i < 50; i++) {
    logs.push({
      trace_id: `trace_audit_${Date.now()}_${i}`,
      event_type: eventTypes[i % eventTypes.length],
      severity: severities[i % severities.length],
      payload: {
        user_id: allIds[i % allIds.length] || 'unknown',
        action: eventTypes[i % eventTypes.length],
        timestamp: new Date(Date.now() - i * 3600000).toISOString(),
        details: `Demo audit event #${i + 1}`,
      },
    });
  }

  const { error } = await supabase.from('audit_logs').insert(logs);
  if (!error) {
    console.log(`  ✓ Created ${logs.length} audit log entries`);
  } else {
    console.log(`  ⚠ Audit log creation: ${error.message}`);
  }
}

async function createPaymentSessions(accountIds: Record<string, string>) {
  console.log('\n💳 Creating payment sessions...');

  const buyerIds = [accountIds.buyer, accountIds.buyer2].filter(Boolean);
  if (buyerIds.length === 0) return;

  const sessions = [];
  for (let i = 0; i < 10; i++) {
    const buyerId = buyerIds[i % buyerIds.length];
    sessions.push({
      user_id: buyerId,
      items: [{ product_id: `demo_product_${i}`, quantity: 1, price_cents: (Math.floor(Math.random() * 200) + 10) * 100 }],
      amount_total_cents: (Math.floor(Math.random() * 200) + 10) * 100,
      status: i < 6 ? 'completed' : i < 8 ? 'expired' : 'pending',
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
  }

  const { error } = await supabase.from('payment_sessions').insert(sessions);
  if (!error) {
    console.log(`  ✓ Created ${sessions.length} payment sessions`);
  } else {
    console.log(`  ⚠ Payment session creation: ${error.message}`);
  }
}

// ============================================================
// MAIN SEED FUNCTION
// ============================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║          VendorTrack — Production Demo Seed               ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`\nStarted at: ${new Date().toISOString()}`);

  const startTime = performance.now();

  try {
    // Step 1: Create demo accounts
    const accountIds = await createDemoAccounts();

    // Step 2: Create products
    const productIds = await createProducts(accountIds);

    // Step 3: Create orders
    await createOrders(accountIds, productIds);

    // Step 4: Create reviews
    await createReviews(accountIds, productIds);

    // Step 5: Create conversations
    await createConversations(accountIds);

    // Step 6: Create audit logs
    await createAuditLogs(accountIds);

    // Step 7: Create payment sessions
    await createPaymentSessions(accountIds);

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                  Seed Complete!                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\nCompleted in ${elapsed}s`);
    console.log('\n📋 Demo Accounts:');
    console.log('  ┌──────────────────────────────────────────────────────────┐');
    console.log('  │ Admin:  admin@vendortrack.demo  / DemoAdmin2024!        │');
    console.log('  │ Seller: seller@vendortrack.demo / DemoSeller2024!       │');
    console.log('  │ Seller: eco@vendortrack.demo    / DemoEco2024!          │');
    console.log('  │ Seller: luxe@vendortrack.demo   / DemoLuxe2024!         │');
    console.log('  │ Buyer:  buyer@vendortrack.demo  / DemoBuyer2024!        │');
    console.log('  │ Buyer:  buyer2@vendortrack.demo / DemoBuyer22024!       │');
    console.log('  └──────────────────────────────────────────────────────────┘');
    console.log('\n💡 Next steps:');
    console.log('  1. Run: npm run dev');
    console.log('  2. Open: http://localhost:9002');
    console.log('  3. Login with any demo account above');
    console.log('  4. Explore the full marketplace workflow');

  } catch (err) {
    console.error('\n❌ Seed failed:', err);
    process.exit(1);
  }
}

main();
