'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useStripe, useElements, PaymentElement, AddressElement } from '@stripe/react-stripe-js';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { UserProfile, CombinedCartItem } from '@/types';
import { Loader2, ShieldCheck, Lock, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

interface CheckoutViewProps {
  items: CombinedCartItem[];
  userProfile: UserProfile | null;
  subtotal: number;
}

export function CheckoutView({ items, userProfile, subtotal }: CheckoutViewProps) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setMessage(null);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/buyer-orders?payment_success=true`,
        receipt_email: userProfile?.email,
      },
    });

    if (error) {
      const errorMessage = error.message || "An unexpected error occurred.";
      setMessage(errorMessage);
      toast({
        variant: "destructive",
        title: "Payment Failed",
        description: errorMessage,
      });
    }

    setIsProcessing(false);
  };

  if (items.length === 0 && !isProcessing) {
    router.push('/products');
    return null;
  }

  return (
    <form id="payment-form" onSubmit={handleSubmit} className="grid gap-8 md:grid-cols-3">
      <div className="md:col-span-2 space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Shipping & Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <AddressElement id="address-element" options={{ mode: 'shipping' }} />
            <Separator />
            <PaymentElement id="payment-element" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Items in Order</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  {item.product && (
                    <Image
                      src={item.product.imageUrl}
                      alt={item.product.title}
                      width={64}
                      height={64}
                      className="rounded-md object-cover"
                    />
                  )}
                  <div>
                    <p className="font-semibold">{item.product?.title}</p>
                    <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                  </div>
                </div>
                <p className="font-semibold">
                  {item.product ? formatCurrency(item.product.price * item.quantity) : '—'}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <div className="h-fit md:sticky md:top-24 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground text-sm">
              <span>Shipping</span>
              <span>Calculated on next step</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4">
            <Button
              type="submit"
              size="lg"
              className="w-full h-12 text-md font-bold"
              disabled={isProcessing || !stripe || !elements}
            >
              {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Complete Secure Payment'}
            </Button>
            {message && (
              <div id="payment-message" className="text-destructive text-sm text-center pt-2">
                {message}
              </div>
            )}
          </CardFooter>
        </Card>

        {/* Trust Panel */}
        <div className="space-y-4 p-6 rounded-2xl bg-primary/5 border border-primary/10">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest">Stripe Secure</p>
              <p className="text-[10px] text-muted-foreground">256-bit SSL encrypted transaction</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <RotateCcw className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest">Buyer Protection</p>
              <p className="text-[10px] text-muted-foreground">Full refund for non-delivered items</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs font-bold uppercase tracking-widest">Data Privacy</p>
              <p className="text-[10px] text-muted-foreground">PCI-DSS Level 1 payment processing</p>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
