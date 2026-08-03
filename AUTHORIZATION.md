# VendorTrack Authorization System

This document describes the complete authentication and authorization architecture for the VendorTrack application. It covers the RBAC design, permission model, middleware flow, session lifecycle, and threat model.

---

## 1. Architecture Overview

VendorTrack implements a **defense-in-depth** authorization model with three layers:

```
Layer 1: Next.js Middleware (src/middleware.ts)
   ↓ Validates session + role before page renders
Layer 2: Server Actions / API Routes (src/app/actions/, src/app/api/)
   ↓ Validates permissions + ownership before business logic
Layer 3: Database RLS (docs/supabase-rls-migration.sql)
   ↓ Enforces access control even if application is bypassed
```

**Principle: Never trust the client.** Client-side checks are for UI rendering only. Every sensitive operation is verified server-side.

---

## 2. RBAC Design

### 2.1 Roles

| Role | Description | Source |
|------|-------------|--------|
| `super_admin` | Full platform access. Can delete users, manage all settings. | `is_admin = true` in profiles |
| `admin` | Platform management. Can manage users, refunds, products. | `is_admin = true` in profiles |
| `seller` | Vendor operations. Can manage own products, orders, inventory. | `role = 'seller'` in profiles |
| `buyer` | Customer operations. Can browse, purchase, request refunds. | `role = 'buyer'` in profiles |
| `guest` | Unauthenticated. Can only browse public products. | No session |

### 2.2 Role Hierarchy

```
super_admin > admin > seller > buyer > guest
```

A higher role inherits all permissions of lower roles where appropriate. However, some permissions are exclusive (e.g., `users.delete` is only for `super_admin`).

### 2.3 Role Resolution

The `resolveRole()` function maps database fields to canonical RBAC roles:

```typescript
resolveRole(dbRole: string, isAdmin: boolean): Role
// is_admin=true → super_admin (regardless of db role)
// is_admin=false + role='seller' → seller
// is_admin=false + role='buyer' → buyer
// unknown → guest
```

---

## 3. Permission Model

### 3.1 Permission Matrix

| Permission | super_admin | admin | seller | buyer | guest |
|-----------|:-----------:|:-----:|:------:|:-----:|:-----:|
| `products.read` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `products.write` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `products.delete` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `orders.read` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `orders.manage` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `orders.refund` | ✓ | ✓ | ✗ | ✓ | ✗ |
| `users.read` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `users.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `users.delete` | ✓ | ✗ | ✗ | ✗ | ✗ |
| `payments.create` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `payments.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `analytics.read` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `inventory.manage` | ✓ | ✓ | ✓ | ✗ | ✗ |
| `ai.use` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `refunds.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |
| `cart.manage` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `chat.read` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `chat.write` | ✓ | ✓ | ✓ | ✓ | ✗ |
| `platform.manage` | ✓ | ✓ | ✗ | ✗ | ✗ |

### 3.2 Permission Categories

- **Read permissions** (`*.read`): Allow viewing data. Least restrictive.
- **Write permissions** (`*.write`): Allow creating/updating owned resources.
- **Manage permissions** (`*.manage`): Allow managing all resources in a domain.
- **Delete permissions** (`*.delete`): Allow destructive operations. Most restrictive.

---

## 4. Middleware Flow

### 4.1 Next.js Middleware (Layer 1)

The middleware in `src/middleware.ts` runs before any page renders. It:

1. Validates the Supabase session cookie
2. Checks if the route requires authentication
3. Resolves the user's role from their profile
4. Compares the role against the route's required roles
5. Redirects unauthorized users to their appropriate dashboard

### 4.2 Route Protection Rules

| Route Prefix | Required Roles | Redirect on Failure |
|-------------|---------------|-------------------|
| `/admin-dashboard` | `super_admin`, `admin` | `/products` |
| `/seller-dashboard` | `super_admin`, `admin`, `seller` | `/products` |
| `/buyer-orders` | `super_admin`, `admin`, `buyer` | `/login` |
| `/cart` | `super_admin`, `admin`, `buyer` | `/login` |
| `/checkout` | `super_admin`, `admin`, `buyer` | `/login` |

### 4.3 Server Actions (Layer 2)

Every server action in `src/app/actions/` follows the same pattern:

```
1. requireAuth({ permission, role, ownership }) → authenticate + authorize
2. If isAuthError(auth) → return error + log denied access
3. Verify ownership (if applicable)
4. Execute business logic
5. Log audit event
6. Return result
```

---

## 5. Ownership Verification

### 5.1 Horizontal Escalation Prevention

Ownership verification prevents Seller A from modifying Seller B's data:

| Operation | Ownership Check | Implementation |
|-----------|----------------|----------------|
| Update product | `product.seller_id === auth.userId` | `upsertProduct()` in seller-actions.ts |
| Update order status | `order.seller_id === auth.userId` | `updateOrderStatus()` in seller-actions.ts |
| Request refund | `order.buyer_id === auth.userId` | `requestRefund()` in buyer-actions.ts |
| Update cart item | `cart_item.user_id === auth.userId` | `updateCartItem()` in buyer-actions.ts |
| Delete cart item | `cart_item.user_id === auth.userId` | `removeCartItem()` in buyer-actions.ts |
| View conversation | `conv.buyer_id === auth.userId OR conv.seller_id === auth.userId` | `verifyConversationInvolvement()` in auth.ts |

### 5.2 Admin Override

Admins (`super_admin` and `admin`) bypass ownership checks. This is by design — admins need to manage all resources. However, all admin actions are logged to `audit_logs`.

---

## 6. Session Lifecycle

### 6.1 Session Creation

1. User submits credentials via `/login`
2. Supabase Auth validates and creates a session
3. Session token is stored in an HTTP-only cookie
4. Middleware validates the cookie on every request

### 6.2 Session Validation

- The middleware validates the session on every page request
- Server actions validate the session using `createRouteHandlerClient({ cookies })`
- The `requireAuth()` function calls `supabase.auth.getUser()` which validates the JWT

### 6.3 Session Expiration

- Supabase JWTs expire after 1 hour (configurable)
- Refresh tokens are used to obtain new JWTs automatically
- The middleware handles session refresh transparently

### 6.4 Logout

- `supabase.auth.signOut()` revokes the session
- The user is redirected to `/login`
- The session cookie is cleared

---

## 7. Audit Logging

### 7.1 Events Logged

| Event | Severity | Trigger |
|-------|----------|---------|
| `TOGGLE_ADMIN_STATUS` | WARN | Admin toggles user's admin flag |
| `UPDATE_SELLER_STATUS` | INFO | Admin approves/rejects seller |
| `PURGE_ALL_USERS` | CRITICAL | Admin purges all users |
| `ADMIN_DELETE_PRODUCT` | WARN | Admin soft-deletes product |
| `PROCESS_REFUND` | WARN | Admin approves/rejects refund |
| `UPDATE_PRODUCT` | INFO | Seller updates product |
| `CREATE_PRODUCT` | INFO | Seller creates product |
| `UPDATE_ORDER_STATUS` | INFO | Seller updates order status |
| `REFUND_REQUEST` | INFO | Buyer requests refund |
| `*_OWNERSHIP_VIOLATION` | WARN | User attempts to access another user's resource |

### 7.2 Audit Log Schema

```sql
audit_logs (
  id UUID,
  trace_id TEXT,
  event_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('INFO', 'WARN', 'CRITICAL')),
  payload JSONB,  -- Contains user_id, resource, resource_id, result, details
  created_at TIMESTAMPTZ
)
```

### 7.3 Immutability

- Audit logs are **immutable** — RLS policy prevents UPDATE and DELETE
- Only admins can read audit logs (SELECT policy)
- Any authenticated user can INSERT (for auth events)

---

## 8. Threat Model

### 8.1 Threats Addressed

| Threat | OWASP Category | Mitigation |
|--------|---------------|------------|
| Unauthenticated access to admin pages | A01: Broken Access Control | Middleware + server-side session validation |
| Buyer accessing admin dashboard | A01: Broken Access Control | Role-based route protection in middleware |
| Seller A editing Seller B's products | A01: Broken Access Control | Ownership verification in server actions |
| Buyer requesting refund on another's order | A01: Broken Access Control | Order ownership verification |
| Direct Supabase API calls bypassing auth | A01: Broken Access Control | RLS policies on all tables |
| Client-side role manipulation | A01: Broken Access Control | Server-side role resolution from database |
| Webhook signature forgery | A07: Security Misconfiguration | Stripe webhook signature verification |
| AI API abuse | A01: Broken Access Control | Server action requires authentication + ai.use permission |
| Privilege escalation via profile update | A01: Broken Access Control | RLS prevents changing role/is_admin fields |

### 8.2 Threats Not Fully Mitigated

| Threat | Risk | Mitigation Status |
|--------|------|-------------------|
| Compromised Supabase anon key | Medium | Key rotation required; RLS limits damage |
| Admin account takeover | High | Add MFA in future iteration |
| CSRF on state-changing operations | Medium | Next.js server actions have CSRF protection |
| Rate limiting on API routes | Low | Add rate limiting middleware in future iteration |

---

## 9. Files Reference

| File | Purpose |
|------|---------|
| `src/lib/rbac.ts` | Centralized RBAC: roles, permissions, route protection |
| `src/lib/auth.ts` | Server-side auth utilities: authenticate, authorize, verify ownership |
| `src/middleware.ts` | Next.js middleware: session validation + route protection |
| `src/app/actions/admin-actions.ts` | Admin server actions with auth + audit logging |
| `src/app/actions/seller-actions.ts` | Seller server actions with ownership verification |
| `src/app/actions/buyer-actions.ts` | Buyer server actions with ownership verification |
| `docs/supabase-rls-migration.sql` | Database RLS policies for all tables |
| `src/__tests__/access-control.test.ts` | Security tests for RBAC system |

---

## 10. Developer Guidelines

### 10.1 Adding a New Protected Route

1. Add the route to `ROUTE_PROTECTION` in `src/lib/rbac.ts`
2. Specify the required role and permissions
3. The middleware will automatically enforce the rule

### 10.2 Adding a New Server Action

1. Create the action in the appropriate `src/app/actions/` file
2. Call `requireAuth()` with the required permission/role
3. Check `isAuthError(auth)` before proceeding
4. Add ownership verification if the action modifies a specific resource
5. Log the action with `logAuthEvent()`

### 10.3 Adding a New Permission

1. Add the permission to `PERMISSIONS` in `src/lib/rbac.ts`
2. Assign the permission to the appropriate roles in `ROLE_PERMISSIONS`
3. Update the permission matrix in this document
4. Add tests in `src/__tests__/access-control.test.ts`
