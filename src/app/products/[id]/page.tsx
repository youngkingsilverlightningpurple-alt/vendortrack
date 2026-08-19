'use client';

/**
 * @fileoverview Product Detail Page
 *
 * Features:
 *   - Server-like data fetching via Supabase
 *   - Functional "Add to Cart" button
 *   - Responsive layout
 *   - Skeleton loading
 */

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShoppingCart, Store, ChevronRight, ShieldCheck,
  Lock, RotateCcw, Truck, Loader2, Minus, Plus, CheckCircle2
} from 'lucide-react';

import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useSupabase } from '@/components/providers/supabase-provider';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';
import { notFound, useRouter } from 'next/navigation';

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();
  const router = useRouter();

  const [product, setProduct] = useState<{
    id: string; title: string; price: number; imageUrl: string;
    description: string; category?: string; stock: number; sellerId?: string;
  } | null>(null);
  const [seller, setSeller] = useState<{
    id: string; storeName: string; fullName: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [isAdding, setIsAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const { data: pData } = await supabase
          .from('products')
          .select('id, title, price, image_url, description, category, stock, seller_id')
          .eq('id', params.id)
          .single();

        if (!pData) { notFound(); return; }

        setProduct({
          id: pData.id,
          title: pData.title,
          price: pData.price,
          imageUrl: pData.image_url,
          description: pData.description,
          category: pData.category,
          stock: pData.stock,
          sellerId: pData.seller_id,
        });

        if (pData.seller_id) {
          const { data: sData } = await supabase
            .from('profiles')
            .select('id, store_name, full_name')
            .eq('id', pData.seller_id)
            .single();
          if (sData) {
            setSeller({
              id: sData.id,
              storeName: sData.store_name || sData.full_name,
              fullName: sData.full_name,
            });
          }
        }
      } catch {
        notFound();
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [params.id, supabase]);

  const handleAddToCart = async () => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please sign in to add items to your cart.' });
      router.push('/login');
      return;
    }
    if (!product) return;
    setIsAdding(true);
    try {
      const { data: existing } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', product.id)
        .single();

      if (existing) {
        await supabase.from('cart_items').update({ quantity: existing.quantity + quantity }).eq('id', existing.id);
      } else {
        await supabase.from('cart_items').insert({ user_id: user.id, product_id: product.id, quantity });
      }
      setAdded(true);
      toast({ title: 'Added to cart', description: `${quantity} × ${product.title} added to your cart.` });
      setTimeout(() => setAdded(false), 2000);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not add item to cart.' });
    } finally {
      setIsAdding(false);
    }
  };

  if (isLoading) {
    return (
      <AuthenticatedLayout>
        <div className="max-w-7xl mx-auto p-4 pt-6 md:p-8">
          <div className="grid gap-8 md:grid-cols-2">
            <Skeleton className="aspect-square w-full rounded-2xl" />
            <div className="space-y-4">
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-8 w-1/4" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  if (!product) return notFound();

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto space-y-8 p-4 pt-6 md:p-8">
        <div className="grid gap-8 md:grid-cols-2">
          <div className="space-y-4">
            <Card className="overflow-hidden border-slate-200/80 shadow-sm rounded-2xl">
              <div className="relative aspect-square bg-slate-100">
                <Image
                  src={product.imageUrl}
                  alt={product.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
                {product.stock === 0 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white font-bold uppercase tracking-wider">Out of Stock</span>
                  </div>
                )}
              </div>
            </Card>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/30 border border-border/50">
                <Lock className="h-4 w-4 text-primary mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Secure Pay</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/30 border border-border/50">
                <Truck className="h-4 w-4 text-primary mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Tracked</span>
              </div>
              <div className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/30 border border-border/50">
                <RotateCcw className="h-4 w-4 text-primary mb-1" />
                <span className="text-[10px] font-bold uppercase tracking-tighter">Refundable</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            <div className="space-y-2">
              {product.category && (
                <Badge variant="secondary" className="bg-primary/8 text-primary border-none text-[10px] uppercase font-bold tracking-widest">
                  {product.category}
                </Badge>
              )}
              <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900">{product.title}</h1>
              <p className="text-2xl font-bold text-primary">{formatCurrency(product.price)}</p>
            </div>

            <Separator />

            {seller && (
              <Link href={`/store/${seller.id}`} className="flex items-center justify-between p-3 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Store className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Seller</p>
                    <div className="flex items-center gap-1">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{seller.storeName}</p>
                      <ShieldCheck className="h-3 w-3 text-blue-500" />
                    </div>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}

            <div className="space-y-3">
              <h3 className="font-bold">Description</h3>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap text-sm">{product.description}</p>
            </div>

            {product.stock > 0 && (
              <div className="space-y-3">
                <h3 className="font-bold text-sm">Quantity</h3>
                <div className="flex items-center gap-3">
                  <div className="flex items-center border rounded-lg">
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setQuantity(Math.max(1, quantity - 1))} disabled={quantity <= 1}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-10 text-center font-semibold">{quantity}</span>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setQuantity(Math.min(product.stock, quantity + 1))} disabled={quantity >= product.stock}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground">{product.stock} in stock</span>
                </div>
              </div>
            )}

            <div className="pt-4 mt-auto space-y-3">
              <Button
                size="lg"
                className="w-full h-13 text-base font-semibold shadow-lg shadow-primary/10"
                onClick={handleAddToCart}
                disabled={isAdding || product.stock === 0 || added}
              >
                {added ? (
                  <><CheckCircle2 className="mr-2 h-5 w-5" /> Added to Cart</>
                ) : isAdding ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Adding...</>
                ) : product.stock === 0 ? (
                  'Out of Stock'
                ) : (
                  <><ShoppingCart className="mr-2 h-5 w-5" /> Add to Cart</>
                )}
              </Button>
              {added && (
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/cart">View Cart</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
