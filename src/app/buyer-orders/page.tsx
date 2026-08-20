
'use client';

import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { Order, OrderRow } from '@/types';
import { orderRowToDomain } from '@/types';
import { createLogger } from '@/lib/logger';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable } from './orders-data-table';
import { getColumns } from './orders-columns';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Loader2, Database, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { OrderChat } from '@/components/chat/order-chat';
import { useUnreadMessages } from '@/hooks/use-unread-messages';
import { RefundRequestModal } from './refund-request-modal';

const log = createLogger('buyer-orders');

const PAGE_SIZE = 10;

export default function BuyerOrdersPage() {
  return (
    <Suspense fallback={<div className="flex-1 space-y-4 p-4 pt-6 md:p-8"><Skeleton className="h-12 w-full" /></div>}>
      <BuyerOrdersContent />
    </Suspense>
  );
}

function BuyerOrdersContent() {
  const { user, supabase } = useSupabase();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { unreadIds } = useUnreadMessages();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    if (paymentSuccess) {
      toast({
        title: "Payment Successful",
        description: "Your order has been confirmed and the seller is preparing it for shipment.",
      });
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [searchParams, toast]);

  const fetchOrders = async (pageToFetch: number = 0) => {
    if (!user) return;
    
    const loadingSetter = pageToFetch > 0 ? setIsLoadingMore : setIsLoading;
    loadingSetter(true);

    try {
      // P0 FIX (war room): JOIN profiles on buyer_id to populate buyer_name.
      // See seller-dashboard/orders/page.tsx for the full rationale.
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          buyer:profiles!orders_buyer_id_fkey(email, full_name)
        `)
        .eq('buyer_id', user.id)
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const mappedOrders = (data || []).map((o: Record<string, unknown>) => {
        const buyer = o.buyer as { email?: string; full_name?: string } | null;
        return orderRowToDomain({
          ...o,
          buyer_name: buyer?.full_name ?? buyer?.email?.split('@')[0] ?? 'Unknown buyer',
        } as OrderRow);
      });

      setOrders(prev => pageToFetch > 0 ? [...prev, ...mappedOrders] : mappedOrders);
      setPage(pageToFetch);

      if (mappedOrders.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Failed to load orders:", undefined, error);
    } finally {
      setIsLoading(false);
      loadingSetter(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchOrders(0);
    }
  }, [user]);

  const handleLoadMore = () => {
    fetchOrders(page + 1);
  };

  const handleRequestRefund = (order: Order) => {
    setRefundOrder(order);
    setIsRefundModalOpen(true);
  };

  const columns = getColumns(setActiveChatOrder, handleRequestRefund, unreadIds);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-primary">My Orders</h1>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-[10px] font-bold uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3" />
            Order History
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>
              Track your purchases and their fulfillment status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : orders && orders.length > 0 ? (
              <>
                <DataTable columns={columns} data={orders} />
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline" size="sm">
                      {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load More
                    </Button>
                  </div>
                )}
              </>
            ) : (
                <div className="text-center py-20 border-2 border-dashed rounded-3xl">
                    <Database className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-xl font-bold">No orders yet</h3>
                    <p className="text-muted-foreground mt-2 max-w-xs mx-auto text-sm">You haven't placed any orders yet. Browse the marketplace to find your first item.</p>
                    <Button asChild className="mt-6" size="lg">
                        <Link href="/products">Browse Products</Link>
                    </Button>
                </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={!!activeChatOrder} onOpenChange={(open) => !open && setActiveChatOrder(null)}>
        <SheetContent className="sm:max-w-md p-0 overflow-hidden flex flex-col">
          {activeChatOrder && <OrderChat order={activeChatOrder} />}
        </SheetContent>
      </Sheet>

      <RefundRequestModal 
        isOpen={isRefundModalOpen} 
        onOpenChange={setIsRefundModalOpen} 
        order={refundOrder} 
      />
    </AuthenticatedLayout>
  );
}
