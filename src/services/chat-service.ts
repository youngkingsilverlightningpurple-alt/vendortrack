/**
 * @fileoverview Chat Service
 *
 * Business logic for chat/messaging.
 * Extracted from inline code in the OrderChat component.
 */

import { chatRepository } from '@/repositories/chat-repository';
import { AuthorizationError, ErrorCode } from '@/lib/errors';
import type { Message, Conversation } from '@/domain';

class ChatService {
  /** Get messages for a conversation */
  async getMessages(conversationId: string, userId: string, isAdmin: boolean): Promise<Message[]> {
    // Verify user is involved in the conversation
    if (!isAdmin) {
      const isInvolved = await chatRepository.isUserInvolved(conversationId, userId);
      if (!isInvolved) {
        throw new AuthorizationError({
          message: 'You are not involved in this conversation',
          code: ErrorCode.ORDER_INVOLVEMENT_VIOLATION,
        });
      }
    }

    return chatRepository.findMessagesByConversationId(conversationId);
  }

  /** Send a message in a conversation */
  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    text: string;
    orderId: string;
    buyerId: string;
    sellerId: string;
    isAdmin: boolean;
  }): Promise<Message> {
    // Verify user is involved
    if (!data.isAdmin) {
      const isInvolved = await chatRepository.isUserInvolved(data.conversationId, data.senderId);
      if (!isInvolved) {
        throw new AuthorizationError({
          message: 'You are not involved in this conversation',
          code: ErrorCode.ORDER_INVOLVEMENT_VIOLATION,
        });
      }
    }

    // Ensure conversation exists
    await chatRepository.ensureConversation({
      orderId: data.orderId,
      buyerId: data.buyerId,
      sellerId: data.sellerId,
      lastMessage: data.text,
    });

    // Send the message
    return chatRepository.sendMessage({
      conversationId: data.conversationId,
      senderId: data.senderId,
      text: data.text,
    });
  }
}

export const chatService = new ChatService();
