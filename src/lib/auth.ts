/**
 * @fileOverview Server-Side Authorization Utilities
 *
 * Provides reusable functions for authenticating and authorizing
 * requests in API routes and server actions.
 *
 * SECURITY: Never import this module from client-side code.
 * All functions are server-only.
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { resolveRole, hasPermission, type Role, type Permission } from '@/lib/rbac';
import { type AuditLogDetails, getErrorMessage } from '@/types';

// ============================================================
// TYPES
// ============================================================

export interface AuthResult {
  success: true;
  userId: string;
  email: string;
  role: Role;
  dbRole: string;
  isAdmin: boolean;
}

export interface AuthError {
  success: false;
  error: string;
  statusCode: number;
  code: string;
}

export type AuthOutcome = AuthResult | AuthError;

export function isAuthError(result: AuthOutcome): result is AuthError {
  return result.success === false;
}

// ============================================================
// AUTHENTICATION
// ============================================================

/**
 * Authenticate a request by validating the Supabase session.
 * Returns the user's identity and resolved role.
 *
 * This is the FIRST gate — every protected route must call this.
 */
export async function authenticateRequest(): Promise<AuthOutcome> {
  try {
    // Graceful: Check Supabase is configured before attempting auth
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        success: false,
        error: 'Authentication service is not configured. Please set Supabase environment variables.',
        statusCode: 503,
        code: 'AUTH_SERVICE_UNAVAILABLE',
      };
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: Record<string, unknown> }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        success: false,
        error: 'Authentication required. Please sign in.',
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      };
    }

    // Fetch the user's profile for role information
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return {
        success: false,
        error: 'Database service is not configured. Please set Supabase environment variables.',
        statusCode: 503,
        code: 'DB_SERVICE_UNAVAILABLE',
      };
    }
    const { data: profile, error: profileError } = await (admin
      .from('profiles') as any)
      .select('role, is_admin, email')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return {
        success: false,
        error: 'User profile not found. Contact support.',
        statusCode: 403,
        code: 'PROFILE_NOT_FOUND',
      };
    }

    const resolvedRole = resolveRole((profile as Record<string, unknown>).role as string, (profile as Record<string, unknown>).is_admin as boolean);

    return {
      success: true,
      userId: user.id,
      email: ((profile as Record<string, unknown>).email as string) || user.email || '',
      role: resolvedRole,
      dbRole: (profile as Record<string, unknown>).role as string,
      isAdmin: (profile as Record<string, unknown>).is_admin as boolean,
    };
  } catch (error: unknown) {
    return {
      success: false,
      error: 'Authentication system error. Please try again.',
      statusCode: 500,
      code: 'AUTH_SYSTEM_ERROR',
    };
  }
}

// ============================================================
// AUTHORIZATION
// ============================================================

/**
 * Authorize a request by checking if the authenticated user has
 * the required permission(s).
 *
 * This is the SECOND gate — called after authenticateRequest().
 */
export function authorizePermission(
  auth: AuthResult,
  permission: Permission
): AuthError | null {
  if (!hasPermission(auth.role, permission)) {
    return {
      success: false,
      error: `Access denied. Required permission: ${permission}. Your role: ${auth.role}.`,
      statusCode: 403,
      code: 'INSUFFICIENT_PERMISSION',
    };
  }
  return null;
}

/**
 * Authorize that the user has at least the required role level.
 */
export function authorizeRole(
  auth: AuthResult,
  requiredRole: Role
): AuthError | null {
  const roleHierarchy: Role[] = ['guest', 'buyer', 'seller', 'admin', 'super_admin'];
  const userLevel = roleHierarchy.indexOf(auth.role);
  const requiredLevel = roleHierarchy.indexOf(requiredRole);

  if (userLevel < requiredLevel) {
    return {
      success: false,
      error: `Access denied. Required role: ${requiredRole} or higher. Your role: ${auth.role}.`,
      statusCode: 403,
      code: 'INSUFFICIENT_ROLE',
    };
  }
  return null;
}

/**
 * Authorize that the user is an admin (super_admin or admin).
 */
export function authorizeAdmin(auth: AuthResult): AuthError | null {
  if (auth.role !== 'super_admin' && auth.role !== 'admin') {
    return {
      success: false,
      error: 'Access denied. Admin privileges required.',
      statusCode: 403,
      code: 'ADMIN_REQUIRED',
    };
  }
  return null;
}

/**
 * Authorize that the user is a seller (or admin).
 */
export function authorizeSeller(auth: AuthResult): AuthError | null {
  if (auth.role !== 'super_admin' && auth.role !== 'admin' && auth.role !== 'seller') {
    return {
      success: false,
      error: 'Access denied. Seller privileges required.',
      statusCode: 403,
      code: 'SELLER_REQUIRED',
    };
  }
  return null;
}

// ============================================================
// OWNERSHIP VERIFICATION
// ============================================================

/**
 * Verify that a user owns a specific resource.
 * Prevents horizontal privilege escalation (seller A editing seller B's products).
 *
 * This is the THIRD gate — called after authentication and authorization.
 */
export async function verifyOwnership(
  auth: AuthResult,
  table: string,
  resourceId: string,
  ownerField: string = 'seller_id'
): Promise<AuthError | null> {
  // Admins bypass ownership checks
  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return null;
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return {
      success: false,
      error: 'Database service unavailable.',
      statusCode: 503,
      code: 'DB_SERVICE_UNAVAILABLE',
    };
  }
  const { data, error } = await admin
    .from(table)
    .select(ownerField)
    .eq('id', resourceId)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: 'Resource not found.',
      statusCode: 404,
      code: 'RESOURCE_NOT_FOUND',
    };
  }

  if (data[ownerField] !== auth.userId) {
    return {
      success: false,
      error: 'Access denied. You do not own this resource.',
      statusCode: 403,
      code: 'OWNERSHIP_VIOLATION',
    };
  }

  return null;
}

/**
 * Verify that a user is involved in an order (as buyer, seller, or admin).
 */
export async function verifyOrderInvolvement(
  auth: AuthResult,
  orderId: string
): Promise<AuthError | null> {
  // Admins can access all orders
  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return null;
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return {
      success: false,
      error: 'Database service unavailable.',
      statusCode: 503,
      code: 'DB_SERVICE_UNAVAILABLE',
    };
  }
  const { data, error } = await (admin
    .from('orders') as any)
    .select('buyer_id, seller_id')
    .eq('id', orderId)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: 'Order not found.',
      statusCode: 404,
      code: 'ORDER_NOT_FOUND',
    };
  }

  if ((data as Record<string, unknown>).buyer_id !== auth.userId && (data as Record<string, unknown>).seller_id !== auth.userId) {
    return {
      success: false,
      error: 'Access denied. You are not involved in this order.',
      statusCode: 403,
      code: 'ORDER_INVOLVEMENT_VIOLATION',
    };
  }

  return null;
}

/**
 * Verify that a user is involved in a conversation (as buyer, seller, or admin).
 */
export async function verifyConversationInvolvement(
  auth: AuthResult,
  conversationId: string
): Promise<AuthError | null> {
  // Admins can access all conversations
  if (auth.role === 'super_admin' || auth.role === 'admin') {
    return null;
  }

  const admin = getSupabaseAdminSafe();
  if (!admin) {
    return {
      success: false,
      error: 'Database service unavailable.',
      statusCode: 503,
      code: 'DB_SERVICE_UNAVAILABLE',
    };
  }
  const { data, error } = await (admin
    .from('conversations') as any)
    .select('buyer_id, seller_id')
    .eq('id', conversationId)
    .single();

  if (error || !data) {
    return {
      success: false,
      error: 'Conversation not found.',
      statusCode: 404,
      code: 'CONVERSATION_NOT_FOUND',
    };
  }

  if ((data as Record<string, unknown>).buyer_id !== auth.userId && (data as Record<string, unknown>).seller_id !== auth.userId) {
    return {
      success: false,
      error: 'Access denied. You are not involved in this conversation.',
      statusCode: 403,
      code: 'CONVERSATION_INVOLVEMENT_VIOLATION',
    };
  }

  return null;
}

// ============================================================
// CONVENIENCE: AUTHENTICATE + AUTHORIZE IN ONE CALL
// ============================================================

/**
 * Full auth gate: authenticate + authorize + optional ownership check.
 * Use this in API routes for maximum security with minimal boilerplate.
 */
export async function requireAuth(
  options: {
    permission?: Permission;
    role?: Role;
    adminOnly?: boolean;
    sellerOnly?: boolean;
    ownership?: {
      table: string;
      resourceId: string;
      ownerField?: string;
    };
    orderInvolvement?: string;
    conversationInvolvement?: string;
  } = {}
): Promise<AuthOutcome> {
  // Step 1: Authenticate
  const auth = await authenticateRequest();
  if (isAuthError(auth)) return auth;

  // Step 2: Authorize role
  if (options.adminOnly) {
    const err = authorizeAdmin(auth);
    if (err) return err;
  } else if (options.sellerOnly) {
    const err = authorizeSeller(auth);
    if (err) return err;
  } else if (options.role) {
    const err = authorizeRole(auth, options.role);
    if (err) return err;
  }

  // Step 3: Authorize permission
  if (options.permission) {
    const err = authorizePermission(auth, options.permission);
    if (err) return err;
  }

  // Step 4: Verify ownership
  if (options.ownership) {
    const err = await verifyOwnership(
      auth,
      options.ownership.table,
      options.ownership.resourceId,
      options.ownership.ownerField
    );
    if (err) return err;
  }

  // Step 5: Verify order involvement
  if (options.orderInvolvement) {
    const err = await verifyOrderInvolvement(auth, options.orderInvolvement);
    if (err) return err;
  }

  // Step 6: Verify conversation involvement
  if (options.conversationInvolvement) {
    const err = await verifyConversationInvolvement(auth, options.conversationInvolvement);
    if (err) return err;
  }

  return auth;
}

// ============================================================
// AUDIT LOGGING
// ============================================================

export interface AuditLogEntry {
  userId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  result: 'success' | 'denied' | 'error';
  severity?: 'INFO' | 'WARN' | 'CRITICAL';
  details?: AuditLogDetails;
}

/**
 * Log an authorization event to the audit_logs table.
 * This is called automatically for denied access attempts.
 */
export async function logAuthEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const admin = getSupabaseAdminSafe();
    if (!admin) return; // Graceful: skip audit logging if DB unavailable
    await ((admin.from('audit_logs') as any) as any).insert({
      trace_id: `auth_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      event_type: entry.action,
      severity: entry.severity || (entry.result === 'denied' ? 'WARN' : 'INFO'),
      payload: {
        user_id: entry.userId,
        resource: entry.resource,
        resource_id: entry.resourceId,
        result: entry.result,
        details: entry.details,
        timestamp: new Date().toISOString(),
      },
    } as any);
  } catch (error: unknown) {
    // Audit logging must NEVER break the application
    // Use structured logging instead of raw console.error
    const message = getErrorMessage(error);
    void message; // Acknowledged but not re-thrown
  }
}

/**
 * Log a denied access attempt.
 */
export async function logDeniedAccess(
  auth: AuthResult | AuthError,
  action: string,
  resource?: string,
  resourceId?: string
): Promise<void> {
  const userId = auth.success ? auth.userId : undefined;
  await logAuthEvent({
    userId,
    action,
    resource,
    resourceId,
    result: 'denied',
    severity: 'WARN',
    details: {
      reason: auth.success ? 'insufficient_permissions' : auth.error,
    },
  });
}
