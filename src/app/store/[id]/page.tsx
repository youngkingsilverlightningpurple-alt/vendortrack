'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import type { Product, UserProfile, ProfileRow, ProductRow } from '@/types';
import { profileRowToDomain, productRowToDomain } from '@/types';
import { createLogger } from '@/lib/logger';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Store, ShoppingCart, Star, Mail, MapPin, Calendar } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useSupabase } from '@/components/providers/supabase-provider';

const log = createLogger('store-page');

export default function SellerStorefrontPage() {
  const { id } = useParams();
  const { supabase } = useSupabase();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [profRes, prodRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', id).single(),
          supabase.from('products').select('*').eq('seller_id', id).eq('status', 'active').is('deleted_at', null)
        ]);

        if (profRes.data) {
          const profile = profileRowToDomain(profRes.data as ProfileRow);
          setProfile(profile);
          document.title = `${profile.storeName || 'Store'} | VendorTrack`;
        }

        if (prodRes.data) {
          setProducts(prodRes.data.map(p => productRowToDomain(p as ProductRow)));
        }
      } catch (error: unknown) {
        log.error("Storefront error:", undefined, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id, supabase]);

  if (!isLoading && !profile) {
    return (
      <AuthenticatedLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-4">
          <Store className="h-10 w-10 text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold">Store Not Found</h1>
          <Button asChild className="mt-6"><Link href="/products">Browse Marketplace</Link></Button>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="max-w-7xl mx-auto space-y-8 p-4 pt-6 md:p-8">
        <section className="relative overflow-hidden rounded-3xl bg-white border shadow-sm">
          <div className="h-32 bg-primary/5 w-full" />
          <div className="px-6 pb-8 -mt-12 flex flex-col md:flex-row items-center md:items-end gap-6">
            {isLoading ? <Skeleton className="h-32 w-32 rounded-full" /> : (
              <div className="h-32 w-32 rounded-full border-4 border-background shadow-md overflow-hidden relative bg-white">
                {profile?.storeLogoUrl ? <Image src={profile.storeLogoUrl} alt="" fill className="object-cover" /> : <Store className="h-12 w-12 m-auto" />}
              </div>
            )}
            <div className="flex-1 text-center md:text-left space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight">{profile?.storeName || 'Anonymous Store'}</h1>
              <p className="text-muted-foreground max-w-2xl">{profile?.storeDescription || 'A trusted VendorTrack partner.'}</p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-sm text-muted-foreground pt-1">
                <MapPin className="h-3.5 w-3.5" /> <span>Remote Vendor</span>
                <Calendar className="h-3.5 w-3.5" /> <span>Joined {profile?.createdAt ? format(new Date(profile.createdAt), 'MMM yyyy') : 'N/A'}</span>
              </div>
            </div>
            <Button variant="outline" asChild><a href={`mailto:${profile?.email}`}><Mail className="mr-2 h-4 w-4" />Contact</a></Button>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-4">
          <aside className="lg:col-span-1">
            <Card><CardContent className="p-6 space-y-4">
              <h3 className="font-bold text-lg">Store Performance</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span>Quality</span><span className="text-primary font-medium">Excellent</span></div>
                <div className="flex justify-between"><span>Response</span><span className="font-medium">Under 24h</span></div>
              </div>
            </CardContent></Card>
          </aside>
          <main className="lg:col-span-3">
            <h2 className="text-2xl font-bold mb-6">Active Listings</h2>
            {isLoading ? <div className="grid gap-6 sm:grid-cols-2"><Skeleton className="h-64 w-full" /></div> : (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="group">
                    <Card className="overflow-hidden ring-1 ring-border/50">
                      <div className="aspect-square relative"><Image src={p.imageUrl} alt="" fill className="object-cover transition-transform group-hover:scale-105" /></div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold truncate">{p.title}</h3>
                        <p className="text-lg font-bold text-primary">${p.price.toFixed(2)}</p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
