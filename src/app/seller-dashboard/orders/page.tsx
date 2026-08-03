"use client";

import { useState, useEffect } from "react";
import AuthenticatedLayout from "@/components/layout/authenticated-layout";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Order, OrderRow } from "@/types";
import { orderRowToDomain } from "@/types";
import { createLogger } from "@/lib/logger";
import { DataTable } from "./data-table";
import { getColumns } from "./columns";
import { OrderForm } from "./order-form";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { OrderChat } from "@/components/chat/order-chat";
import { useUnreadMessages } from "@/hooks/use-unread-messages";

const log = createLogger('seller-orders');

const PAGE_SIZE = 10;

export default function OrdersPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [activeChatOrder, setActiveChatOrder] = useState<Order | null>(null);
  
  const { user, supabase } = useSupabase();
  const { unreadIds } = useUnreadMessages();

  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchOrders = async (pageToFetch: number = 0) => {
    if (!user) return;
    
    const loadingSetter = pageToFetch > 0 ? setIsLoadingMore : setIsLoading;
    loadingSetter(true);

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('seller_id', user.id)
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const mappedOrders = (data || []).map(o => orderRowToDomain(o as OrderRow));
      
      setOrders(prev => pageToFetch > 0 ? [...prev, ...mappedOrders] : mappedOrders);
      setPage(pageToFetch);

      if (mappedOrders.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error: unknown) {
      log.error("Error fetching ledger entries:", undefined, error);
    } finally {
      loadingSetter(false);
    }
  };
  
  useEffect(() => {
    if (!isFormOpen && user) {
        fetchOrders(0);
    }
  }, [user, isFormOpen]);

  const handleLoadMore = () => {
    fetchOrders(page + 1);
  };


  const handleEditOrder = (order: Order) => {
    setSelectedOrder(order);
    setIsFormOpen(true);
  };

  const columns = getColumns(handleEditOrder, setActiveChatOrder, unreadIds);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Transactional Ledger</h1>
          <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-100 rounded-full text-[10px] font-bold uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3" />
            Audit Ready
          </div>
        </div>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Sales History</CardTitle>
              <CardDescription>
                Monitor incoming orders and manage the fulfillment lifecycle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                 <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                 </div>
              ) : (
                <>
                  <DataTable columns={columns} data={orders ?? []} />
                  {hasMore && (
                    <div className="mt-4 flex justify-center">
                      <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline" size="sm">
                        {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Load Previous Records
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <OrderForm
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        order={selectedOrder}
      />
      <Sheet open={!!activeChatOrder} onOpenChange={(open) => !open && setActiveChatOrder(null)}>
        <SheetContent className="sm:max-w-md p-0 overflow-hidden flex flex-col">
          {activeChatOrder && <OrderChat order={activeChatOrder} />}
        </SheetContent>
      </Sheet>
    </AuthenticatedLayout>
  );
}
