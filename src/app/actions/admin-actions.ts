'use server';

/**
 * @fileOverview Admin Server Actions
 *
 * REFACTORED: Thin server actions that delegate to the service layer.
 * These actions only handle: auth gate → service call → return result.
 * All business logic lives in the service layer.
 */

import { requireAuth, isAuthError, logAuthEvent } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { userService } from '@/services/user-service';
import { inventoryService } from '@/services/inventory-service';
import { adminService } from '@/services/admin-service';
import { validateDto, ToggleAdminSchema, UpdateSellerStatusSchema, RefundDecisionSchema } from '@/dto';
import { getErrorMessage } from '@/types';

// ============================================================
// USER MANAGEMENT
// ============================================================

export async function toggleAdminStatus(userId: string, makeAdmin: boolean) {
  const auth = await requireAuth({
    permission: PERMISSIONS.USERS_MANAGE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    await logAuthEvent({
      action: 'TOGGLE_ADMIN_STATUS',
      resource: 'profiles',
      resourceId: userId,
      result: 'denied',
      details: { makeAdmin },
    });
    return { error: auth.error };
  }

  try {
    await userService.toggleAdminStatus(userId, auth.userId, makeAdmin);
    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

export async function updateSellerStatus(userId: string, status: 'approved' | 'rejected' | 'pending') {
  const auth = await requireAuth({
    permission: PERMISSIONS.USERS_MANAGE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    await logAuthEvent({
      action: 'UPDATE_SELLER_STATUS',
      resource: 'profiles',
      resourceId: userId,
      result: 'denied',
      details: { status },
    });
    return { error: auth.error };
  }

  try {
    await userService.updateSellerStatus(userId, status, auth.userId);
    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

export async function purgeAllUsers(currentUserId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.USERS_DELETE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    await logAuthEvent({
      action: 'PURGE_ALL_USERS',
      resource: 'profiles',
      result: 'denied',
      severity: 'CRITICAL',
    });
    return { error: auth.error };
  }

  if (auth.userId !== currentUserId) {
    return { error: 'User identity mismatch.' };
  }

  try {
    const deletedCount = await userService.purgeAllUsers(currentUserId);
    return { success: true, deletedCount };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

// ============================================================
// PRODUCT MANAGEMENT
// ============================================================

export async function adminDeleteProduct(productId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.PRODUCTS_DELETE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    await logAuthEvent({
      action: 'ADMIN_DELETE_PRODUCT',
      resource: 'products',
      resourceId: productId,
      result: 'denied',
    });
    return { error: auth.error };
  }

  try {
    await inventoryService.deleteProduct(productId);
    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

// ============================================================
// REFUND MANAGEMENT
// ============================================================

export async function processRefundDecision(orderId: string, decision: 'approved' | 'rejected') {
  const auth = await requireAuth({
    permission: PERMISSIONS.REFUNDS_MANAGE,
    adminOnly: true,
  });

  if (isAuthError(auth)) {
    await logAuthEvent({
      action: 'PROCESS_REFUND',
      resource: 'orders',
      resourceId: orderId,
      result: 'denied',
      details: { decision },
    });
    return { error: auth.error };
  }

  try {
    const result = await adminService.processRefundDecision(orderId, decision, auth.userId);
    return result;
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}
