'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { CartItemControls } from '@/components/cart-item-controls';
import type { CombinedCartItem } from '@/types';
import { formatCurrency } from '@/lib/utils';

interface CartViewProps {
  items: CombinedCartItem[];
  isLoading: boolean;
}

export function CartView({ items, isLoading }: CartViewProps) {
  const subtotal = items.reduce((acc, item) => {
    return acc + (item.product?.price || 0) * item.quantity;
  }, 0);

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-4">
                <Skeleton className="h-24 w-24" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-1/4" />
                </div>
              </div>
              <Separator />
              <div className="flex gap-4">
                <Skeleton className="h-24 w-24" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-1/4" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <Skeleton className="h-8 w-24" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-12 w-full" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-10">
        <h2 className="text-2xl font-bold">Your cart is empty</h2>
        <p className="text-muted-foreground mt-2">Looks like you haven't added anything to your cart yet.</p>
        <Button asChild className="mt-6">
          <Link href="/products">Start Shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-3">
      <div className="md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Your Cart ({items.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {items.map((item, index) => (
                <div key={item.id}>
                  <div className="flex items-start gap-4">
                    <div className="relative h-24 w-24 flex-shrink-0">
                      {item.product && (
                        <Image
                          src={item.product.imageUrl}
                          alt={item.product.title}
                          fill
                          className="rounded-md object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold">{item.product?.title || 'Loading...'}</h3>
                      <p className="text-lg font-bold text-primary">
                        {item.product ? formatCurrency(item.product.price) : <Skeleton className="h-7 w-20 mt-1" />}
                      </p>
                      <CartItemControls cartItem={item} />
                    </div>
                    <p className="text-lg font-semibold">
                      {item.product ? formatCurrency(item.product.price * item.quantity) : <Skeleton className="h-7 w-24" />}
                    </p>
                  </div>
                  {index < items.length - 1 && <Separator className="mt-6" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="h-fit md:sticky md:top-24">
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="font-semibold">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
          </CardContent>
          <CardFooter>
            <Button size="lg" className="w-full" asChild>
              <Link href="/checkout">Proceed to Checkout</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
