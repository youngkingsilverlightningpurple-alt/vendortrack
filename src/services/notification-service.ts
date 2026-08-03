/**
 * @fileoverview Notification Service
 *
 * Business logic for notifications.
 * Wraps the payment queue's notification job system.
 */

import { enqueueJob } from '@/lib/payment/queue';
import { PaymentLogger } from '@/lib/payment/errors';

class NotificationService {
  /** Notify buyer of payment success */
  async notifyPaymentSuccessBuyer(data: {
    sessionId: string;
    paymentIntentId: string;
    amount: number;
    traceId: string;
  }): Promise<void> {
    try {
      await enqueueJob({
        jobType: 'notification',
        payload: {
          type: 'payment_success_buyer',
          sessionId: data.sessionId,
          paymentIntentId: data.paymentIntentId,
          amount: data.amount,
        },
        traceId: data.traceId,
      });
    } catch (error: unknown) {
      PaymentLogger.warn(data.traceId, 'notification_buyer_failed', 'Failed to queue buyer notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /** Notify seller of payment success */
  async notifyPaymentSuccessSeller(data: {
    sessionId: string;
    paymentIntentId: string;
    amount: number;
    traceId: string;
  }): Promise<void> {
    try {
      await enqueueJob({
        jobType: 'notification',
        payload: {
          type: 'payment_success_seller',
          sessionId: data.sessionId,
          paymentIntentId: data.paymentIntentId,
          amount: data.amount,
        },
        traceId: data.traceId,
      });
    } catch (error: unknown) {
      PaymentLogger.warn(data.traceId, 'notification_seller_failed', 'Failed to queue seller notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /** Notify buyer of refund */
  async notifyRefundProcessed(data: {
    orderId: string;
    amount: number;
    traceId: string;
  }): Promise<void> {
    try {
      await enqueueJob({
        jobType: 'notification',
        payload: {
          type: 'refund_processed_buyer',
          orderId: data.orderId,
          amount: data.amount,
        },
        traceId: data.traceId,
      });
    } catch (error: unknown) {
      PaymentLogger.warn(data.traceId, 'notification_refund_failed', 'Failed to queue refund notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const notificationService = new NotificationService();
