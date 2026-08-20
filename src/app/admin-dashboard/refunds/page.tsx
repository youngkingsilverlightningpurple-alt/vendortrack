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
import { orderRowToDomain, getErrorMessage } from '@/types';
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
import { AlertCircle, CheckCircle2, XCircle, Loader2, Info, ShieldCheck, AlertTriangle } from 'lucide-react';
import { processRefundDecision } from '@/app/actions/admin-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const log = createLogger('admin-refunds');

const PAGE_SIZE = 20;

export default function AdminRefundsPage() {
  const { supabase } = useSupabase();
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  // P0 FIX (war room): confirmation modal state for "Approve & Refund".
  // The audit identified that the previous implementation triggered a real
  // Stripe refund (real money movement) on a single click with no
  // confirmation. Now the admin must:
  //   1. Open the modal (click "Approve & Refund")
  //   2. See order ID, amount, buyer email
  //   3. Type "REFUND" to confirm
  //   4. Click "Confirm Refund" (button disabled until text matches)
  const [refundConfirmation, setRefundConfirmation] = useState<{
    orderId: string;
    amount: number;
    buyerEmail: string;
    reason: string;
  } | null>(null);
  const [confirmationText, setConfirmationText] = useState('');

  const fetchRefundRequests = async (pageToFetch: number = 0) => {
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
        .eq('refund_status', 'requested')
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const refundList = (data || []).map((o: Record<string, unknown>) => {
        const buyer = o.buyer as { email?: string; full_name?: string } | null;
        return orderRowToDomain({
          ...o,
          buyer_name: buyer?.full_name ?? buyer?.email?.split('@')[0] ?? 'Unknown buyer',
        } as OrderRow);
      });

      setOrders(prev => pageToFetch > 0 ? [...prev, ...refundList] : refundList);
      setPage(pageToFetch);

      if (refundList.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Failed to fetch refund requests:", undefined, error);
      toast({
        variant: "destructive",
        title: "Fetch failed",
        description: "Could not load pending disputes."
      });
    } finally {
      loadingSetter(false);
    }
  };

  useEffect(() => {
    fetchRefundRequests(0);
  }, []);

  const handleProcessRefund = async (orderId: string, decision: 'approved' | 'rejected') => {
    setProcessingId(orderId);
    try {
      // ENTERPRISE: Use the server action which calls Stripe Refund API
      // No refund may exist in the database unless Stripe confirms it.
      const result = await processRefundDecision(orderId, decision);

      if (result.error) {
        throw new Error(result.error);
      }

      if (decision === 'approved' && 'stripeRefundId' in result && result.stripeRefundId) {
        toast({
          title: "Refund Approved & Processed",
          description: `Stripe refund ${result.stripeRefundId} created for $${((result.refundAmount || 0) / 100).toFixed(2)}. Trace: ${result.traceId}`,
        });
      } else if (decision === 'approved') {
        toast({
          title: "Refund Approved",
          description: `The request for Order #${orderId.substring(0, 7)} has been processed.`,
        });
      } else {
        toast({
          title: "Refund Rejected",
          description: `The request for Order #${orderId.substring(0, 7)} has been rejected.`,
        });
      }

      setOrders(prev => prev.filter(o => o.id !== orderId));
    } catch (error: unknown) {
      log.error("Refund processing failed:", undefined, error);
      toast({
        variant: "destructive",
        title: "Process Failed",
        description: getErrorMessage(error) || "Could not complete refund action. The Stripe API may be unavailable.",
      });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Refund Management</h1>
            <p className="text-sm text-muted-foreground">Review and resolve buyer-initiated refund claims. Approvals trigger Stripe reversals automatically.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchRefundRequests(0)} disabled={isLoading}>
            Refresh Requests
          </Button>
        </div>

        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-200">
          <ShieldCheck className="h-4 w-4 text-green-600" />
          <p className="text-xs text-green-700">
            <strong>Enterprise Refund Processing:</strong> All approved refunds now call the Stripe Refund API before updating the database.
            No refund may exist in the database unless Stripe confirms it.
          </p>
        </div>

        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                    Pending Disputes
                </CardTitle>
                <CardDescription>
                    Review the reason for each claim. Approving a refund will automatically trigger a Stripe reversal and create a financial ledger entry.
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
                    <div className="space-y-4">
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Order Details</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Buyer Reason</TableHead>
                                        <TableHead>Date Requested</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {orders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle2 className="h-8 w-8 text-green-500/50" />
                                                    <p>All refund requests have been resolved.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ) : orders.map((order) => (
                                        <TableRow key={order.id} className="hover:bg-muted/30">
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium text-xs font-mono">#{order.id.substring(0, 7)}</span>
                                                    <span className="text-sm font-semibold">{order.productName}</span>
                                                    <span className="text-[10px] text-muted-foreground">Customer: {order.buyerName}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-bold text-primary">{formatCurrency((order.amountCents || 0) / 100)}</span>
                                            </TableCell>
                                            <TableCell className="max-w-xs">
                                                <div className="flex items-start gap-2 bg-amber-50 p-2 rounded text-xs text-amber-900 italic border border-amber-100">
                                                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                                    "{order.refundReason}"
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {order.createdAt ? format(new Date(order.createdAt), 'MMM d, yyyy') : 'N/A'}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="h-8 text-xs text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleProcessRefund(order.id, 'rejected')}
                                                        disabled={!!processingId}
                                                    >
                                                        {processingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1" />}
                                                        Reject
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                                                        // P0 FIX (war room): open confirmation modal instead of
                                                        // immediately calling handleProcessRefund. Real money movement
                                                        // must require typed confirmation.
                                                        onClick={() => {
                                                          setRefundConfirmation({
                                                            orderId: order.id,
                                                            amount: order.amountCents,
                                                            buyerEmail: order.buyerName ?? 'unknown',
                                                            reason: order.refundReason ?? '',
                                                          });
                                                          setConfirmationText('');
                                                        }}
                                                        disabled={!!processingId}
                                                    >
                                                        {processingId === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                                                        Approve & Refund
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <Button onClick={() => fetchRefundRequests(page + 1)} disabled={isLoadingMore} variant="outline">
                                    {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Load More Requests
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>

        {/*
          P0 FIX (war room): Refund confirmation modal.
          Requires the admin to type "REFUND" to confirm before the
          `processRefundDecision(orderId, 'approved')` server action is
          called — which triggers a real Stripe refund.
        */}
        <Dialog
          open={refundConfirmation !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRefundConfirmation(null);
              setConfirmationText('');
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Confirm Refund
              </DialogTitle>
              <DialogDescription>
                This action will issue a real Stripe refund. The funds will be
                debited from the seller's Stripe account and returned to the
                buyer's original payment method. This cannot be undone.
              </DialogDescription>
            </DialogHeader>

            {refundConfirmation && (
              <div className="space-y-3 py-2">
                <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order ID:</span>
                    <code className="font-mono text-xs">{refundConfirmation.orderId.substring(0, 8)}…</code>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Refund Amount:</span>
                    <span className="font-semibold">{formatCurrency(refundConfirmation.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-mono text-xs">{refundConfirmation.buyerEmail}</span>
                  </div>
                  {refundConfirmation.reason && (
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground text-xs">Reason:</span>
                      <p className="text-xs italic mt-1">"{refundConfirmation.reason}"</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-text" className="text-sm font-medium">
                    Type <code className="font-mono font-bold">REFUND</code> to confirm:
                  </Label>
                  <Input
                    id="confirm-text"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="REFUND"
                    autoComplete="off"
                    className="font-mono"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setRefundConfirmation(null);
                  setConfirmationText('');
                }}
                disabled={!!processingId}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                disabled={confirmationText !== 'REFUND' || !!processingId}
                onClick={() => {
                  if (!refundConfirmation) return;
                  if (confirmationText !== 'REFUND') return;
                  handleProcessRefund(refundConfirmation.orderId, 'approved');
                  setRefundConfirmation(null);
                  setConfirmationText('');
                }}
              >
                {processingId === refundConfirmation?.orderId ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Confirm Refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AuthenticatedLayout>
  );
}
