# VendorTrack — Live Demonstration Guide

> Complete walkthrough for demonstrating VendorTrack to buyers, investors, and technical evaluators.

---

## Quick Start

```bash
# 1. Clone and configure
git clone <repository-url>
cd vendortrack
cp .env.example .env.local
# Edit .env.local with your Supabase + Stripe credentials

# 2. Install and seed
npm install
npm run seed:demo

# 3. Launch
npm run dev
# Open http://localhost:9002
```

---

## Demo Accounts

| Role | Email | Password | Dashboard |
|------|-------|----------|-----------|
| **Admin** | admin@vendortrack.demo | DemoAdmin2024! | /admin-dashboard |
| **Seller 1** | seller@vendortrack.demo | DemoSeller2024! | /seller-dashboard |
| **Seller 2** | eco@vendortrack.demo | DemoEco2024! | /seller-dashboard |
| **Seller 3** | luxe@vendortrack.demo | DemoLuxe2024! | /seller-dashboard |
| **Buyer 1** | buyer@vendortrack.demo | DemoBuyer2024! | /buyer-orders |
| **Buyer 2** | buyer2@vendortrack.demo | DemoBuyer22024! | /buyer-orders |

---

## Demo Flow 1: Buyer Journey

**Duration:** ~5 minutes  
**Account:** buyer@vendortrack.demo

### Step 1: Browse the Marketplace
1. Log in as the buyer
2. Navigate to **Active Catalog** in the sidebar
3. Observe the product grid with 24 products across 6 categories
4. Use the search bar to search for "keyboard"
5. Filter by category: "Electronics"
6. Click on the **Pro Mechanical Keyboard** product card

### Step 2: View Product Details
1. On the product detail page, observe:
   - Product image and description
   - Price in dollars (stored as integer cents internally)
   - Seller information and store name
   - Stock availability
2. Click **Add to Cart**

### Step 3: Manage Cart
1. Navigate to **Transactional Cart** in the sidebar
2. Observe the cart item with quantity controls
3. Adjust quantity to 2
4. Click **Proceed to Checkout**

### Step 4: Checkout Process
1. On the checkout page, review the order summary
2. Observe the Stripe payment element loading
3. Enter test card: `4242 4242 4242 4242` (any future expiry, any CVC)
4. Complete the payment
5. Observe the order confirmation with trace ID

### Step 5: View Orders
1. Navigate to **My Purchase Ledger** in the sidebar
2. Observe the data table with all orders
3. Filter by status (pending, delivered, etc.)
4. Click on an order to view details
5. Request a refund for a delivered order

### Key Talking Points
- **Integer-precision pricing:** All values stored as cents (no floating-point drift)
- **Atomic transactions:** Order creation and inventory update happen in a single PostgreSQL transaction
- **Trace IDs:** Every operation has a traceable ID for forensic analysis
- **Stripe Connect:** Platform takes 10% commission automatically

---

## Demo Flow 2: Seller Journey

**Duration:** ~5 minutes  
**Account:** seller@vendortrack.demo

### Step 1: Store Overview
1. Log in as the seller
2. Observe the **Store Overview** dashboard:
   - Total Earnings from delivered orders
   - Active Orders requiring fulfillment
   - Fulfillment Rate percentage
   - Store Products count
3. Review the **Platform Governance** section:
   - Seller Verification status (approved)
   - Payment Method (Stripe Connected)
   - Marketplace Fee (10% per sale)

### Step 2: Manage Products
1. Navigate to **Inventory** in the sidebar
2. Observe the product data table with 8 products
3. Click **Add Product** to create a new listing
4. Fill in the product form:
   - Title: "Wireless Charging Pad"
   - Category: "Electronics"
   - Description: Use the **AI Copilot** button to generate a description
   - Price: $29.99
   - Stock: 100
5. Submit the product

### Step 3: Manage Orders
1. Navigate to **Transactions** in the sidebar
2. Observe the order data table
3. Find a pending order
4. Update the order status: Pending → Processing → Shipped → Delivered
5. Observe the order state transition

### Step 4: Seller Settings
1. Navigate to **Settings** in the sidebar
2. Observe the Stripe Connect integration status
3. Review store profile settings

### Key Talking Points
- **AI Copilot:** Genkit-powered product description generation
- **Onboarding Progress:** Guided setup for new sellers
- **Real-time Earnings:** Revenue calculated from delivered orders
- **Commission Transparency:** 10% fee clearly displayed

---

## Demo Flow 3: Administrator Workflow

**Duration:** ~5 minutes  
**Account:** admin@vendortrack.demo

### Step 1: Mission Control
1. Log in as the admin
2. Observe the **Mission Control** dashboard:
   - Total GMV (Gross Merchandise Volume)
   - Platform Yield (10% commission)
   - Active Sellers count
   - Throughput (30-day orders)
   - Efficiency (Order/User Ratio)
3. Review the **Platform Revenue Chart**
4. Check the **Relational Integrity** panel:
   - Catalog Size (total products)
   - Total Accounts (total users)

### Step 2: Initialize Demo Data
1. If no data exists, click **Initialize System Data** button
2. Observe the seeding process completing
3. Click **Sync Ledger** to refresh statistics

### Step 3: User Management
1. Navigate to **Admin Dashboard → Users**
2. Observe the list of all registered users
3. Filter by role (buyer, seller, admin)
4. Toggle seller approval status
5. Observe the audit log entry

### Step 4: Order Management
1. Navigate to **Admin Dashboard → Orders**
2. Observe all orders across all sellers
3. Filter by status and date range
4. View order details including trace ID

### Step 5: Refund Management
1. Navigate to **Admin Dashboard → Refunds**
2. Observe pending refund requests
3. Approve or reject a refund
4. Observe the Stripe refund being processed

### Step 6: System Health
1. Observe the **System Health Widget** in the dashboard
2. Click to view detailed health status
3. Check the `/api/health` endpoint directly

### Key Talking Points
- **Full Platform Visibility:** Every transaction, user, and metric
- **Forensic Audit Trail:** Every state change is logged with trace ID
- **Financial Integrity:** Integer-precision cents matching Stripe balances
- **Real-time Monitoring:** Health checks, performance metrics, and alerting

---

## Demo Flow 4: Refund Flow

**Duration:** ~3 minutes  
**Accounts:** Buyer + Admin

### Step 1: Buyer Requests Refund
1. Log in as the buyer
2. Navigate to **My Purchase Ledger**
3. Find a delivered order
4. Click **Request Refund**
5. Enter reason: "Item arrived damaged"
6. Submit the refund request

### Step 2: Admin Reviews Refund
1. Log in as the admin (or switch account)
2. Navigate to **Admin Dashboard → Refunds**
3. Find the pending refund request
4. Review the refund reason and order details
5. Approve the refund
6. Observe the Stripe refund being processed automatically

### Step 3: Buyer Observes Refund
1. Switch back to the buyer account
2. Check the order status — it should now show "Refunded"
3. The refund will appear in Stripe within 5-10 business days

### Key Talking Points
- **Self-healing Webhooks:** If fulfillment fails, automatic refunds are triggered
- **Circuit Breaker:** Stripe API calls are protected by circuit breaker pattern
- **Idempotent Processing:** Duplicate webhook events are safely handled
- **Reconciliation:** Daily cron job ensures payment states match Stripe

---

## Demo Flow 5: Search

**Duration:** ~2 minutes  
**Account:** Any

### Step 1: Basic Search
1. Use the search bar to search for "leather"
2. Observe results from LuxeLeather Co. products
3. Review search result ranking

### Step 2: Category Filter
1. Filter by "Sustainable Living"
2. Observe only EcoWare Essentials products
3. Clear the filter

### Step 3: Search Suggestions
1. Type "key" in the search bar
2. Observe search suggestions appearing
3. Click on a suggestion

### Key Talking Points
- **Rate-Limited Search:** 30 requests/minute per user
- **SQL Injection Prevention:** All queries sanitized before execution
- **Cache-Aware Results:** Search results cached for 1 minute
- **Suggestion Engine:** Type-ahead suggestions for popular queries

---

## Demo Flow 6: Monitoring Dashboard

**Duration:** ~3 minutes  
**Account:** admin@vendortrack.demo

### Step 1: Health Check
1. Open `/api/health` in a new tab
2. Observe the health response:
   ```json
   {
     "status": "healthy",
     "version": "0.1.0",
     "checks": {
       "database": { "status": "healthy", "latencyMs": 45 },
       "redis": { "status": "degraded", "details": "Using LRU fallback" },
       "memory": { "status": "healthy", "details": "Heap: 128MB / 256MB (50%)" },
       "env": { "status": "healthy" }
     }
   }
   ```

### Step 2: Performance Metrics
1. Open `/api/performance` (requires admin auth)
2. Observe Prometheus-format metrics or JSON response

### Step 3: Payment Health
1. Open `/api/payment-health` (requires admin auth)
2. Observe payment system health metrics

### Step 4: Cron Jobs
1. Check the Vercel cron job configuration in `vercel.json`
2. Three cron jobs are configured:
   - Health check: Every 5 minutes
   - Cache warming: Every 6 hours
   - Reconciliation: Daily at 2 AM

### Key Talking Points
- **Prometheus Metrics:** 16 metrics exposed for monitoring
- **Grafana Dashboards:** Pre-configured dashboards for visualization
- **Alerting:** 10 Prometheus alert rules for critical conditions
- **Sentry Integration:** Error tracking with PII filtering
- **OpenTelemetry:** Distributed tracing across services

---

## Demo Flow 7: Chat

**Duration:** ~2 minutes  
**Account:** buyer@vendortrack.demo

### Step 1: Access Order Chat
1. Navigate to **My Purchase Ledger**
2. Click on an order with a seller
3. Open the chat interface
4. Send a message to the seller
5. Observe the real-time message delivery

### Key Talking Points
- **Order-Based Chat:** Conversations are tied to specific orders
- **Involvement Verification:** Only buyers and sellers involved in an order can chat
- **Real-time Updates:** Unread message counts update in real-time

---

## Security Demonstration

### Step 1: Security Headers
```bash
curl -I http://localhost:9002/
# Observe: X-Frame-Options, Content-Security-Policy, Strict-Transport-Security, etc.
```

### Step 2: CSRF Protection
```bash
curl -X POST http://localhost:9002/api/checkout/create-session \
  -H "Content-Type: application/json" \
  -d '{"items":[]}'
# Observe: 403 CSRF protection blocked
```

### Step 3: Rate Limiting
```bash
# Rapid-fire requests to trigger rate limiting
for i in $(seq 1 35); do
  curl -s http://localhost:9002/api/products/search?q=test | head -1
done
# Observe: 429 Too Many Requests
```

### Step 4: RBAC Enforcement
1. Log in as a buyer
2. Try to navigate to `/admin-dashboard` — observe redirect
3. Try to navigate to `/seller-dashboard` — observe redirect
4. All API routes enforce the same RBAC

---

## Verification Commands

```bash
# Run all verification
npm run verify

# Run deployment verification
npm run verify:deployment

# Run acceptance tests
npm run verify:acceptance

# Run production verification
npm run verify

# Check health endpoint
curl http://localhost:9002/api/health

# Reset demo data
npm run seed:reset

# Re-seed demo data
npm run seed:demo
```
