'use client';

/**
 * @fileoverview Products Page (Marketplace) — Client Component
 *
 * Features:
 *   - Debounced search with real-time filtering
 *   - Category filters from server cache
 *   - Price range filters
 *   - Responsive grid layout
 *   - Skeleton loading states
 *   - Functional "Add to Cart" on each card
 */

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, SlidersHorizontal, X, ShoppingCart, Loader2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSupabase } from '@/components/providers/supabase-provider';
import { useToast } from '@/hooks/use-toast';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { formatCurrency } from '@/lib/utils';
import React from 'react';

const PAGE_SIZE = 12;

// ============================================================
// SKELETON
// ============================================================

function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
// PRODUCT CARD
// ============================================================

const ProductCard = React.memo(function ProductCard({
  product,
  onAddToCart,
  isAdding,
}: {
  product: { id: string; title: string; price: number; imageUrl: string; category?: string; stock: number };
  onAddToCart: (id: string) => void;
  isAdding: boolean;
}) {
  return (
    <Card className="overflow-hidden hover:shadow-md transition-all group border-slate-200/80">
      <Link href={`/products/${product.id}`}>
        <div className="aspect-square relative bg-slate-100">
          <Image
            src={product.imageUrl}
            alt={product.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
          {product.stock === 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-bold text-sm uppercase tracking-wider">Out of Stock</span>
            </div>
          )}
        </div>
      </Link>
      <CardContent className="p-4">
        <Link href={`/products/${product.id}`}>
          <h3 className="font-semibold truncate text-slate-900 mb-1">{product.title}</h3>
        </Link>
        <div className="flex items-center justify-between">
          <span className="text-primary font-bold">{formatCurrency(product.price)}</span>
          {product.stock > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-slate-400 hover:text-primary"
              onClick={(e) => { e.preventDefault(); onAddToCart(product.id); }}
              disabled={isAdding}
            >
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {product.category && (
          <Badge variant="secondary" className="mt-2 text-[10px] font-medium">{product.category}</Badge>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================
// MAIN PAGE
// ============================================================

export default function ProductsPage() {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();

  const [products, setProducts] = useState<Array<{
    id: string; title: string; price: number; imageUrl: string; category?: string; stock: number;
  }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [addingToCart, setAddingToCart] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        let query = supabase
          .from('products')
          .select('id, title, price, image_url, category, stock')
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(PAGE_SIZE);

        if (debouncedQuery) {
          query = query.ilike('title', `%${debouncedQuery}%`);
        }
        if (selectedCategory) {
          query = query.eq('category', selectedCategory);
        }
        if (minPrice) {
          query = query.gte('price', parseFloat(minPrice));
        }
        if (maxPrice) {
          query = query.lte('price', parseFloat(maxPrice));
        }

        const { data } = await query;
        if (data) {
          setProducts(data.map(p => ({
            id: p.id,
            title: p.title,
            price: p.price,
            imageUrl: p.image_url,
            category: p.category,
            stock: p.stock,
          })));
        }

        // Fetch categories if not yet loaded
        if (categories.length === 0) {
          const { data: catData } = await supabase
            .from('products')
            .select('category')
            .eq('status', 'active')
            .not('category', 'is', null);
          if (catData) {
            const uniqueCats = [...new Set(catData.map(c => c.category).filter(Boolean))] as string[];
            setCategories(uniqueCats);
          }
        }
      } catch (error) {
        console.error('Failed to fetch products:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProducts();
  }, [supabase, debouncedQuery, selectedCategory, minPrice, maxPrice, categories.length]);

  // Add to cart
  const handleAddToCart = useCallback(async (productId: string) => {
    if (!user) {
      toast({ variant: 'destructive', title: 'Sign in required', description: 'Please sign in to add items to your cart.' });
      return;
    }
    setAddingToCart(productId);
    try {
      const { data: existing } = await supabase
        .from('cart_items')
        .select('id, quantity')
        .eq('user_id', user.id)
        .eq('product_id', productId)
        .single();

      if (existing) {
        await supabase.from('cart_items').update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
      } else {
        await supabase.from('cart_items').insert({ user_id: user.id, product_id: productId, quantity: 1 });
      }
      toast({ title: 'Added to cart', description: 'Item has been added to your cart.' });
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not add item to cart.' });
    } finally {
      setAddingToCart(null);
    }
  }, [user, supabase, toast]);

  const activeFilters = useMemo(() => {
    const count = (selectedCategory ? 1 : 0) + (minPrice ? 1 : 0) + (maxPrice ? 1 : 0);
    return count;
  }, [selectedCategory, minPrice, maxPrice]);

  const clearFilters = useCallback(() => {
    setSelectedCategory(null);
    setMinPrice('');
    setMaxPrice('');
  }, []);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Marketplace</h1>
            <p className="text-sm text-muted-foreground">{products.length} products available</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                className="w-full sm:w-64 pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="relative">
                  <SlidersHorizontal className="h-4 w-4" />
                  {activeFilters > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] text-white flex items-center justify-center font-bold">{activeFilters}</span>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="space-y-6 py-6">
                  {categories.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-xs font-bold uppercase tracking-wider">Category</Label>
                      <div className="flex flex-wrap gap-2">
                        <Badge
                          variant={selectedCategory === null ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => setSelectedCategory(null)}
                        >All</Badge>
                        {categories.map(cat => (
                          <Badge
                            key={cat}
                            variant={selectedCategory === cat ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                          >{cat}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-3">
                    <Label className="text-xs font-bold uppercase tracking-wider">Price Range</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Min ($)</Label>
                        <Input type="number" placeholder="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Max ($)</Label>
                        <Input type="number" placeholder="1000" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} />
                      </div>
                    </div>
                  </div>
                </div>
                <SheetFooter>
                  <Button variant="outline" className="w-full" onClick={clearFilters}>Clear Filters</Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {activeFilters > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Active filters:</span>
            {selectedCategory && (
              <Badge variant="secondary" className="gap-1">
                {selectedCategory}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCategory(null)} />
              </Badge>
            )}
            {minPrice && (
              <Badge variant="secondary" className="gap-1">
                Min: ${minPrice}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setMinPrice('')} />
              </Badge>
            )}
            {maxPrice && (
              <Badge variant="secondary" className="gap-1">
                Max: ${maxPrice}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setMaxPrice('')} />
              </Badge>
            )}
            <button className="text-xs text-primary hover:underline" onClick={clearFilters}>Clear all</button>
          </div>
        )}

        {isLoading ? (
          <ProductGridSkeleton />
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No products found</h3>
            <p className="text-muted-foreground text-sm">
              {debouncedQuery || activeFilters > 0
                ? 'Try adjusting your search or filters.'
                : 'Products will appear here once sellers list them.'}
            </p>
            {(debouncedQuery || activeFilters > 0) && (
              <Button variant="outline" className="mt-4" onClick={() => { setSearchQuery(''); clearFilters(); }}>
                Clear search & filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                onAddToCart={handleAddToCart}
                isAdding={addingToCart === p.id}
              />
            ))}
          </div>
        )}
      </div>
    </AuthenticatedLayout>
  );
}
