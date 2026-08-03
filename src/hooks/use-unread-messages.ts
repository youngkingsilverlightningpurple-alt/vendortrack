'use client';

import { useMemo, useEffect, useState } from 'react';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { Conversation } from '@/types';

export function useUnreadMessages() {
  const { user, supabase } = useSupabase();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    }

    const fetchConversations = async () => {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .contains('involved_users', [user.id]);
        
        if (!error && data) {
            setConversations(data.map(c => ({
                id: c.id,
                orderId: c.order_id,
                buyerId: c.buyer_id,
                sellerId: c.seller_id,
                involvedUsers: c.involved_users,
                lastMessage: c.last_message,
                updatedAt: c.updated_at,
                lastReadAt: c.last_read_at
            })) as Conversation[]);
        }
        setIsLoading(false);
    };

    fetchConversations();

    const channel = supabase
      .channel('unread-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, fetchConversations)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, supabase]);

  const unreadConversationIds = useMemo(() => {
    if (!conversations || !user) return new Set<string>();

    return new Set(
      conversations
        .filter((conv) => {
          const userLastRead = conv.lastReadAt?.[user.id];
          if (!userLastRead) return true;
          
          return new Date(conv.updatedAt) > new Date(userLastRead);
        })
        .map((conv) => conv.id)
    );
  }, [conversations, user]);

  return {
    unreadIds: unreadConversationIds,
    count: unreadConversationIds.size,
    isLoading,
  };
}
