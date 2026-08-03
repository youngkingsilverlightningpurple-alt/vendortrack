# VendorTrack Administrator Guide

**Version:** 1.0
**Last Updated:** 2025-01-15
**Classification:** Internal -- Platform Administration
**Audience:** Platform Administrators, Super Administrators

---

## Table of Contents

1. [Admin Overview](#1-admin-overview)
2. [User Management](#2-user-management)
3. [Vendor Management](#3-vendor-management)
4. [Product Management](#4-product-management)
5. [Order Management](#5-order-management)
6. [Refund Management](#6-refund-management)
7. [Feature Flags](#7-feature-flags)
8. [Monitoring](#8-monitoring)
9. [Audit Logs](#9-audit-logs)
10. [Backups](#10-backups)
11. [Incident Response](#11-incident-response)
12. [Admin Dashboard Pages](#12-admin-dashboard-pages)

---

## 1. Admin Overview

### What Administrators Can Do

Platform administrators are responsible for the day-to-day operation, health, and integrity of the VendorTrack marketplace. The admin role grants access to a dedicated control panel (the Admin Dashboard) that provides oversight of every aspect of the platform: users, vendors, products, orders, refunds, feature flags, and system health. Administrators can approve or reject seller applications, toggle admin status on user accounts, delete products that violate marketplace policies, process refund requests, and monitor system performance in real time. The admin dashboard is the central hub from which all platform governance flows.

Administrators also have access to specialized monitoring endpoints that expose payment health metrics, performance data, and system status. These endpoints are protected by the same RBAC system that governs the rest of the platform, ensuring that only authorized personnel can view sensitive operational data. Additionally, administrators can trigger system-level operations such as database backups, feature flag toggles, and kill switches for emergency feature disabling.

### Accessing the Admin Dashboard

The admin dashboard is located at `/admin-dashboard`. Access is restricted to users with the `admin` or `super_admin` role. When a non-admin user attempts to access the dashboard, they will see an "Access Denied" screen with a message instructing them to request access via the database console. The authorization check is performed both client-side (for UI rendering) and server-side (for data access), ensuring defense-in-depth.

To access the admin dashboard, a user must:

1. Be authenticated via Supabase Auth
2. Have `is_admin = true` in their `profiles` row
3. Have the resolved role of `admin` or `super_admin` (via the `resolveRole` function)

### Role Hierarchy

VendorTrack implements a strict role hierarchy with five levels. Higher-index roles inherit all permissions from lower roles. The hierarchy is enforced by the centralized RBAC module (`src/lib/rbac.ts`), which is the single source of truth for all authorization decisions.

| Role | Level | Description |
|------|-------|-------------|
| `guest` | 0 | Unauthenticated visitors. Can only browse products. |
| `buyer` | 1 | Registered users who can purchase, request refunds, and use chat. |
| `seller` | 2 | Vendors who can list products, manage inventory, and fulfill orders. |
| `admin` | 3 | Platform administrators with broad management permissions. |
| `super_admin` | 4 | Full platform access including all admin permissions plus user deletion. |

The `resolveRole` function determines a user's canonical RBAC role based on their database profile:

```typescript
// From src/lib/rbac.ts
export function resolveRole(dbRole: string, isAdmin: boolean): Role {
  if (isAdmin) return ROLES.SUPER_ADMIN;
  if (dbRole === 'seller') return ROLES.SELLER;
  if (dbRole === 'buyer') return ROLES.BUYER;
  return ROLES.GUEST;
}
```

The key distinction between `admin` and `super_admin` is that `super_admin` is assigned when `is_admin = true` on the profile. The `admin` role is a separate database-level role. Both have nearly identical permissions, but `super_admin` has the `USERS_DELETE` permission which is required for the `purgeAllUsers` action.

### Permission Matrix

The following table summarizes the permissions available to each role. Every admin action requires a specific permission, and all checks are enforced server-side.

| Permission | super_admin | admin | seller | buyer | guest |
|-----------|:-----------:|:-----:|:------:|:-----:|:-----:|
| `products.read` | Yes | Yes | Yes | Yes | Yes |
| `products.write` | Yes | Yes | Yes | No | No |
| `products.delete` | Yes | Yes | No | No | No |
| `orders.read` | Yes | Yes | Yes | Yes | No |
| `orders.manage` | Yes | Yes | Yes | No | No |
| `orders.refund` | Yes | No | No | Yes | No |
| `users.read` | Yes | Yes | No | No | No |
| `users.manage` | Yes | Yes | No | No | No |
| `users.delete` | Yes | No | No | No | No |
| `payments.create` | Yes | No | Yes | Yes | No |
| `payments.manage` | Yes | Yes | No | No | No |
| `analytics.read` | Yes | Yes | Yes | No | No |
| `inventory.manage` | Yes | Yes | Yes | No | No |
| `ai.use` | Yes | Yes | Yes | Yes | No |
| `refunds.manage` | Yes | Yes | No | No | No |
| `cart.manage` | Yes | No | Yes | Yes | No |
| `chat.read` | Yes | Yes | Yes | Yes | No |
| `chat.write` | Yes | Yes | Yes | Yes | No |
| `platform.manage` | Yes | Yes | No | No | No |

---

## 2. User Management

### Overview

User management is one of the most critical responsibilities of a platform administrator. The user management page at `/admin-dashboard/users` provides a comprehensive view of all registered accounts on the platform. Administrators can view user profiles, toggle admin status, manage seller applications, and purge all users (for staging/demo environments). All user management actions are gated by the `USERS_MANAGE` permission and require `adminOnly: true`, meaning only users with the `admin` or `super_admin` role can perform these operations.

The user list is paginated with a page size of 20 records. Users are displayed in reverse chronological order (newest first) so that administrators can quickly see recent registrations. Each user row displays the user's full name, email, role, seller status, Stripe connection status, and registration date. A dropdown menu on each row provides access to admin actions for that user.

### Viewing Users

To view the user list:

1. Navigate to `/admin-dashboard/users`
2. The page loads the first 20 users automatically
3. Click "Load More Users" to fetch the next page
4. Click "Refresh List" to reload the current data

Each user row displays the following information:

| Column | Description |
|--------|-------------|
| User Details | Full name, email, and admin badge (if applicable) |
| Account Type | The user's role (`buyer` or `seller`) |
| Seller Status | For sellers: `Approved`, `Rejected`, or `Pending` |
| Stripe | For sellers: `Connected` or `Missing` Stripe Connect status |
| Joined | Registration date |
| Actions | Dropdown menu with management options |

### Toggling Admin Status

Administrators can grant or revoke admin privileges for any user. This is a sensitive operation that changes the user's effective role across the entire platform. When a user is made an admin, their resolved role becomes `super_admin` (since `is_admin = true` takes precedence over the database role). When admin status is revoked, the user reverts to their database role (`buyer` or `seller`).

**Server Action:** `toggleAdminStatus(userId, makeAdmin)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | `string` | The UUID of the target user |
| `makeAdmin` | `boolean` | `true` to grant admin, `false` to revoke |

**Required Permission:** `USERS_MANAGE` with `adminOnly: true`

**How to toggle admin status:**

1. Navigate to `/admin-dashboard/users`
2. Find the target user in the list
3. Click the "Manage" dropdown button
4. Click "Make Admin" or "Revoke Admin" as appropriate
5. The user list updates immediately to reflect the change

**Important considerations:**

- Granting admin status to a user immediately gives them access to the admin dashboard and all admin-level operations
- Revoking admin status from yourself is possible but will lock you out of the admin dashboard
- All admin status changes are logged in the audit trail
- The server action validates the current user's permissions before making the change

### Managing Seller Applications

When a user registers as a seller, their `seller_status` is set to `pending`. Administrators must review and approve or reject these applications before the seller can access the seller dashboard and list products. This is a critical quality gate that ensures only legitimate vendors can operate on the marketplace.

**Server Action:** `updateSellerStatus(userId, status)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `userId` | `string` | The UUID of the seller |
| `status` | `'approved' \| 'rejected' \| 'pending'` | The new seller status |

**Required Permission:** `USERS_MANAGE` with `adminOnly: true`

**How to manage seller applications:**

1. Navigate to `/admin-dashboard/users`
2. Filter for users with the `seller` role and `Pending` status
3. Click the "Manage" dropdown button on the seller's row
4. Under "Vendor Review", click "Approve Vendor" or "Reject Vendor"
5. The seller's status badge updates immediately

**Seller status flow:**

```
pending --> approved
    |
    +-------> rejected
```

- A seller with `pending` status cannot access `/seller-dashboard`
- A seller with `approved` status can access `/seller-dashboard` and list products
- A seller with `rejected` status cannot access `/seller-dashboard`
- An admin can change a seller's status back to `pending` at any time

### Deleting Users

The `purgeAllUsers` action is a destructive operation that removes all user accounts except the current admin's account. This is intended for use in staging and demo environments only and should never be used in production.

**Server Action:** `purgeAllUsers(currentUserId)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `currentUserId` | `string` | The UUID of the admin performing the purge (for self-preservation) |

**Required Permission:** `USERS_DELETE` with `adminOnly: true`

**Safety measures:**

- The action requires a confirmation dialog before execution
- The admin's own account is preserved (verified via `currentUserId`)
- The action is logged as a `CRITICAL` severity audit event
- The function validates that the authenticated user's identity matches the `currentUserId` parameter

**How to purge all users:**

1. Navigate to `/admin-dashboard/users`
2. Click the red "Purge All Users" button
3. A confirmation dialog appears: "CRITICAL ACTION: Are you sure you want to delete ALL registered users?"
4. Confirm the action
5. The user list refreshes to show only the admin's account

### Viewing User Profiles

Each user's profile data is stored in the `profiles` table in Supabase. The admin dashboard displays key profile fields inline. For detailed profile inspection, administrators can query the database directly:

```sql
-- View a specific user's profile
SELECT * FROM profiles WHERE id = 'user-uuid';

-- View all pending seller applications
SELECT id, full_name, email, seller_status, created_at
FROM profiles
WHERE role = 'seller' AND seller_status = 'pending'
ORDER BY created_at DESC;

-- View all admin users
SELECT id, full_name, email, is_admin
FROM profiles
WHERE is_admin = true;
```

---

## 3. Vendor Management

### Approving Sellers

Seller approval is the primary quality gate for the VendorTrack marketplace. When a user registers as a seller, they are placed in `pending` status and cannot access the seller dashboard or list products until an administrator reviews and approves their application. The approval process ensures that only legitimate, verified vendors can operate on the platform, protecting buyers and maintaining marketplace integrity.

To approve a seller, navigate to `/admin-dashboard/users`, locate the seller with `Pending` status, and click "Approve Vendor" from the actions dropdown. The seller's status will immediately update to `Approved`, and they will gain access to the seller dashboard at `/seller-dashboard`. The seller will also receive access to the product management, order management, and settings pages within the seller dashboard.

When reviewing a seller application, consider the following:

- Verify the seller's business name and contact information
- Check for any red flags in the registration data (e.g., duplicate accounts, suspicious email addresses)
- If the seller has connected their Stripe account, verify the Stripe Connect status
- Review any additional information the seller may have provided during registration

### Rejecting Sellers

If a seller application does not meet the platform's standards, administrators can reject the application. Rejected sellers cannot access the seller dashboard or list products. The seller's status badge will change to `Rejected` (displayed in red) on the user management page.

To reject a seller, navigate to `/admin-dashboard/users`, locate the seller, and click "Reject Vendor" from the actions dropdown. The rejection is immediate and does not require a reason to be entered through the UI, though the action is recorded in the audit log.

If circumstances change, an administrator can re-approve a previously rejected seller by changing their status back to `approved`. Similarly, a seller can be moved back to `pending` status for re-evaluation.

### Managing Seller Onboarding

The seller onboarding process is tracked via the `SellerOnboardingProgress` component, which displays a step-by-step progress indicator on the seller dashboard. The onboarding progress helps new sellers complete all necessary setup steps before they can fully operate on the marketplace.

The onboarding steps typically include:

1. **Store Profile Setup** -- Configure store name, description, and branding
2. **Stripe Connect** -- Link a Stripe account for receiving payments
3. **First Product** -- List at least one product for sale
4. **Shipping Configuration** -- Set up shipping options and policies

The onboarding progress card is displayed on the seller dashboard and shows the percentage of completion. Each step includes a link to the relevant settings page where the seller can complete the step. Once all steps are complete, the progress card is automatically hidden.

### Monitoring Seller Performance

Administrators can monitor seller performance through the admin dashboard's overview page, which displays key metrics including the number of active sellers. For more detailed seller performance analysis, administrators can query the database directly:

```sql
-- Seller order volume
SELECT p.store_name, COUNT(o.id) as order_count, SUM(o.amount_total_cents) as total_gmv
FROM profiles p
LEFT JOIN orders o ON o.seller_id = p.id
WHERE p.role = 'seller' AND p.seller_status = 'approved'
GROUP BY p.id, p.store_name
ORDER BY order_count DESC;

-- Seller refund rate
SELECT p.store_name,
  COUNT(o.id) as total_orders,
  SUM(CASE WHEN o.refund_status = 'approved' THEN 1 ELSE 0 END) as refunded_orders,
  ROUND(SUM(CASE WHEN o.refund_status = 'approved' THEN 1 ELSE 0 END)::numeric / NULLIF(COUNT(o.id), 0) * 100, 2) as refund_rate_pct
FROM profiles p
LEFT JOIN orders o ON o.seller_id = p.id
WHERE p.role = 'seller'
GROUP BY p.id, p.store_name
ORDER BY refund_rate_pct DESC;
```

### Seller Dashboard Access

The seller dashboard is located at `/seller-dashboard` and is protected by the RBAC system. The route protection rules require the `seller` role (or higher) and the `analytics.read` permission. The key access control rules are:

| Route | Required Role | Required Permission |
|-------|--------------|-------------------|
| `/seller-dashboard` | `seller` | `analytics.read` |
| `/seller-dashboard/products` | `seller` | `products.write` |
| `/seller-dashboard/orders` | `seller` | `orders.manage` |
| `/seller-dashboard/settings` | `seller` | `inventory.manage` |

A seller must have `seller_status = 'approved'` in their profile to access the seller dashboard. Sellers with `pending` or `rejected` status are blocked from accessing these routes. Administrators can access the seller dashboard for debugging purposes since the `admin` and `super_admin` roles are above `seller` in the hierarchy.

---

## 4. Product Management

### Viewing All Products

The product management page at `/admin-dashboard/products` provides a comprehensive view of all products listed on the marketplace. This is the admin's primary tool for monitoring and moderating the product catalog. Products are displayed in reverse chronological order (newest first) with a page size of 20 records.

Each product row displays the following information:

| Column | Description |
|--------|-------------|
| Product | Product image thumbnail, title, and truncated ID |
| Vendor | Store name with a link to the vendor's store page |
| Price | Product price in USD |
| Status | Product status (`active` or other) |
| Actions | Delete button |

The product list includes the vendor's store name (resolved via a join on the `profiles` table using the `seller_id` foreign key). Clicking the vendor name navigates to the vendor's public store page at `/store/[id]`.

### Deleting Products

Administrators can remove products from the marketplace that violate policies, are fraudulent, or need to be taken down for any reason. Product deletion is a soft delete operation -- the product's `deleted_at` field is set to the current timestamp, which removes it from all active listings while preserving the database record for audit purposes.

**Server Action:** `adminDeleteProduct(productId)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `productId` | `string` | The UUID of the product to delete |

**Required Permission:** `PRODUCTS_DELETE` with `adminOnly: true`

**How to delete a product:**

1. Navigate to `/admin-dashboard/products`
2. Locate the product in the list
3. Click the trash icon button in the "Actions" column
4. A confirmation dialog appears: "ADMIN ACTION: Are you sure you want to soft-delete this listing?"
5. Confirm the action
6. The product is immediately removed from the list view

**Important notes:**

- Product deletion is a soft delete (`deleted_at` is set, not a hard SQL DELETE)
- Soft-deleted products are excluded from all queries via the `is('deleted_at', null)` filter
- The product record remains in the database for audit and reconciliation purposes
- Deleting a product does not affect existing orders for that product
- The deletion action is logged in the audit trail

### Managing Product Categories

Product categories are managed through the database directly. Categories are stored in the `products` table's `category` field. To add or modify categories:

```sql
-- View all product categories and their counts
SELECT category, COUNT(*) as product_count
FROM products
WHERE deleted_at IS NULL
GROUP BY category
ORDER BY product_count DESC;

-- Update a product's category
UPDATE products SET category = 'new-category' WHERE id = 'product-uuid';
```

### Monitoring Product Listings

Administrators should regularly monitor the product catalog for:

- **Policy violations** -- Products that violate marketplace terms of service
- **Duplicate listings** -- Sellers listing the same product multiple times
- **Pricing anomalies** -- Products priced significantly above or below market value
- **Inappropriate content** -- Product descriptions or images that violate content policies
- **Inactive products** -- Products with status other than `active` that may need attention

```sql
-- Find products with no orders (potential stale listings)
SELECT p.id, p.title, p.created_at, pr.store_name
FROM products p
JOIN profiles pr ON p.seller_id = pr.id
LEFT JOIN orders o ON o.product_id = p.id
WHERE o.id IS NULL AND p.deleted_at IS NULL
ORDER BY p.created_at ASC
LIMIT 20;

-- Find products priced above $10,000
SELECT id, title, price_cents, (price_cents / 100.0) as price_usd
FROM products
WHERE deleted_at IS NULL AND price_cents > 1000000
ORDER BY price_cents DESC;
```

---

## 5. Order Management

### Viewing All Orders

The order management page at `/admin-dashboard/orders` provides a real-time view of all orders across the platform. This is the admin's primary tool for monitoring transaction activity and financial health. Orders are displayed in reverse chronological order (newest first) with a page size of 20 records.

Each order row displays the following information:

| Column | Description |
|--------|-------------|
| Order ID | Truncated order UUID (first 8 characters) |
| Product | Product name and quantity |
| Total | Order total amount in USD |
| Fee (10%) | Platform commission amount in USD |
| Status | Order status badge |
| Date | Order creation date |

The order list provides visibility into the full transaction lifecycle, from initial placement through fulfillment. The platform commission is displayed prominently, allowing administrators to track revenue generation in real time.

### Monitoring Order Status

Order statuses follow a defined lifecycle that reflects the progression from purchase to delivery. Administrators should monitor the distribution of order statuses to identify potential issues:

| Status | Description | Admin Action Required |
|--------|-------------|----------------------|
| `pending` | Order placed but not yet processed | Monitor for stale pending orders |
| `processing` | Order is being prepared by the seller | No action unless stalled |
| `shipped` | Order has been shipped with tracking | Monitor for delivery confirmation |
| `delivered` | Order has been delivered | No action |
| `cancelled` | Order has been cancelled | Review cancellation reason |
| `refunded` | Order has been fully refunded | Cross-reference with refund management |

```sql
-- Order status distribution
SELECT status, COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- Orders stuck in pending for more than 48 hours
SELECT id, product_name, status, created_at
FROM orders
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '48 hours'
ORDER BY created_at ASC;

-- Orders with no tracking number (shipped but untracked)
SELECT id, product_name, status, tracking_number
FROM orders
WHERE status = 'shipped' AND (tracking_number IS NULL OR tracking_number = '')
ORDER BY created_at DESC;
```

### Order Fulfillment Tracking

Order fulfillment is primarily managed by sellers through the seller dashboard. Sellers can update order status and add tracking information (tracking number and carrier) via the `updateOrderStatus` server action. Administrators can monitor fulfillment progress and identify orders that require attention.

The fulfillment tracking fields available on each order include:

- `status` -- Current order status
- `tracking_number` -- Shipping tracking number (if provided)
- `carrier` -- Shipping carrier name (if provided)

For orders that appear stalled or have no tracking information, administrators should contact the seller directly or review the seller's performance metrics.

---

## 6. Refund Management

### Processing Refund Requests

The refund management page at `/admin-dashboard/refunds` displays all orders with `refund_status = 'requested'`. This is the admin's primary tool for reviewing and resolving buyer-initiated refund claims. The page displays pending refund requests in a table format with buyer-provided reasons for each claim.

Each refund request row displays:

| Column | Description |
|--------|-------------|
| Order Details | Order ID, product name, and customer name |
| Amount | Refund amount in USD |
| Buyer Reason | The buyer's stated reason for the refund request |
| Date Requested | Date the refund was requested |
| Actions | "Reject" and "Approve & Refund" buttons |

**Important:** Approving a refund triggers a Stripe Refund API call automatically. The system will not record a refund in the database unless Stripe confirms the refund was processed. This is a critical financial integrity guarantee: no refund may exist in the database unless Stripe confirms it.

### Approving Refunds

When an administrator approves a refund, the system executes the following atomic workflow:

1. **Validate refund eligibility** -- The order must exist, must not already be refunded, and must have a valid Stripe payment intent
2. **Call Stripe Refund API** -- The refund is initiated via the Stripe API with retry logic (exponential backoff with jitter)
3. **Verify Stripe confirmation** -- The Stripe refund object is retrieved and its status is verified
4. **Update database** -- The order's `refund_status` is set to `approved` and the `status` is set to `refunded` via the `process_refund_atomic` RPC
5. **Create financial ledger entry** -- An immutable entry is created in the `financial_ledger` table recording the refund amount, Stripe refund ID, and commission reversal
6. **Create audit record** -- A `REFUND_APPROVED` event is logged with full details
7. **Queue notifications** -- Buyer and seller notifications are queued for delivery

**Server Action:** `processRefundDecision(orderId, decision)`

| Parameter | Type | Description |
|-----------|------|-------------|
| `orderId` | `string` | The UUID of the order |
| `decision` | `'approved' \| 'rejected'` | The refund decision |

**Required Permission:** `REFUNDS_MANAGE` with `adminOnly: true`

**How to approve a refund:**

1. Navigate to `/admin-dashboard/refunds`
2. Review the buyer's reason for the refund request
3. Click "Approve & Refund" on the order row
4. The system processes the refund via Stripe and updates the database
5. A toast notification confirms the refund with the Stripe refund ID and trace ID

### Rejecting Refunds

When an administrator rejects a refund, the system performs a simpler workflow:

1. **Update the order's `refund_status`** to `rejected` in the database
2. **Log a `REFUND_REJECTED` audit event** with the admin's user ID and reason

No Stripe API call is made for rejected refunds. The order remains in its current status and the buyer is not charged again.

**How to reject a refund:**

1. Navigate to `/admin-dashboard/refunds`
2. Review the buyer's reason for the refund request
3. Click "Reject" on the order row
4. The system updates the order status and logs the rejection
5. A toast notification confirms the rejection

### Refund Lifecycle

The refund status follows a defined lifecycle:

```
none --> requested --> approved
                    |
                    +-----> rejected
```

| Status | Description | Next State |
|--------|-------------|------------|
| `none` | No refund has been requested | `requested` |
| `requested` | Buyer has submitted a refund request | `approved` or `rejected` |
| `approved` | Admin has approved the refund and Stripe has processed it | Terminal |
| `rejected` | Admin has rejected the refund request | Can be changed back to `requested` |

**Critical rules:**

- An order with `refund_status = 'approved'` cannot be refunded again
- An order with no `payment_intent_id` cannot be refunded (no Stripe payment to reverse)
- Partial refunds are supported by specifying an amount less than the order total
- The commission is reversed at the standard 10% rate on refund
- All refund operations are fully auditable via the `financial_ledger` and `audit_logs` tables

---

## 7. Feature Flags

### Overview

VendorTrack implements a production-grade feature flag system that supports boolean flags, percentage rollouts (canary releases), user segment targeting, environment-specific overrides, and kill switches for emergency feature disabling. Feature flags enable administrators to control which features are active without redeploying the application, supporting safe rollouts, A/B testing, and rapid incident response.

Feature flags are evaluated in the following priority order:

1. **Environment variable override** -- `FEATURE_*` environment variables take highest precedence
2. **Environment check** -- Flags may be restricted to specific environments (development, staging, production)
3. **User segment targeting** -- Flags can target specific user IDs or roles
4. **Rollout percentage** -- Canary releases based on a deterministic hash of the user ID and flag key
5. **Default value** -- The baseline value when no override exists

### Feature Flag Registry

The following table lists all feature flags currently defined in the system. Each flag has a key, description, default value, and optional rollout percentage.

| Flag Key | Description | Default | Rollout % | Environments | Kill Switch |
|----------|-------------|---------|-----------|-------------|-------------|
| `stripe_connect` | Enable Stripe Connect for multi-vendor payments | `true` | 100% | dev, staging, prod | No |
| `auto_refund_on_failure` | Automatically refund payments when order processing fails | `true` | 100% | dev, staging, prod | Yes |
| `payment_reconciliation` | Enable automatic payment reconciliation | `true` | 100% | prod | No |
| `ai_product_descriptions` | Enable AI-generated product descriptions | `true` | 100% | dev, staging, prod | No |
| `ai_chat_assistant` | Enable AI-powered chat assistant | `false` | 10% | dev, staging | No |
| `full_text_search` | Enable PostgreSQL full-text search | `true` | 100% | dev, staging, prod | No |
| `search_suggestions` | Enable search autocomplete suggestions | `true` | 50% | dev, staging, prod | No |
| `redis_caching` | Use Redis for distributed caching (vs in-memory) | `true` | 100% | prod | No |
| `sentry_error_tracking` | Enable Sentry error tracking | `true` | 100% | staging, prod | No |
| `opentelemetry_tracing` | Enable OpenTelemetry distributed tracing | `false` | 10% | staging, prod | No |
| `new_dashboard` | Enable redesigned seller dashboard | `false` | 20% | dev, staging | No |
| `dark_mode` | Enable dark mode theme | `false` | 100% | dev | No |
| `v2_checkout_flow` | Enable new checkout flow (v2) | `false` | 5% | staging | No |

### Viewing Feature Flags

Feature flags are stored in the `feature_flags` table in Supabase. To view the current state of all feature flags:

```sql
-- View all feature flags
SELECT key, description, default_value, rollout_percentage, environments
FROM feature_flags
ORDER BY key;
```

Programmatically, the `getAllFeatureFlags` function returns all flags with their current enabled state:

```typescript
import { getAllFeatureFlags } from '@/lib/monitoring/feature-flags';

// Get all flags with current state for a specific user
const flags = getAllFeatureFlags({
  userId: 'user-uuid',
  userRole: 'seller',
  environment: 'production',
});
```

### Enabling and Disabling Features

Features can be enabled or disabled through three mechanisms:

#### Method 1: Database Override (Runtime)

Update the `feature_flags` table to change a flag's default value. This takes effect immediately without redeployment:

```sql
-- Enable AI chat assistant
UPDATE feature_flags SET default_value = true WHERE key = 'ai_chat_assistant';

-- Disable search suggestions
UPDATE feature_flags SET default_value = false WHERE key = 'search_suggestions';
```

#### Method 2: Environment Variable Override

Set the `FEATURE_*` environment variable to override the flag's value. This takes the highest precedence and overrides all other settings:

```bash
# Enable AI chat assistant via environment variable
FEATURE_AI_CHAT_ASSISTANT=true

# Disable Redis caching
FEATURE_REDIS_CACHING=false

# Enable OpenTelemetry tracing
FEATURE_OPENTELEMETRY_TRACING=true
```

The environment variable name is derived from the flag key by converting to uppercase and replacing hyphens with underscores, prefixed with `FEATURE_`. For example, the flag key `v2_checkout_flow` corresponds to the environment variable `FEATURE_V2_CHECKOUT_FLOW`.

#### Method 3: API/Programmatic Toggle

For runtime toggling without database access, use the `killSwitch` function for emergency disabling:

```typescript
import { killSwitch } from '@/lib/monitoring/feature-flags';

// Emergency disable of auto-refund (kill switch)
killSwitch('auto_refund_on_failure');
```

### Canary Rollouts

Canary rollouts allow features to be gradually enabled for a percentage of users. The rollout percentage is determined by a deterministic hash of the flag key and user ID, ensuring that the same user always sees the same feature state. This prevents flickering and provides a consistent user experience.

To configure a canary rollout:

```sql
-- Enable AI chat assistant for 25% of users
UPDATE feature_flags SET rollout_percentage = 25 WHERE key = 'ai_chat_assistant';

-- Increase to 50% after monitoring
UPDATE feature_flags SET rollout_percentage = 50 WHERE key = 'ai_chat_assistant';

-- Full rollout
UPDATE feature_flags SET rollout_percentage = 100 WHERE key = 'ai_chat_assistant';
```

**Recommended rollout progression:**

1. Start at 5% -- Monitor error rates and performance for 24 hours
2. Increase to 25% -- Monitor for another 24 hours
3. Increase to 50% -- Monitor for 24 hours
4. Increase to 100% -- Full rollout

### Kill Switches

Kill switches are emergency feature-disabling mechanisms that can be activated instantly. When a kill switch is activated, the feature is immediately disabled for all users, regardless of rollout percentage or other settings. Kill switches are only available for flags that have `isKillSwitch: true` in their configuration.

Currently, the only kill switch flag is `auto_refund_on_failure`. This flag controls whether the system automatically refunds payments when order processing fails. In an emergency where automatic refunds are causing issues, administrators can activate the kill switch to immediately stop all automatic refunds.

```typescript
// Activate the kill switch (server-side only)
import { killSwitch } from '@/lib/monitoring/feature-flags';
killSwitch('auto_refund_on_failure');
```

When a kill switch is activated, the system logs a message: `[FeatureFlags] KILL SWITCH ACTIVATED: auto_refund_on_failure`. Attempting to activate a kill switch on a non-kill-switch flag generates a warning instead.

---

## 8. Monitoring

### System Health Widget

The admin dashboard includes a real-time System Health Widget that displays the status of critical system components. The widget is visible on the admin dashboard overview page at `/admin-dashboard` and refreshes automatically every 30 seconds.

The widget displays the following indicators:

| Indicator | Description | Status Colors |
|-----------|-------------|---------------|
| Database latency | Round-trip time for a simple database query | Green (healthy) / Amber (degraded) |
| Stripe status | Health of the Stripe payment system | Blue (healthy) / Amber (degraded) |
| AI status | Health of the Gemini AI service | Purple (healthy) / Gray (offline) |
| Core status | Overall system health indicator | Green pulse (healthy) / Amber pulse (degraded) |

The widget performs the following checks on each refresh cycle:

1. **Database check** -- Executes a `SELECT id FROM profiles LIMIT 1` query and measures latency
2. **Stripe check** -- Calls the `/api/payment-health` endpoint and checks the `healthy` field
3. **AI check** -- Currently reports healthy by default (Gemini AI status is not actively checked)

### Payment Health Endpoint

The `/api/payment-health` endpoint provides real-time metrics for the payment system. This endpoint is admin-only and requires the `ANALYTICS_READ` permission.

**Endpoint:** `GET /api/payment-health`

**Response format:**

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "healthy": true,
  "metrics": {
    "successfulPayments": 142,
    "failedSessions": 3,
    "refundRate": 0.05,
    "pendingRefunds": 7,
    "criticalEvents": 0,
    "gmv24h": 1500000,
    "commission24h": 150000,
    "ledgerEntries24h": 145,
    "totalOrders7d": 980,
    "refundedOrders7d": 49
    },
  "queue": {
    "pending": 12,
    "processing": 2,
    "dead": 0
  },
  "circuitBreakers": {
    "stripe": { "state": "closed", "failures": 0 }
  }
}
```

**Key metrics to monitor:**

| Metric | Healthy Range | Warning | Critical |
|--------|-------------|---------|----------|
| `refundRate` | < 0.10 (10%) | 10-15% | > 15% |
| `pendingRefunds` | < 20 | 20-50 | > 50 |
| `criticalEvents` | 0 | 1-5 | > 5 |
| `queue.dead` | 0 | 1-10 | > 10 |
| `circuitBreakers.*.state` | `closed` | `half-open` | `open` |

### Performance Endpoint

The `/api/performance` endpoint provides detailed performance metrics including API latency, database performance, cache hit rates, slow queries, and recent errors. This endpoint is admin-only.

**Endpoint:** `GET /api/performance`

**Query parameters:**

| Parameter | Description | Default |
|-----------|-------------|---------|
| `format` | Response format: `json` or `prometheus` | `json` |

**Performance targets:**

| Metric | Target | Unit |
|--------|--------|------|
| API p95 latency | 250 | ms |
| API p99 latency | 500 | ms |
| API error rate | 1% | percentage |
| Database p95 latency | 50 | ms |
| Database slow query count | 0 | count |
| Cache hit rate | 80% | percentage |
| TTFB (Time to First Byte) | 200 | ms |
| LCP (Largest Contentful Paint) | 2500 | ms |
| CLS (Cumulative Layout Shift) | 0.1 | score |
| INP (Interaction to Next Paint) | 200 | ms |

**Prometheus format:**

To export metrics in Prometheus format for scraping:

```bash
curl -s https://your-domain.com/api/performance?format=prometheus
```

The response uses the standard Prometheus exposition format with `text/plain; version=0.0.4` content type.

### Health Check Endpoint

The `/api/cron/health-check` endpoint runs every 5 minutes (via Vercel cron) to verify system health. It checks database connectivity and records latency metrics. The endpoint is protected by a `CRON_SECRET` bearer token in production.

**Endpoint:** `GET /api/cron/health-check`

**Response format (healthy):**

```json
{
  "status": "ok",
  "task": "health_check",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

**Response format (degraded):**

```json
{
  "status": "degraded",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "database": {
    "status": "error",
    "latencyMs": 5000,
    "error": "connection timeout"
  }
}
```

### Prometheus Metrics

VendorTrack integrates with Prometheus for time-series monitoring. The Prometheus configuration is located at `monitoring/prometheus.yml` and defines scrape targets for the application. Key metrics exposed include:

- HTTP request latency (p50, p95, p99)
- HTTP request error rate
- Database query latency
- Cache hit/miss rates
- Payment processing times
- Order creation rates
- Refund processing times

### Grafana Dashboards

Grafana dashboards are configured alongside Prometheus for visual monitoring. The monitoring stack is defined in `docker-compose.monitoring.yml` and includes both Prometheus and Grafana services. To start the monitoring stack:

```bash
docker compose -f docker-compose.monitoring.yml up -d
```

Alert rules are defined in `monitoring/alerts.yml` and include the following critical alerts:

| Alert Name | Condition | Severity |
|------------|-----------|----------|
| `VendorTrackHighErrorRate` | Error rate > 5% for 5 minutes | Warning |
| `VendorTrackHighLatency` | p95 latency > 500ms for 5 minutes | Warning |
| `VendorTrackCriticalLatency` | p95 latency > 2000ms for 2 minutes | Critical |

---

## 9. Audit Logs

### Overview

The VendorTrack audit logging system records all significant platform events for security, compliance, and operational debugging purposes. Audit logs are stored in the `audit_logs` table in Supabase and are immutable -- once written, they cannot be modified or deleted. The audit logging system is designed to never break the application; if an audit log write fails, the error is logged to the console but the originating operation continues.

### Audit Log Schema

Each audit log entry contains the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Unique identifier (auto-generated) |
| `trace_id` | String | Correlation ID for tracing the event across services |
| `event_type` | String | The type of event (e.g., `REFUND_APPROVED`, `TOGGLE_ADMIN_STATUS`) |
| `severity` | String | Severity level: `INFO`, `WARN`, or `CRITICAL` |
| `payload` | JSONB | Detailed event data including user ID, resource, action, and result |
| `created_at` | Timestamp | When the event was recorded |

### Security Event Types

The following event types are logged by the system:

| Event Type | Description | Severity |
|------------|-------------|----------|
| `TOGGLE_ADMIN_STATUS` | Admin status changed for a user | INFO/WARN |
| `UPDATE_SELLER_STATUS` | Seller status changed (approved/rejected) | INFO |
| `PURGE_ALL_USERS` | All users purged (destructive action) | CRITICAL |
| `ADMIN_DELETE_PRODUCT` | Product deleted by admin | INFO |
| `PROCESS_REFUND` | Refund decision processed (approve/reject) | INFO/WARN |
| `REFUND_PROCESSED` | Refund successfully completed via Stripe | WARN |
| `REFUND_FAILED` | Refund processing failed | CRITICAL |
| `REFUND_APPROVED` | Refund approved by admin | INFO |
| `REFUND_REJECTED` | Refund rejected by admin | INFO |
| `REFUND_REJECTED` (auth) | Refund access denied | WARN |
| `ADMIN_DELETE_PRODUCT` (auth) | Product delete access denied | WARN |
| `TOGGLE_ADMIN_STATUS` (auth) | Admin toggle access denied | WARN |
| `UPDATE_SELLER_STATUS` (auth) | Seller status update access denied | WARN |

### Severity Levels

| Severity | Description | When Used |
|----------|-------------|-----------|
| `INFO` | Normal operational events | Successful admin actions, routine operations |
| `WARN` | Events that may require attention | Denied access attempts, refund processing, successful refund completions |
| `CRITICAL` | Events requiring immediate attention | User purges, refund failures, data integrity issues |

### Search and Filtering

To query audit logs, use SQL against the `audit_logs` table:

```sql
-- Recent audit events
SELECT trace_id, event_type, severity, payload, created_at
FROM audit_logs
ORDER BY created_at DESC
LIMIT 50;

-- Filter by event type
SELECT * FROM audit_logs
WHERE event_type = 'REFUND_PROCESSED'
ORDER BY created_at DESC;

-- Filter by severity
SELECT * FROM audit_logs
WHERE severity = 'CRITICAL'
ORDER BY created_at DESC;

-- Filter by user
SELECT * FROM audit_logs
WHERE payload->>'user_id' = 'user-uuid'
ORDER BY created_at DESC;

-- Filter by date range
SELECT * FROM audit_logs
WHERE created_at BETWEEN '2025-01-01' AND '2025-01-31'
ORDER BY created_at DESC;

-- Search by trace ID
SELECT * FROM audit_logs
WHERE trace_id = 'specific-trace-id';

-- Count events by type in the last 24 hours
SELECT event_type, COUNT(*) as count
FROM audit_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY count DESC;

-- Find all denied access attempts
SELECT * FROM audit_logs
WHERE payload->>'result' = 'denied'
ORDER BY created_at DESC;
```

---

## 10. Backups

### Running Backups

VendorTrack provides a comprehensive backup script at `scripts/backup.sh` that creates backups of the database, Redis, and environment configuration. The script supports three modes: full backup, database-only backup, and Redis-only backup.

**Usage:**

```bash
# Full backup (database + Redis + environment manifest)
./scripts/backup.sh --full

# Database only
./scripts/backup.sh --db-only

# Redis only
./scripts/backup.sh --redis-only
```

**Configuration:**

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BACKUP_DIR` | `/var/backups/vendortrack` | Directory where backups are stored |
| `RETENTION_DAYS` | `30` | Number of days to retain backups |
| `SUPABASE_DB_URL` | (required) | Supabase database connection string |
| `REDIS_HOST` | `localhost` | Redis host for BGSAVE |
| `REDIS_PORT` | `6379` | Redis port |

**Recommended schedule:** Run daily at 03:00 UTC via cron:

```cron
0 3 * * * /path/to/scripts/backup.sh --full >> /var/log/vendortrack-backup.log 2>&1
```

**What the backup script does:**

1. Creates a timestamped backup directory under `BACKUP_DIR`
2. Runs `pg_dump` against the Supabase database with custom format and maximum compression (level 9)
3. Triggers a `BGSAVE` on Redis and waits up to 60 seconds for completion
4. Copies the Redis RDB file if accessible locally
5. Creates an environment manifest file (with values redacted for security)
6. Generates a `manifest.json` file listing all backup components
7. Cleans up backups older than `RETENTION_DAYS`

### Verifying Backups

After a backup completes, verify its integrity before relying on it for recovery:

```bash
# Verify the backup directory exists
ls -la /var/backups/vendortrack/$(date +%Y%m%d)*

# Check the manifest
cat /var/backups/vendortrack/<timestamp>/manifest.json

# Verify the database dump size
du -h /var/backups/vendortrack/<timestamp>/database.dump

# Test the database dump integrity (list contents without restoring)
pg_restore --list /var/backups/vendortrack/<timestamp>/database.dump | head -20
```

### Restoring from Backup

The restore script at `scripts/restore.sh` restores the database and Redis from a backup. This is a destructive operation that replaces the current database with the backup data.

**Usage:**

```bash
# Restore from a specific backup
./scripts/restore.sh 20250115_030000
```

**Pre-flight checks performed by the script:**

1. Verifies the backup directory exists
2. Verifies the database dump file exists
3. Verifies the `SUPABASE_DB_URL` environment variable is set
4. Requires the operator to type `CONFIRM` to proceed

**Safety measures:**

- Before restoring, the script creates a safety backup of the current database (named `pre_restore_<timestamp>`)
- The restore uses `pg_restore` with `--clean` and `--if-exists` flags to drop existing objects before creating them
- Redis restore is only performed for local Redis instances (remote Redis uses Upstash backup restore)
- After restore, the script verifies database connectivity and Redis connectivity

**How to restore:**

```bash
# Step 1: List available backups
ls -la /var/backups/vendortrack/

# Step 2: Run the restore script
./scripts/restore.sh 20250115_030000

# Step 3: Type CONFIRM when prompted

# Step 4: Verify application health after restore
curl -sf http://localhost:9002/api/health
curl -sf http://localhost:9002/api/payment-health
```

**Important warnings:**

- Always create a fresh backup before restoring
- The restore process replaces the current database entirely
- The safety backup is created automatically but should be verified
- Test restores on a staging environment before restoring production
- Notify all users of planned downtime before a production restore

---

## 11. Incident Response

### Severity Levels

VendorTrack defines four severity levels for incidents. The severity determines the required response time, the escalation path, and the communication protocol.

| Severity | Definition | Response Time | Example |
|----------|-----------|---------------|---------|
| SEV1 | Total outage or data loss | 15 minutes | Site down, database unreachable, payment processing halted |
| SEV2 | Degraded service | 30 minutes | High error rate, slow responses, partial feature failure |
| SEV3 | Minor issue | 4 hours | Non-critical feature broken, UI glitch affecting workflow |
| SEV4 | Cosmetic | 24 hours | Visual bug, minor UX issue, non-user-facing problem |

### Response Process

#### SEV1: Total Outage Response

A SEV1 incident means the platform is entirely unavailable or critical financial data is at risk. This is the highest priority and requires immediate response.

**Immediate Actions (0-15 minutes):**

1. Acknowledge the incident in the incident channel (Slack `#incidents`)
2. Assign an Incident Commander (IC) who will coordinate the response
3. Open a bridge call (Zoom/Google Meet) and share the link in the incident channel
4. Post an initial status update: `[SEV1] [TIME] - [Brief description]`
5. Check external service status pages:
   - Vercel: https://www.vercelstatus.com
   - Supabase: https://status.supabase.com
   - Stripe: https://status.stripe.com
6. Verify the health endpoint: `curl -s https://your-domain.com/api/health`
7. Check Sentry for recent error spikes
8. If the site is completely down, consider activating the static maintenance page on Vercel

**Investigation (15-60 minutes):**

1. Check Vercel deployment logs for build or runtime errors
2. Check Supabase dashboard for database health, connection count, and active queries
3. Check Redis connectivity if using Docker deployment
4. Review recent deployments for potential root cause
5. Check if any recent migration was applied that could cause the outage
6. If payment-related, check Stripe webhook delivery status and `processed_events` table

**Resolution:**

1. If a recent deployment caused the issue, initiate rollback immediately
2. If a database migration caused the issue, revert the migration
3. If infrastructure is the cause, contact the relevant vendor
4. Activate feature flag kill switches if a specific feature is causing the outage

#### SEV2: Degraded Service Response

A SEV2 incident means the platform is operational but experiencing significant degradation.

**Immediate Actions (0-30 minutes):**

1. Acknowledge the incident in the incident channel
2. Quantify the impact: error rate, latency, affected endpoints, affected users
3. Check Prometheus alerts: `VendorTrackHighErrorRate`, `VendorTrackHighLatency`, `VendorTrackCriticalLatency`
4. Check the payment health endpoint: `curl -s https://your-domain.com/api/payment-health`
5. Check database monitoring views: `v_query_performance`, `v_cache_hit_rate`
6. Review Sentry for error patterns and grouping

**Common SEV2 scenarios:**

| Scenario | Indicator | Fix |
|----------|-----------|-----|
| High API latency | p95 > 500ms | Check slow queries, clear cache, check Redis health |
| High error rate | > 5% of requests | Check Sentry, review recent deployments, check DB health |
| Cache hit rate drop | < 50% | Restart Redis, check cache warming cron, clear stale entries |
| Queue backlog | > 1000 pending jobs | Scale worker, check dead letter queue, check for stuck jobs |
| Database latency | > 100ms p95 | Check connection pool, run VACUUM ANALYZE, check slow queries |

#### SEV3: Minor Issue Response

1. Create a ticket in the project tracker with the SEV3 label
2. Investigate during normal working hours
3. If the issue affects a feature behind a feature flag, consider disabling the flag
4. If the issue is related to a background job, check the job queue status
5. Communicate the issue to affected users if there is a user-facing impact
6. Target resolution within 4 hours during business hours

#### SEV4: Cosmetic Issue Response

1. Create a ticket in the project tracker with the SEV4 label
2. Fix during the next regular sprint cycle
3. No immediate action required unless the issue affects accessibility

### Escalation

For detailed escalation procedures, emergency contacts, and vendor support information, refer to **RUNBOOK.md** (Section 2: Incident Response Runbook and Section 10: Emergency Contacts). The RUNBOOK contains the complete operational procedures including:

- Detailed step-by-step response procedures for each severity level
- Rollback procedures for failed deployments
- Database operation procedures
- Payment operation procedures
- Security operation procedures
- Emergency contact information for all vendors and team members

---

## 12. Admin Dashboard Pages

### Overview

The admin dashboard is a collection of pages under the `/admin-dashboard` route. Each page is protected by the RBAC system and requires specific permissions. The dashboard provides a unified interface for all platform administration tasks.

### /admin-dashboard (Overview)

The admin dashboard overview page is the landing page for all administrative operations. It provides a high-level summary of the platform's current state and key metrics.

**Required Role:** `admin` or higher
**Required Permission:** `analytics.read`

**Key features:**

- **Stat Cards** -- Display key platform metrics at a glance:
  - Total GMV (Gross Merchandise Volume)
  - Platform Yield (captured fees at 10%)
  - Active Sellers (verified vendors)
  - Throughput (30d) (fulfillment events in the last 30 days)
  - Efficiency (order/user ratio as a percentage)
- **System Health Widget** -- Real-time status of database, Stripe, and AI services
- **Platform Revenue Chart** -- Visual chart of platform revenue over time
- **Relational Integrity** -- Database catalog size and total accounts count
- **Sync Ledger** -- Button to refresh platform statistics
- **Initialize System Data** -- Button to seed the database with demo data (only visible when no orders exist)

The overview page is the first place an administrator should check when assessing the health of the platform. The stat cards provide immediate visibility into revenue, seller activity, and order volume. The System Health Widget in the top-right corner provides real-time status indicators for critical infrastructure components.

### /admin-dashboard/users (User Management)

The user management page provides a comprehensive view of all registered accounts on the platform.

**Required Role:** `admin` or higher
**Required Permission:** `users.read` and `users.manage`

**Key features:**

- **User Table** -- Paginated list of all users (20 per page) with:
  - User details (name, email, admin badge)
  - Account type (buyer/seller role)
  - Seller status (approved/rejected/pending)
  - Stripe connection status (connected/missing)
  - Registration date
  - Actions dropdown menu
- **Purge All Users** -- Destructive button to remove all user accounts except the admin's own
- **Refresh List** -- Button to reload the user list
- **Load More Users** -- Pagination button for loading additional users

**Actions available per user:**

- **Make Admin / Revoke Admin** -- Toggle admin status on the user's account
- **Approve Vendor** -- Approve a seller's application (only visible for sellers)
- **Reject Vendor** -- Reject a seller's application (only visible for sellers)

### /admin-dashboard/products (Product Management)

The product management page provides a comprehensive view of the entire product catalog across all vendors.

**Required Role:** `admin` or higher
**Required Permission:** `products.delete`

**Key features:**

- **Product Table** -- Paginated list of all products (20 per page) with:
  - Product image thumbnail, title, and truncated ID
  - Vendor name with link to the vendor's store page
  - Price in USD
  - Status badge (active or other)
  - Delete button (soft delete)
- **Refresh Catalog** -- Button to reload the product list
- **Load More Products** -- Pagination button for loading additional products

**Actions available per product:**

- **Delete** -- Soft-delete the product (sets `deleted_at` timestamp)

### /admin-dashboard/orders (Order Management)

The order management page provides a real-time view of all orders across the platform.

**Required Role:** `admin` or higher
**Required Permission:** `orders.read`

**Key features:**

- **Order Table** -- Paginated list of all orders (20 per page) with:
  - Order ID (truncated UUID)
  - Product name and quantity
  - Total amount in USD
  - Platform fee (10% commission) in USD
  - Order status badge
  - Order creation date
- **Refresh Ledger** -- Button to reload the order list
- **Load More Transactions** -- Pagination button for loading additional orders

### /admin-dashboard/refunds (Refund Management)

The refund management page displays all pending refund requests and provides the interface for approving or rejecting refunds.

**Required Role:** `admin` or higher
**Required Permission:** `refunds.manage`

**Key features:**

- **Enterprise Refund Processing Notice** -- Green banner explaining that all approved refunds call the Stripe Refund API before updating the database
- **Refund Request Table** -- Paginated list of orders with `refund_status = 'requested'` (20 per page) with:
  - Order ID, product name, and customer name
  - Refund amount in USD
  - Buyer's reason for the refund (displayed in a highlighted callout)
  - Date the refund was requested
  - Approve and Reject buttons
- **Refresh Requests** -- Button to reload the refund request list
- **Load More Requests** -- Pagination button for loading additional requests

**Actions available per refund request:**

- **Reject** -- Reject the refund request (updates `refund_status` to `rejected`)
- **Approve & Refund** -- Approve the refund and trigger Stripe refund processing

**Important:** When a refund is approved, the system automatically calls the Stripe Refund API, verifies the refund, updates the database, creates a financial ledger entry, and queues notifications. The entire process is atomic and auditable. If the Stripe API is unavailable, the refund will fail and the admin will see an error message.

---

## Appendix A: Quick Reference

### Server Actions Summary

| Action | Permission | Admin Only | Description |
|--------|-----------|------------|-------------|
| `toggleAdminStatus(userId, makeAdmin)` | `USERS_MANAGE` | Yes | Grant or revoke admin status |
| `updateSellerStatus(userId, status)` | `USERS_MANAGE` | Yes | Approve, reject, or set seller to pending |
| `purgeAllUsers(currentUserId)` | `USERS_DELETE` | Yes | Delete all users except the current admin |
| `adminDeleteProduct(productId)` | `PRODUCTS_DELETE` | Yes | Soft-delete a product |
| `processRefundDecision(orderId, decision)` | `REFUNDS_MANAGE` | Yes | Approve or reject a refund request |

### API Endpoints Summary

| Endpoint | Method | Permission | Description |
|----------|--------|-----------|-------------|
| `/api/payment-health` | GET | `ANALYTICS_READ` | Payment system health metrics |
| `/api/performance` | GET | Admin | Performance metrics (JSON or Prometheus) |
| `/api/performance?format=prometheus` | GET | Admin | Prometheus-format metrics |
| `/api/cron/health-check` | GET | CRON_SECRET | Automated health check (every 5 min) |
| `/api/cron/reconciliation` | GET | CRON_SECRET | Payment reconciliation check |
| `/api/cron/cache-warming` | GET | CRON_SECRET | Cache warming (every 6 hours) |

### Route Protection Summary

| Route | Required Role | Required Permissions |
|-------|--------------|---------------------|
| `/admin-dashboard` | `admin` | `analytics.read` |
| `/admin-dashboard/users` | `admin` | `users.read`, `users.manage` |
| `/admin-dashboard/products` | `admin` | `products.delete` |
| `/admin-dashboard/orders` | `admin` | `orders.read` |
| `/admin-dashboard/refunds` | `admin` | `refunds.manage` |
| `/seller-dashboard` | `seller` | `analytics.read` |
| `/seller-dashboard/products` | `seller` | `products.write` |
| `/seller-dashboard/orders` | `seller` | `orders.manage` |
| `/seller-dashboard/settings` | `seller` | `inventory.manage` |

---

## Appendix B: Common Administrative Tasks

### Approving a New Seller

1. Navigate to `/admin-dashboard/users`
2. Locate the seller with `Pending` status
3. Review the seller's information (name, email, Stripe status)
4. Click "Manage" > "Approve Vendor"
5. Verify the seller can access `/seller-dashboard` by checking their profile

### Processing a Refund Request

1. Navigate to `/admin-dashboard/refunds`
2. Review the buyer's reason for the refund
3. Verify the order details (amount, product, date)
4. Click "Approve & Refund" or "Reject" as appropriate
5. If approved, verify the Stripe refund ID in the confirmation toast
6. Check the payment health endpoint to confirm no circuit breakers opened

### Removing a Policy-Violating Product

1. Navigate to `/admin-dashboard/products`
2. Locate the product in question
3. Click the trash icon button
4. Confirm the soft-delete action
5. Verify the product no longer appears in the marketplace

### Toggling a Feature Flag

1. Connect to the Supabase database
2. Update the feature flag in the `feature_flags` table:
   ```sql
   UPDATE feature_flags SET default_value = true WHERE key = 'ai_chat_assistant';
   ```
3. Verify the change by checking the application behavior
4. For emergency disabling, use the kill switch:
   ```typescript
   killSwitch('auto_refund_on_failure');
   ```

### Running a Manual Backup

1. SSH into the production server
2. Run the backup script:
   ```bash
   ./scripts/backup.sh --full
   ```
3. Verify the backup was created:
   ```bash
   ls -la /var/backups/vendortrack/$(date +%Y%m%d)*
   ```
4. Check the backup manifest:
   ```bash
   cat /var/backups/vendortrack/<timestamp>/manifest.json
   ```

### Monitoring System Health

1. Check the System Health Widget on the admin dashboard
2. Call the payment health endpoint:
   ```bash
   curl -s https://your-domain.com/api/payment-health | jq .
   ```
3. Call the performance endpoint:
   ```bash
   curl -s https://your-domain.com/api/performance | jq .
   ```
4. Check Prometheus/Grafana for historical trends
5. Review Sentry for recent error spikes

---

*This document is maintained by the VendorTrack platform team. For questions or updates, contact the platform administrators. For operational procedures, refer to RUNBOOK.md.*
