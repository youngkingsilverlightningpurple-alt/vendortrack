/**
 * @fileOverview Centralized RBAC (Role-Based Access Control) System
 *
 * This module defines ALL roles, permissions, and access control rules
 * for the VendorTrack application. It is the SINGLE SOURCE OF TRUTH
 * for authorization decisions.
 *
 * SECURITY PRINCIPLE: Never trust the client.
 * Every authorization check MUST be performed server-side.
 * Client-side checks are for UI rendering ONLY.
 *
 * OWASP: A01:2021 — Broken Access Control
 * This module implements defense-in-depth against:
 * - Vertical privilege escalation (user → admin)
 * - Horizontal privilege escalation (seller A → seller B)
 * - Insecure direct object references (IDOR)
 * - Missing function-level access control
 */

// ============================================================
// ROLES
// ============================================================

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  SELLER: 'seller',
  BUYER: 'buyer',
  GUEST: 'guest',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

/** All valid roles for validation */
export const ALL_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN,
  ROLES.SELLER,
  ROLES.BUYER,
  ROLES.GUEST,
];

/** Role hierarchy — higher index = more privileged */
const ROLE_HIERARCHY: Role[] = [
  ROLES.GUEST,
  ROLES.BUYER,
  ROLES.SELLER,
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
];

/** Check if roleA has equal or higher privilege than roleB */
export function hasRoleLevel(roleA: Role, roleB: Role): boolean {
  return ROLE_HIERARCHY.indexOf(roleA) >= ROLE_HIERARCHY.indexOf(roleB);
}

/** Map database role + is_admin to canonical RBAC role */
export function resolveRole(dbRole: string, isAdmin: boolean): Role {
  if (isAdmin) return ROLES.SUPER_ADMIN;
  if (dbRole === 'seller') return ROLES.SELLER;
  if (dbRole === 'buyer') return ROLES.BUYER;
  return ROLES.GUEST;
}

// ============================================================
// PERMISSIONS
// ============================================================

export const PERMISSIONS = {
  // Products
  PRODUCTS_READ: 'products.read',
  PRODUCTS_WRITE: 'products.write',
  PRODUCTS_DELETE: 'products.delete',

  // Orders
  ORDERS_READ: 'orders.read',
  ORDERS_MANAGE: 'orders.manage',
  ORDERS_REFUND: 'orders.refund',

  // Users
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
  USERS_DELETE: 'users.delete',

  // Payments
  PAYMENTS_CREATE: 'payments.create',
  PAYMENTS_MANAGE: 'payments.manage',

  // Analytics
  ANALYTICS_READ: 'analytics.read',

  // Admin
  ADMIN_READ: 'admin.read',

  // Inventory
  INVENTORY_MANAGE: 'inventory.manage',

  // AI
  AI_USE: 'ai.use',

  // Refunds
  REFUNDS_MANAGE: 'refunds.manage',

  // Cart
  CART_MANAGE: 'cart.manage',

  // Chat
  CHAT_READ: 'chat.read',
  CHAT_WRITE: 'chat.write',

  // Platform Settings
  PLATFORM_MANAGE: 'platform.manage',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ============================================================
// ROLE → PERMISSIONS MAP
// ============================================================

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.SUPER_ADMIN]: [
    // Super Admin has ALL permissions
    ...Object.values(PERMISSIONS),
  ],
  [ROLES.ADMIN]: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.PRODUCTS_DELETE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.USERS_READ,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.PAYMENTS_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.ADMIN_READ,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.AI_USE,
    PERMISSIONS.REFUNDS_MANAGE,
    PERMISSIONS.CHAT_READ,
    PERMISSIONS.CHAT_WRITE,
    PERMISSIONS.PLATFORM_MANAGE,
  ],
  [ROLES.SELLER]: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.PRODUCTS_WRITE,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_MANAGE,
    PERMISSIONS.ANALYTICS_READ,
    PERMISSIONS.INVENTORY_MANAGE,
    PERMISSIONS.AI_USE,
    PERMISSIONS.CHAT_READ,
    PERMISSIONS.CHAT_WRITE,
    PERMISSIONS.CART_MANAGE,
    PERMISSIONS.PAYMENTS_CREATE,
  ],
  [ROLES.BUYER]: [
    PERMISSIONS.PRODUCTS_READ,
    PERMISSIONS.ORDERS_READ,
    PERMISSIONS.ORDERS_REFUND,
    PERMISSIONS.PAYMENTS_CREATE,
    PERMISSIONS.CART_MANAGE,
    PERMISSIONS.CHAT_READ,
    PERMISSIONS.CHAT_WRITE,
    PERMISSIONS.AI_USE,
  ],
  [ROLES.GUEST]: [
    PERMISSIONS.PRODUCTS_READ,
  ],
};

/**
 * Check if a role has a specific permission.
 * This is the CORE authorization function.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const rolePermissions = ROLE_PERMISSIONS[role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if a role has ALL of the specified permissions.
 */
export function hasAllPermissions(role: Role, permissions: Permission[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

/**
 * Check if a role has ANY of the specified permissions.
 */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

// ============================================================
// PERMISSION MATRIX (for documentation and testing)
// ============================================================

export const PERMISSION_MATRIX: Record<string, Record<Role, boolean>> = {};
for (const perm of Object.values(PERMISSIONS)) {
  PERMISSION_MATRIX[perm] = {} as Record<Role, boolean>;
  for (const role of ALL_ROLES) {
    PERMISSION_MATRIX[perm][role] = hasPermission(role, perm);
  }
}

// ============================================================
// ROUTE PROTECTION CONFIG
// ============================================================

export interface RouteProtectionRule {
  path: string;
  requiredRole: Role;
  requiredPermissions?: Permission[];
  requireOwnership?: boolean;
}

export const ROUTE_PROTECTION: RouteProtectionRule[] = [
  // Admin routes
  { path: '/admin-dashboard', requiredRole: ROLES.ADMIN, requiredPermissions: [PERMISSIONS.ANALYTICS_READ] },
  { path: '/admin-dashboard/users', requiredRole: ROLES.ADMIN, requiredPermissions: [PERMISSIONS.USERS_READ, PERMISSIONS.USERS_MANAGE] },
  { path: '/admin-dashboard/orders', requiredRole: ROLES.ADMIN, requiredPermissions: [PERMISSIONS.ORDERS_READ] },
  { path: '/admin-dashboard/products', requiredRole: ROLES.ADMIN, requiredPermissions: [PERMISSIONS.PRODUCTS_DELETE] },
  { path: '/admin-dashboard/refunds', requiredRole: ROLES.ADMIN, requiredPermissions: [PERMISSIONS.REFUNDS_MANAGE] },

  // Seller routes
  { path: '/seller-dashboard', requiredRole: ROLES.SELLER, requiredPermissions: [PERMISSIONS.ANALYTICS_READ] },
  { path: '/seller-dashboard/products', requiredRole: ROLES.SELLER, requiredPermissions: [PERMISSIONS.PRODUCTS_WRITE] },
  { path: '/seller-dashboard/orders', requiredRole: ROLES.SELLER, requiredPermissions: [PERMISSIONS.ORDERS_MANAGE] },
  { path: '/seller-dashboard/settings', requiredRole: ROLES.SELLER, requiredPermissions: [PERMISSIONS.INVENTORY_MANAGE] },

  // Buyer routes
  { path: '/buyer-orders', requiredRole: ROLES.BUYER, requiredPermissions: [PERMISSIONS.ORDERS_READ] },
  { path: '/cart', requiredRole: ROLES.BUYER, requiredPermissions: [PERMISSIONS.CART_MANAGE] },
  { path: '/checkout', requiredRole: ROLES.BUYER, requiredPermissions: [PERMISSIONS.PAYMENTS_CREATE] },
];

/**
 * Find the matching route protection rule for a given path.
 */
export function findRouteRule(pathname: string): RouteProtectionRule | null {
  // Sort by specificity (longer paths first)
  const sorted = [...ROUTE_PROTECTION].sort((a, b) => b.path.length - a.path.length);
  for (const rule of sorted) {
    if (pathname === rule.path || pathname.startsWith(rule.path + '/')) {
      return rule;
    }
  }
  return null;
}
