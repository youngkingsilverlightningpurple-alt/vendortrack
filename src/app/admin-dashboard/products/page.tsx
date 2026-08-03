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
import { useSupabase } from '@/components/providers/supabase-provider';
import type { Product, UserProfile, ProductRow, ProfileRow } from '@/types';
import { productRowToDomain, profileRowToDomain, getErrorMessage } from '@/types';
import { createLogger } from '@/lib/logger';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Trash2, ExternalLink, PackageSearch, Loader2, Zap } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const log = createLogger('admin-products');

const PAGE_SIZE = 20;

export default function AdminProductsPage() {
  const { supabase, user } = useSupabase();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [sellers, setSellers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('*').eq('id', user.id).single()
        .then(({ data }) => { if (data) setProfile(profileRowToDomain(data as ProfileRow)); });
    }
  }, [user, supabase]);

  const fetchData = async (pageToFetch: number = 0) => {
    const loadingSetter = pageToFetch > 0 ? setIsLoadingMore : setIsLoading;
    loadingSetter(true);

    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          profiles:seller_id(store_name, full_name)
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(pageToFetch * PAGE_SIZE, (pageToFetch + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      const productList = (data || []).map(p => productRowToDomain(p as ProductRow));
      
      const sellerMap: Record<string, string> = { ...sellers };
      data?.forEach(p => {
        const prof = p.profiles as { store_name?: string; full_name?: string } | null;
        sellerMap[p.seller_id] = prof?.store_name || prof?.full_name || 'Unknown';
      });

      setSellers(sellerMap);
      setProducts(prev => pageToFetch > 0 ? [...prev, ...productList] : productList);
      setPage(pageToFetch);

      if (productList.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (error: unknown) {
      log.error("Failed to fetch products:", undefined, error);
      toast({
        variant: "destructive",
        title: "Fetch error",
        description: "Could not load marketplace catalog."
      });
    } finally {
      loadingSetter(false);
    }
  };

  useEffect(() => {
    fetchData(0);
  }, []);

  const handleDeleteProduct = async (productId: string) => {
    if (!confirm("ADMIN ACTION: Are you sure you want to soft-delete this listing?")) return;

    if (profile?.isDemo) {
        toast({ title: "Simulation Mode", description: "Product removal simulated." });
        setProducts(prev => prev.filter(p => p.id !== productId));
        return;
    }

    try {
      const { error } = await supabase
        .from('products')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', productId);

      if (error) throw error;

      toast({ variant: "destructive", title: "Product Removed" });
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (error: unknown) {
      toast({ variant: "destructive", title: "Action failed", description: getErrorMessage(error) });
    }
  };

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight text-primary">Catalog Moderation</h1>
            <p className="text-sm text-muted-foreground">Manage every listing across the marketplace.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchData(0)} disabled={isLoading}>
            Refresh Catalog
          </Button>
        </div>

        <Card>
            <CardHeader>
                <CardTitle>Global Catalog</CardTitle>
                <CardDescription>Monitor cross-vendor inventory.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-md border overflow-hidden">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Vendor</TableHead>
                                        <TableHead>Price</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {products.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                                <PackageSearch className="h-8 w-8 mx-auto mb-2 opacity-20" />
                                                No products found.
                                            </TableCell>
                                        </TableRow>
                                    ) : products.map((product) => (
                                        <TableRow key={product.id} className="hover:bg-muted/30">
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="relative h-10 w-10 rounded border overflow-hidden shrink-0">
                                                        <Image src={product.imageUrl} alt="" fill className="object-cover" />
                                                    </div>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-semibold text-sm truncate max-w-[200px]">{product.title}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">ID: {product.id.substring(0, 8)}</span>
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Link href={`/store/${product.sellerId}`} className="text-xs font-medium text-primary hover:underline flex items-center gap-1">
                                                    {sellers[product.sellerId] || 'Unknown'}
                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                </Link>
                                            </TableCell>
                                            <TableCell>
                                                <span className="font-bold">${product.price.toFixed(2)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                                                    {product.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button 
                                                    variant="ghost" 
                                                    size="icon" 
                                                    className="text-destructive hover:bg-destructive/10 h-8 w-8"
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {hasMore && (
                            <div className="flex justify-center pt-4">
                                <Button onClick={() => fetchData(page + 1)} disabled={isLoadingMore} variant="outline">
                                    {isLoadingMore && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Load More Products
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
      </div>
    </AuthenticatedLayout>
  );
}
