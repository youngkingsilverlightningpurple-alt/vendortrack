'use client';

import { useState, useEffect, useMemo } from 'react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { CartItem, Product, CartItemRow, ProductRow, CombinedCartItem } from '@/types';
import { cartItemRowToDomain, productRowToDomain } from '@/types';
import { CartView } from './cart-view';
import { createLogger } from '@/lib/logger';

const log = createLogger('cart-page');

export default function CartPage() {
  const { user, supabase } = useSupabase();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchCart = async () => {
      setIsLoading(true);
      try {
        const { data: cData } = await supabase
          .from('cart_items')
          .select('*')
          .eq('user_id', user.id);

        if (cData) {
          const items = (cData as CartItemRow[]).map(cartItemRowToDomain);
          setCartItems(items);

          const pIds = items.map(i => i.productId);
          if (pIds.length > 0) {
            const { data: pData } = await supabase
              .from('products')
              .select('*')
              .in('id', pIds);

            if (pData) {
              setProducts((pData as ProductRow[]).map(productRowToDomain));
            }
          }
        }
      } catch (error: unknown) {
        log.error('Cart fetch error', { action: 'fetch-cart' }, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCart();
  }, [user, supabase]);

  const combinedItems = useMemo((): CombinedCartItem[] => {
    return cartItems.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      return { ...item, product };
    }).filter((item): item is CombinedCartItem & { product: Product } => item.product !== undefined);
  }, [cartItems, products]);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shopping Cart</h1>
        <p className="text-sm text-muted-foreground mb-6">Review your items before checkout.</p>
        <CartView items={combinedItems} isLoading={isLoading} />
      </div>
    </AuthenticatedLayout>
  );
}
