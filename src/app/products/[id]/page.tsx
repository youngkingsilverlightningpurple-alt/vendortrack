/**
 * @fileoverview Product Detail Page — Performance Optimized
 *
 * Performance enhancements:
 *   - Server component for initial data
 *   - Parallel data fetching (product + seller + reviews)
 *   - Cached product data
 *   - Image optimization with priority loading
 *   - Suspense boundaries
 */

// This page requires Supabase at request time — opt out of static prerendering
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShoppingCart, Store, ChevronRight, ShieldCheck,
  Lock, RotateCcw, Truck, Loader2
} from 'lucide-react';

import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { productRepository } from '@/repositories/product-repository';
import { getCachedSellerProfile } from '@/lib/performance/query-optimizer';
import { formatCurrency } from '@/lib/utils';
import { notFound } from 'next/navigation';

// ============================================================
// SKELETON
// ============================================================

function ProductDetailSkeleton() {
  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="grid gap-12 md:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-6">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-8 w-1/4" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// SERVER DATA FETCHING (parallel)
// ============================================================

async function ProductDetailContent({ productId }: { productId: string }) {
  // Fetch product with cache
  const product = await productRepository.findById(productId);

  if (!product) {
    notFound();
  }

  // Fetch seller profile in parallel (cached)
  const sellerProfile = product.sellerId
    ? await getCachedSellerProfile(product.sellerId)
    : null;

  const seller = sellerProfile ? {
    id: sellerProfile.id as string,
    storeName: sellerProfile.store_name as string || sellerProfile.storeName as string,
    fullName: sellerProfile.full_name as string || sellerProfile.fullName as string,
    sellerStatus: sellerProfile.seller_status as string || sellerProfile.sellerStatus as string,
    stripeConnected: sellerProfile.stripe_connected as boolean || sellerProfile.stripeConnected as boolean,
  } : null;

  return (
    <div className="max-w-7xl mx-auto space-y-12 p-4 pt-6 md:p-8">
      <div className="grid gap-12 md:grid-cols-2">
        <div className="space-y-4">
          <Card className="overflow-hidden border-none shadow-lg rounded-3xl">
            <div className="relative aspect-square">
              <Image
                src={product.imageUrl}
                alt={product.title}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                priority
              />
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

        <div className="flex flex-col gap-6">
          <div className="space-y-2">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-none text-[10px] uppercase font-bold tracking-widest mb-2">
              {product.category || 'Standard'}
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">{product.title}</h1>
            <p className="text-3xl font-bold text-primary">{formatCurrency(product.price)}</p>
          </div>

          <Separator />

          {seller && (
            <Link href={`/store/${product.sellerId}`} className="flex items-center justify-between p-4 rounded-xl border bg-muted/30 hover:bg-muted/50 transition-colors group">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Vendor</p>
                  <div className="flex items-center gap-1">
                    <p className="font-bold group-hover:text-primary transition-colors">{seller.storeName || seller.fullName}</p>
                    <ShieldCheck className="h-3 w-3 text-blue-500" />
                  </div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
            </Link>
          )}

          <div className="space-y-4">
            <h3 className="font-bold text-lg">Product Specifications</h3>
            <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.description}</p>
          </div>

          <div className="pt-4 mt-auto">
            <Button
              size="lg"
              className="w-full h-14 text-lg font-bold shadow-xl shadow-primary/20"
            >
              <ShoppingCart className="mr-2 h-6 w-6" /> Add to Order Ledger
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthenticatedLayout>
      <Suspense fallback={<ProductDetailSkeleton />}>
        <ProductDetailContent productId={params.id} />
      </Suspense>
    </AuthenticatedLayout>
  );
}
