/**
 * @fileoverview Inventory Service
 *
 * Business logic for inventory management.
 * Extracted from inline code in route handlers and server actions.
 */

import { productRepository } from '@/repositories/product-repository';
import { orderRepository } from '@/repositories/order-repository';
import { validateProductAvailability, validateOrderStatusTransition } from '@/validators';
import { AppError, ErrorCode, NotFoundError, AuthorizationError } from '@/lib/errors';
import type { Product, Order } from '@/domain';
import type { CreateProductDto, UpdateProductDto } from '@/dto';

class InventoryService {
  /** Create a new product (seller must be authorized) */
  async createProduct(sellerId: string, data: CreateProductDto): Promise<Product> {
    return productRepository.create(sellerId, data);
  }

  /** Update a product (seller must own it) */
  async updateProduct(
    productId: string,
    sellerId: string,
    isAdmin: boolean,
    data: UpdateProductDto
  ): Promise<Product> {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError({ resource: 'Product', id: productId });
    }

    // Ownership check
    if (!isAdmin && product.sellerId !== sellerId) {
      throw new AuthorizationError({
        message: 'You do not own this product',
        code: ErrorCode.OWNERSHIP_VIOLATION,
        context: { productId, sellerId },
      });
    }

    return productRepository.update(productId, data);
  }

  /** Soft-delete a product (admin only) */
  async deleteProduct(productId: string): Promise<void> {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new NotFoundError({ resource: 'Product', id: productId });
    }
    await productRepository.softDelete(productId);
  }

  /** Update order status (seller must own the order) */
  async updateOrderStatus(
    orderId: string,
    sellerId: string,
    isAdmin: boolean,
    newStatus: string,
    trackingNumber?: string,
    carrier?: string
  ): Promise<void> {
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError({ resource: 'Order', id: orderId });
    }

    // Ownership check
    if (!isAdmin && order.sellerId !== sellerId) {
      throw new AuthorizationError({
        message: 'You do not own this order',
        code: ErrorCode.OWNERSHIP_VIOLATION,
        context: { orderId, sellerId },
      });
    }

    // Validate status transition
    const transition = validateOrderStatusTransition(order.status, newStatus);
    if (!transition.valid) {
      throw new AppError(ErrorCode.INVALID_STATE, { message: transition.reason || 'Invalid status transition' });
    }

    await orderRepository.updateStatus(orderId, {
      status: newStatus,
      tracking_number: trackingNumber,
      carrier,
    });
  }

  /** Check product availability for purchase */
  async checkAvailability(productId: string, quantity: number): Promise<{ available: boolean; reason?: string }> {
    const product = await productRepository.findById(productId);
    if (!product) {
      return { available: false, reason: 'Product not found' };
    }

    const result = validateProductAvailability(product, quantity);
    return { available: result.valid, reason: result.reason };
  }
}

export const inventoryService = new InventoryService();
