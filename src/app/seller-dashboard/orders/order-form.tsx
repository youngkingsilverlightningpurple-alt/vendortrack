"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSupabase } from "@/components/providers/supabase-provider";
import type { Order, UserProfile, ProfileRow, OrderStatus } from "@/types";
import { profileRowToDomain, getErrorMessage } from "@/types";
import { createLogger } from "@/lib/logger";
import { useEffect, useState, useMemo } from "react";
import { Loader2, Truck, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const log = createLogger('order-form');

const orderStatusSchema = z.object({
  status: z.enum(["pending", "shipped", "delivered"]),
  trackingNumber: z.string().optional(),
  carrier: z.string().optional(),
});

type OrderStatusFormValues = z.infer<typeof orderStatusSchema>;

interface OrderFormProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  order?: Order | null;
}

export function OrderForm({ isOpen, onOpenChange, order }: OrderFormProps) {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { if (data) setProfile(profileRowToDomain(data as ProfileRow)); });
    }
  }, [user, supabase]);

  const form = useForm<OrderStatusFormValues>({
    resolver: zodResolver(orderStatusSchema),
    defaultValues: {
      status: "pending",
      trackingNumber: "",
      carrier: "",
    }
  });

  useEffect(() => {
    if (order) {
      form.reset({
        status: order.status as 'pending' | 'shipped' | 'delivered',
        trackingNumber: order.trackingNumber || "",
        carrier: order.carrier || "",
      });
    }
  }, [order, form, isOpen]);

  const availableStatuses = useMemo(() => {
    if (!order) return [];
    if (order.status === "pending") return ["pending", "shipped"];
    if (order.status === "shipped") return ["shipped", "delivered"];
    if (order.status === "delivered") return ["delivered"];
    return [];
  }, [order]);

  const onSubmit = async (data: OrderStatusFormValues) => {
    if (!order) return;

    if (profile?.isDemo) {
        toast({
            title: "Demo Fulfillment Recorded!",
            description: `Order #${order.id.substring(0, 7)} updated in simulation mode.`,
        });
        onOpenChange(false);
        return;
    }

    try {
      const updateData: { status: string; tracking_number?: string; carrier?: string } = { status: data.status };
      if (data.status === 'shipped') {
          updateData.tracking_number = data.trackingNumber;
          updateData.carrier = data.carrier;
      }

      const { error } = await supabase
        .from('orders')
        .update(updateData)
        .eq('id', order.id);

      if (error) throw error;

      toast({ title: "Order logistics updated!" });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Update failed", description: getErrorMessage(error) });
    }
  };

  const showTracking = form.watch("status") === "shipped" || order?.status === "shipped" || order?.status === "delivered";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Update Fulfillment Status
            {profile?.isDemo && <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />}
          </DialogTitle>
          <DialogDescription>
            Manage the delivery lifecycle for order #{order?.id.substring(0, 7)}.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={order?.status === 'delivered'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableStatuses.map((status) => (
                        <SelectItem key={status} value={status} className="capitalize">
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {showTracking && (
                <div className="p-4 bg-primary/5 rounded-lg border border-primary/10 space-y-4">
                    <div className="flex items-center gap-2 text-primary font-bold text-xs uppercase tracking-widest">
                        <Truck className="h-3 w-3" />
                        Shipping Intelligence
                    </div>
                    <FormField
                        control={form.control}
                        name="carrier"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="text-xs">Carrier</FormLabel>
                            <FormControl>
                                <Input placeholder="FedEx" {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                    <FormField
                        control={form.control}
                        name="trackingNumber"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel className="text-xs">Tracking Number</FormLabel>
                            <FormControl>
                                <Input placeholder="1Z999..." {...field} className="h-8 text-sm" />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                    />
                </div>
            )}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">Cancel</Button>
              </DialogClose>
              <Button type="submit" disabled={form.formState.isSubmitting || order?.status === 'delivered'}>
                {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Commit Updates
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
