/**
 * @fileoverview Chat Repository
 *
 * All database access for conversations and messages goes through this module.
 */

import { getSupabaseAdmin } from '@/lib/supabase-admin';
import type { Message, MessageRow, Conversation, ConversationRow } from '@/domain';
import { messageRowToDomain, conversationRowToDomain } from '@/domain';
import { fromDatabaseError } from '@/lib/errors';

class ChatRepository {
  /** Find a conversation by ID */
  async findConversationById(conversationId: string): Promise<Conversation | null> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('conversations') as any)
      .select('*')
      .eq('id', conversationId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw fromDatabaseError(error);
    }
    return data ? conversationRowToDomain(data as ConversationRow) : null;
  }

  /** Find or create a conversation for an order */
  async ensureConversation(data: {
    orderId: string;
    buyerId: string;
    sellerId: string;
    lastMessage: string;
  }): Promise<void> {
    const admin = getSupabaseAdmin();

    // Check if conversation exists
    const { data: existing } = await (admin
      .from('conversations') as any)
      .select('id')
      .eq('id', data.orderId)
      .single();

    const payload = {
      last_message: data.lastMessage,
      updated_at: new Date().toISOString(),
    };

    if (!existing) {
      await ((admin.from('conversations') as any) as any).insert({
        id: data.orderId,
        order_id: data.orderId,
        buyer_id: data.buyerId,
        seller_id: data.sellerId,
        involved_users: [data.buyerId, data.sellerId],
        ...payload,
      } as any);
    } else {
      await ((admin.from('conversations') as any) as any).update(payload as any).eq('id', data.orderId);
    }
  }

  /** Find messages for a conversation */
  async findMessagesByConversationId(conversationId: string): Promise<Message[]> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('messages') as any)
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) throw fromDatabaseError(error);
    return (data || []).map((row: any) => messageRowToDomain(row as MessageRow));
  }

  /** Send a message */
  async sendMessage(data: {
    conversationId: string;
    senderId: string;
    text: string;
  }): Promise<Message> {
    const admin = getSupabaseAdmin();
    const { data: message, error } = await (admin
      .from('messages') as any)
      .insert({
        conversation_id: data.conversationId,
        sender_id: data.senderId,
        text: data.text,
      } as any)
      .select()
      .single();

    if (error) throw fromDatabaseError(error);
    return messageRowToDomain(message as MessageRow);
  }

  /** Check if a user is involved in a conversation */
  async isUserInvolved(conversationId: string, userId: string): Promise<boolean> {
    const admin = getSupabaseAdmin();
    const { data, error } = await (admin
      .from('conversations') as any)
      .select('buyer_id, seller_id')
      .eq('id', conversationId)
      .single();

    if (error || !data) return false;
    return (data as Record<string, unknown>).buyer_id === userId || (data as Record<string, unknown>).seller_id === userId;
  }
}

export const chatRepository = new ChatRepository();
