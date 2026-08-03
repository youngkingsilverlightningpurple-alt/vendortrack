/**
 * @fileoverview Admin Service
 *
 * Business logic for admin operations.
 * Extracted from admin-actions.ts.
 */

import { orderRepository } from '@/repositories/order-repository';
import { auditLogRepository } from '@/repositories/audit-log-repository';
import { processAdminRefundDecision } from '@/lib/payment/refund-service';
import { validateRefundEligibility } from '@/validators';
import { AuthorizationError, ErrorCode, NotFoundError, AppError } from '@/lib/errors';
import type { Order } from '@/domain';

class AdminService {
  /** Process a refund decision (approve/reject) */
  async processRefundDecision(
    orderId: string,
    decision: 'approved' | 'rejected',
    adminUserId: string,
    traceId?: string
  ): Promise<{ success: boolean; stripeRefundId?: string; refundAmount?: number; traceId?: string; error?: string }> {
    const tid = traceId || `refund_${Date.now()}`;

    // Verify order exists
    const order = await orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError({ resource: 'Order', id: orderId, traceId: tid });
    }

    // Validate refund eligibility
    if (decision === 'approved') {
      const eligibility = validateRefundEligibility(order);
      if (!eligibility.valid) {
        throw new AppError(ErrorCode.INVALID_STATE, { message: eligibility.reason || 'Refund not eligible', traceId: tid });
      }
    }

    // Use the enterprise refund service
    const result = await processAdminRefundDecision(
      orderId,
      decision,
      adminUserId,
      decision === 'approved' ? 'Admin approved refund' : 'Admin rejected refund'
    );

    if (!result.success) {
      return { success: false, error: result.error || 'Refund processing failed', traceId: tid };
    }

    // Audit log
    await auditLogRepository.insert({
      traceId: tid,
      eventType: decision === 'approved' ? 'REFUND_APPROVED' : 'REFUND_REJECTED',
      severity: 'INFO',
      payload: {
        adminUserId,
        orderId,
        decision,
        result: 'success',
      },
    });

    return {
      success: true,
      stripeRefundId: result.stripeRefundId,
      refundAmount: result.amount,
      traceId: result.traceId,
    };
  }

  /** Get orders with pending refund requests */
  async getPendingRefunds(options?: { page?: number; pageSize?: number }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return orderRepository.findPendingRefunds(options);
  }

  /** Get all orders with pagination */
  async getAllOrders(options?: { page?: number; pageSize?: number }): Promise<{ orders: Order[]; hasMore: boolean }> {
    return orderRepository.findAll(options);
  }
}

export const adminService = new AdminService();
