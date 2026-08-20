'use client';

import { useState, useEffect, useRef } from 'react';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { Message, Order } from '@/types';
import { createLogger } from '@/lib/logger';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { encodeHTML, sanitizeChatMessage } from '@/lib/security/sanitize';

const log = createLogger('order-chat');

interface OrderChatProps {
  order: Order;
}

export function OrderChat({ order }: OrderChatProps) {
  const { user, supabase } = useSupabase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationId = order.id;

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      setMessages(data.map(m => ({
        id: m.id,
        conversationId: m.conversation_id,
        senderId: m.sender_id,
        text: m.text,
        createdAt: m.created_at
      })));
    }
    setIsLoading(false);
  };

  useEffect(() => {
    if (!conversationId) return;
    fetchMessages();

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          fetchMessages)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, supabase]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newMessage.trim() || isSending) return;

    // SECURITY: Sanitize chat message before sending
    const sanitizedMessage = sanitizeChatMessage(newMessage);
    if (!sanitizedMessage) return;

    setIsSending(true);
    try {
      // 1. Ensure conversation exists
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .single();

      const convPayload = {
        last_message: sanitizedMessage,
        updated_at: new Date().toISOString(),
      };

      if (!existing) {
        await supabase.from('conversations').insert({
          id: conversationId,
          order_id: order.id,
          buyer_id: order.buyerId,
          seller_id: order.sellerId,
          involved_users: [order.buyerId, order.sellerId],
          ...convPayload
        });
      } else {
        await supabase.from('conversations').update(convPayload).eq('id', conversationId);
      }

      // 2. Send message (sanitized)
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender_id: user.id,
        text: sanitizedMessage,
      });

      setNewMessage('');
    } catch (error: unknown) {
      log.error('Failed to send message:', undefined, error);
    } finally {
      setIsSending(false);
    }
  };

  if (isLoading) return <div className="flex h-[400px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
      <div className="p-4 border-b bg-muted/20">
        <h3 className="font-bold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Support Chat</h3>
        <p className="text-xs text-muted-foreground truncate">Order #{order.id.substring(0, 8)} - {order.productName}</p>
      </div>
      <ScrollArea className="flex-1 p-4">
        {messages.length > 0 ? (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isMe = msg.senderId === user?.id;
              return (
                <div key={msg.id} className={cn("flex flex-col max-w-[80%]", isMe ? "ml-auto items-end" : "mr-auto items-start")}>
                  <div className={cn("rounded-2xl px-4 py-2 text-sm", isMe ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-muted text-foreground rounded-tl-none")}>
                    {/* SECURITY: Encode message text to prevent XSS */}
                    {encodeHTML(msg.text)}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-1 px-1">
                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              );
            })}
            <div ref={scrollRef} />
          </div>
        ) : <p className="text-center text-xs text-muted-foreground py-20">No messages yet. Start the conversation!</p>}
      </ScrollArea>
      <div className="p-4 border-t bg-background">
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <Input value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." disabled={isSending} className="flex-1" />
          <Button type="submit" size="icon" disabled={!newMessage.trim() || isSending}>
            {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
