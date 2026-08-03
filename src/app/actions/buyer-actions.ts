'use server';

/**
 * @fileOverview Buyer Server Actions
 *
 * REFACTORED: Thin server actions that delegate to the service layer.
 * These actions only handle: auth gate → service call → return result.
 * All business logic lives in the service layer.
 */

import { requireAuth, isAuthError, logAuthEvent } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { orderRepository } from '@/repositories/order-repository';
import { cartRepository } from '@/repositories/cart-repository';
import { getErrorMessage } from '@/types';

// ============================================================
// REFUND REQUEST
// ============================================================

export async function requestRefund(orderId: string, reason: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.ORDERS_REFUND,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    // Verify the buyer owns this order
    const order = await orderRepository.findById(orderId);
    if (!order) {
      return { error: 'Order not found.' };
    }

    // Ownership check
    if (auth.role !== 'super_admin' && auth.role !== 'admin' && order.buyerId !== auth.userId) {
      await logAuthEvent({
        userId: auth.userId,
        action: 'REFUND_REQUEST_OWNERSHIP_VIOLATION',
        resource: 'orders',
        resourceId: orderId,
        result: 'denied',
        severity: 'WARN',
      });
      return { error: 'You do not own this order.' };
    }

    await orderRepository.updateRefundStatus(orderId, 'requested', reason);

    await logAuthEvent({
      userId: auth.userId,
      action: 'REFUND_REQUEST',
      resource: 'orders',
      resourceId: orderId,
      result: 'success',
      details: { reason },
    });

    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

// ============================================================
// CART MANAGEMENT
// ============================================================

export async function updateCartItem(cartItemId: string, quantity: number) {
  const auth = await requireAuth({
    permission: PERMISSIONS.CART_MANAGE,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    // Verify the buyer owns this cart item
    const isOwner = await cartRepository.isOwnedBy(cartItemId, auth.userId);
    if (!isOwner) {
      await logAuthEvent({
        userId: auth.userId,
        action: 'CART_UPDATE_OWNERSHIP_VIOLATION',
        resource: 'cart_items',
        resourceId: cartItemId,
        result: 'denied',
        severity: 'WARN',
      });
      return { error: 'You do not own this cart item.' };
    }

    if (quantity < 1) {
      await cartRepository.deleteById(cartItemId);
    } else {
      await cartRepository.updateQuantity(cartItemId, quantity);
    }

    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

export async function removeCartItem(cartItemId: string) {
  const auth = await requireAuth({
    permission: PERMISSIONS.CART_MANAGE,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    // Verify the buyer owns this cart item
    const isOwner = await cartRepository.isOwnedBy(cartItemId, auth.userId);
    if (!isOwner) {
      await logAuthEvent({
        userId: auth.userId,
        action: 'CART_DELETE_OWNERSHIP_VIOLATION',
        resource: 'cart_items',
        resourceId: cartItemId,
        result: 'denied',
        severity: 'WARN',
      });
      return { error: 'You do not own this cart item.' };
    }

    await cartRepository.deleteById(cartItemId);
    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}
