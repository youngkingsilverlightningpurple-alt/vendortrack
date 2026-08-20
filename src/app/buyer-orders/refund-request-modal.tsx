'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { Order } from '@/types';
import { getErrorMessage } from '@/types';
import { createLogger } from '@/lib/logger';
import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { requestRefund } from '@/app/actions/buyer-actions';

const log = createLogger('refund-request');

/**
 * Refund Request Modal — Server-Side Authorized
 *
 * SECURITY: Refund requests now go through a server action that
 * verifies the buyer owns the order. A buyer cannot request a
 * refund on another buyer's order.
 */
const refundSchema = z.object({
  reason: z.string().min(10, "Please provide at least 10 characters explaining why you need a refund."),
});

type RefundFormValues = z.infer<typeof refundSchema>;

interface RefundRequestModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  order: Order | null;
}

export function RefundRequestModal({ isOpen, onOpenChange, order }: RefundRequestModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RefundFormValues>({
    resolver: zodResolver(refundSchema),
    defaultValues: { reason: '' },
  });

  const onSubmit = async (data: RefundFormValues) => {
    if (!order) return;

    setIsSubmitting(true);
    try {
      const result = await requestRefund(order.id, data.reason);

      if (result.error) {
        toast({
          variant: "destructive",
          title: "Request Failed",
          description: result.error,
        });
        return;
      }

      toast({
        title: "Refund Requested",
        description: "The request has been submitted for platform review.",
      });
      onOpenChange(false);
      form.reset();
    } catch (error: unknown) {
      log.error("Refund request failed:", undefined, error);
      toast({
        variant: "destructive",
        title: "Request Failed",
        description: getErrorMessage(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request a Refund</DialogTitle>
          <DialogDescription>
            Provide a detailed reason for your refund request for Order #{order?.id.substring(0, 7)}.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-3 text-amber-800 text-sm mb-4">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>Refunds are subject to review. Please provide a clear reason for your refund request.</p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Refund</FormLabel>
                  <FormControl>
                    <Textarea
                        placeholder="e.g. Item arrived damaged, item not as described, etc."
                        className="min-h-[120px]"
                        {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost" disabled={isSubmitting}>
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={isSubmitting} variant="destructive">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
