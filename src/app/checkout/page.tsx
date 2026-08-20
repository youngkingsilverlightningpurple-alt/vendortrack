'use client';

// This page requires Stripe at request time — opt out of static prerendering
// to prevent build failure when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is absent.
export const dynamic = 'force-dynamic';

import { useMemo, useState, useEffect } from 'react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { CartItem, Product, UserProfile, CombinedCartItem, CartItemRow, ProfileRow, ProductRow } from '@/types';
import { cartItemRowToDomain, profileRowToDomain, productRowToDomain, getErrorMessage } from '@/types';
import { CheckoutView } from './checkout-view';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, CreditCard, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

// Graceful: loadStripe only if key is available
const stripePromise = stripePublishableKey
  ? import('@stripe/stripe-js').then(({ loadStripe }) => loadStripe(stripePublishableKey))
  : null;

// Dynamic import for Elements — only loaded if Stripe is configured
let ElementsComponent: React.ComponentType<any> | null = null;
if (stripePublishableKey) {
  // Will be loaded dynamically below
  ElementsComponent = null;
}

export default function CheckoutPage() {
  const { user, supabase, isAvailable } = useSupabase();
  const { toast } = useToast();

  const [clientSecret, setClientSecret] = useState<string>('');
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [Elements, setElements] = useState<React.ComponentType<any> | null>(null);

  // Load Stripe Elements dynamically
  useEffect(() => {
    if (stripePublishableKey) {
      import('@stripe/react-stripe-js').then(({ Elements }) => {
        setElements(() => Elements);
      }).catch(() => {
        // Stripe Elements failed to load
      });
    }
  }, []);

  useEffect(() => {
    if (!user || !supabase || !isAvailable) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [pRes, cRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).single(),
          supabase.from('cart_items').select('*').eq('user_id', user.id)
        ]);

        if (pRes.data) setUserProfile(profileRowToDomain(pRes.data as ProfileRow));

        if (cRes.data && cRes.data.length > 0) {
          const items = (cRes.data as CartItemRow[]).map(cartItemRowToDomain);
          setCartItems(items);

          const pIds = items.map(i => i.productId);
          const { data: pData } = await supabase.from('products').select('*').in('id', pIds);

          if (pData) {
            const mappedProducts = (pData as ProductRow[]).map(productRowToDomain);
            setProducts(mappedProducts);

            // Create Payment Session via API
            const response = await fetch('/api/checkout/create-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                items: items.map(i => ({ productId: i.productId, quantity: i.quantity }))
              })
            });

            const result = await response.json();
            if (result.clientSecret) {
              setClientSecret(result.clientSecret);
            } else {
              throw new Error(result.error || 'Failed to initialize session');
            }
          }
        }
      } catch (error: unknown) {
        toast({
          variant: "destructive",
          title: "Session Error",
          description: getErrorMessage(error) || "Could not initialize secure checkout."
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, supabase, isAvailable, toast]);

  const combinedItems = useMemo((): CombinedCartItem[] => {
    return cartItems.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return { ...item, product };
    }).filter((item): item is CombinedCartItem & { product: Product } => item.product !== undefined);
  }, [cartItems, products]);

  const subtotal = combinedItems.reduce((acc, item) => acc + (item.product?.price || 0) * item.quantity, 0);

  // Graceful: Show Stripe unavailable message
  if (!stripePublishableKey) {
    return (
      <AuthenticatedLayout>
        <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Secure Checkout</h1>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Payment Service Unavailable</AlertTitle>
            <AlertDescription>
              Stripe is not configured. Payment processing is currently disabled.
              Please contact the site administrator or try again later.
            </AlertDescription>
          </Alert>
          <div className="text-center py-20 border-2 border-dashed rounded-3xl">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-bold">Checkout Unavailable</h3>
            <p className="text-muted-foreground mt-2">Payment processing has not been configured for this environment.</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="max-w-7xl mx-auto p-8 grid gap-8 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <Skeleton className="h-48 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <h1 className="text-3xl font-bold tracking-tight text-primary">Secure Checkout</h1>
        {clientSecret && Elements && stripePromise ? (
          <Elements options={{ clientSecret, appearance: { theme: 'stripe' } }} stripe={stripePromise}>
            <CheckoutView items={combinedItems} userProfile={userProfile} subtotal={subtotal} />
          </Elements>
        ) : (
          <div className="text-center py-20 border-2 border-dashed rounded-3xl">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-xl font-bold">Your cart is empty</h3>
            <p className="text-muted-foreground mt-2">Add items to your cart to start checkout.</p>
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
