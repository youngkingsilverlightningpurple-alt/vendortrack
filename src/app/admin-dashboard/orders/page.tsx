'use client';

import { useState, useEffect } from 'react';
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
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Package, Loader2, Zap } from 'lucide-react';

const log = createLogger('admin-orders');

const PAGE_SIZE = 20;

export default function AdminOrdersPage() {
  const { user, supabase } = useSupabase();
  const { toast } = useToast();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchOrders = async (pageToFetch: number = 0) => {
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
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const orderList = (data || []).map((o: Record<string, unknown>) => {
        const buyer = o.buyer as { email?: string; full_name?: string } | null;
        return orderRowToDomain({
          ...o,
          buyer_name: buyer?.full_name ?? buyer?.email?.split('@')[0] ?? 'Unknown buyer',
        } as OrderRow);
      });

      setOrders(prev => pageToFetch > 0 ? [...prev, ...orderList] : orderList);
      setPage(pageToFetch);

      if (orderList.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Failed to fetch platform orders:", undefined, error);
      toast({
        variant: "destructive",
        title: "Fetch error",
        description: "Could not load global order history."
      });
    } finally {
      loadingSetter(false);
    }
  };

  useEffect(() => {
    fetchOrders(0);
  }, []);

  const handleLoadMore = () => {
    fetchOrders(page + 1);
  };

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Global Orders</h1>
            <p className="text-sm text-muted-foreground">Monitor every transaction across the platform.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchOrders(0)} disabled={isLoading}>
            Refresh
          </Button>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>All Orders</CardTitle>
                <CardDescription>A real-time view of platform financial activity.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Order ID</TableHead>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Total</TableHead>
                                        <TableHead>Fee (10%)</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                                <Package className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                                No orders recorded yet.
                                            </TableCell>
                                        </TableRow>
                                    ) : orders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-muted/30">
                                            <TableCell className="font-mono text-xs">
                                                #{order.id.substring(0, 8)}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-semibold text-sm truncate max-w-[180px]">{order.productName}</span>
                                                    <span className="text-[10px] text-muted-foreground">Qty: {order.quantity}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-bold text-slate-900">{formatCurrency((order.amountCents || 0) / 100)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-medium text-primary">{formatCurrency((order.commissionCents || 0) / 100)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={order.status === 'delivered' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                                                    {order.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {order.createdAt ? format(new Date(order.createdAt), 'MMM d, yyyy') : 'N/A'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline">
                                    {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Load More
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}