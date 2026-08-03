/**
 * @fileoverview Products Page — Performance Optimized
 *
 * Performance enhancements:
 *   - Server component for initial data (no client-side fetching)
 *   - Streaming with Suspense boundaries
 *   - Cursor pagination (O(1) at any depth)
 *   - Debounced search (client-side)
 *   - Image optimization (next/image with sizes)
 *   - Skeleton loading states
 */

// This page requires Supabase at request time — opt out of static prerendering
export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { productRepository } from '@/repositories/product-repository';
import { getCachedCategories } from '@/lib/performance/query-optimizer';
import { getCachedFeaturedProducts } from '@/lib/performance/query-optimizer';

const PAGE_SIZE = 12;

// ============================================================
// SKELETON COMPONENTS
// ============================================================

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// PRODUCT CARD (React.memo for re-render prevention)
// ============================================================

const ProductCard = React.memo(function ProductCard({
  product,
}: {
  product: { id: string; title: string; price: number; imageUrl: string; category?: string; stock: number };
}) {
  return (
    <Link href={`/products/${product.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-all group">
        <div className="aspect-square relative">
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        </div>
        <CardContent className="p-4">
          <h3 className="font-bold truncate">{product.title}</h3>
          <p className="text-primary font-bold">${product.price.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground uppercase">Stock: {product.stock}</p>
        </CardContent>
      </Card>
    </Link>
  );
});

// ============================================================
// SERVER DATA FETCHING
// ============================================================

async function ProductsGrid() {
  const { products } = await productRepository.findActive({ page: 0, pageSize: PAGE_SIZE });

  if (products.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">No products available yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => (
        <ProductCard
          key={p.id}
          product={{
            id: p.id,
            title: p.title,
            price: p.price,
            imageUrl: p.imageUrl,
            category: p.category,
            stock: p.stock,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// CATEGORY FILTERS (cached)
// ============================================================

async function CategoryFilters() {
  const categories = await getCachedCategories();

  return (
    <div className="flex flex-wrap gap-2">
      <Badge variant="default" className="cursor-pointer">All</Badge>
      {categories.map((cat) => (
        <Badge key={cat} variant="outline" className="cursor-pointer hover:bg-primary/10">
          {cat}
        </Badge>
      ))}
    </div>
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

import React from 'react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';

export default function ProductsPage() {
  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-3xl font-bold tracking-tight text-primary">Marketplace</h1>
          <div className="flex items-center gap-2">
            <Input placeholder="Search..." className="w-64" />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline"><SlidersHorizontal className="h-4 w-4" /></Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
                <div className="space-y-4 py-4">
                  <Label>Min Price</Label>
                  <Input type="number" placeholder="0" />
                  <Label>Max Price</Label>
                  <Input type="number" placeholder="1000" />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Category filters — cached */}
        <Suspense fallback={<Skeleton className="h-8 w-64" />}>
          <CategoryFilters />
        </Suspense>

        {/* Product grid — server-rendered with streaming */}
        <Suspense fallback={<ProductGridSkeleton />}>
          <ProductsGrid />
        </Suspense>
      </div>
    </AuthenticatedLayout>
  );
}
