'use client';

import { useState, useEffect } from 'react';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, PlusCircle } from 'lucide-react';
import { useSupabase } from '@/components/providers/supabase-provider';
import type { Product, ProductRow } from '@/types';
import { productRowToDomain } from '@/types';
import { createLogger } from '@/lib/logger';
import { DataTable } from './data-table';
import { getColumns } from './columns';
import { ProductForm } from './product-form';
import { Skeleton } from '@/components/ui/skeleton';

const log = createLogger('seller-products');

const PAGE_SIZE = 10;

export default function ProductsPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { supabase, user } = useSupabase();

  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  
  const fetchProducts = async (pageToFetch: number = 0) => {
    if (!user) return;
    
    const loadingSetter = pageToFetch > 0 ? setIsLoadingMore : setIsLoading;
    loadingSetter(true);

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('seller_id', user.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const mappedProducts = (data || []).map(p => productRowToDomain(p as ProductRow));
      
      setProducts(prev => pageToFetch > 0 ? [...prev, ...mappedProducts] : mappedProducts);
      setPage(pageToFetch);

      if (mappedProducts.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Error fetching products:", undefined, error);
    } finally {
      loadingSetter(false);
    }
  };

  useEffect(() => {
    if (!isFormOpen && user) {
      fetchProducts(0);
    }
  }, [user, isFormOpen]);

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsFormOpen(true);
  };
  
  const handleAddProduct = () => {
    setSelectedProduct(null);
    setIsFormOpen(true);
  }

  const columns = getColumns(handleEditProduct);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
          <Button onClick={handleAddProduct}>
            <PlusCircle className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Your Products</CardTitle>
            <CardDescription>
              Manage your inventory and view product details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <DataTable columns={columns} data={products} emptyStateText="No products found." />
                {hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button onClick={() => fetchProducts(page + 1)} disabled={isLoadingMore} variant="outline">
                      {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load More
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
      <ProductForm
        isOpen={isFormOpen}
        onOpenChange={setIsFormOpen}
        product={selectedProduct}
      />
    </AuthenticatedLayout>
  );
}
