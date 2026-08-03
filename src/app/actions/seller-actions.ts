'use server';

/**
 * @fileOverview Seller Server Actions
 *
 * REFACTORED: Thin server actions that delegate to the service layer.
 * These actions only handle: auth gate → service call → return result.
 * All business logic lives in the service layer.
 */

import { requireAuth, isAuthError, logAuthEvent } from '@/lib/auth';
import { PERMISSIONS } from '@/lib/rbac';
import { inventoryService } from '@/services/inventory-service';
import { validateDto, CreateProductSchema, UpdateProductSchema } from '@/dto';
import { getErrorMessage } from '@/types';

// ============================================================
// PRODUCT MANAGEMENT
// ============================================================

export async function upsertProduct(
  productData: {
    title: string;
    category: string;
    description: string;
    price_cents: number;
    status: 'active' | 'draft';
    image_url: string;
  },
  existingProductId?: string
) {
  const auth = await requireAuth({
    permission: PERMISSIONS.PRODUCTS_WRITE,
    sellerOnly: true,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    if (existingProductId) {
      // Update existing product
      const result = await inventoryService.updateProduct(
        existingProductId,
        auth.userId,
        auth.role === 'super_admin' || auth.role === 'admin',
        productData
      );
      return { success: true };
    } else {
      // Create new product
      const result = await inventoryService.createProduct(auth.userId, productData);
      return { success: true };
    }
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}

// ============================================================
// ORDER MANAGEMENT
// ============================================================

export async function updateOrderStatus(
  orderId: string,
  updateData: {
    status: string;
    tracking_number?: string;
    carrier?: string;
  }
) {
  const auth = await requireAuth({
    permission: PERMISSIONS.ORDERS_MANAGE,
    sellerOnly: true,
  });

  if (isAuthError(auth)) {
    return { error: auth.error };
  }

  try {
    await inventoryService.updateOrderStatus(
      orderId,
      auth.userId,
      auth.role === 'super_admin' || auth.role === 'admin',
      updateData.status,
      updateData.tracking_number,
      updateData.carrier
    );
    return { success: true };
  } catch (error: unknown) {
    return { error: getErrorMessage(error) };
  }
}
