
'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AuthenticatedLayout from '@/components/layout/authenticated-layout';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, Package, ShoppingCart, Clock, PlusCircle, AlertCircle, CheckCircle2, ShieldAlert, TrendingUp } from 'lucide-react';
import { useSupabase } from '@/components/providers/supabase-provider';
import { Skeleton } from '@/components/ui/skeleton';
import type { UserProfile, Product, ProfileRow } from '@/types';
import { profileRowToDomain } from '@/types';
import { createLogger } from '@/lib/logger';
import { formatCurrency } from '@/lib/utils';
import { SellerOnboardingProgress } from '@/components/seller-onboarding-progress';

const log = createLogger('seller-dashboard');

const StatCard = ({ title, value, icon: Icon, isLoading, description, valuePrefix = '', trend }: { 
  title: string, 
  value: string | number, 
  icon: React.ElementType, 
  isLoading: boolean, 
  description: string, 
  valuePrefix?: string,
  trend?: string
}) => (
    <Card className="transition-all hover:shadow-md border-none shadow-sm ring-1 ring-border/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="rounded-full bg-primary/10 p-1.5">
            <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{valuePrefix}{value}</div>
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-muted-foreground">{description}</p>
              {trend && (
                <span className="text-[10px] font-bold text-green-600 flex items-center gap-0.5">
                  <TrendingUp className="h-2.5 w-2.5" />
                  {trend}
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );

export default function SellerDashboardPage() {
  const { user, supabase } = useSupabase();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [productsCount, setProductsCount] = useState(0);
  const [hasActiveProduct, setHasActiveProduct] = useState(false);
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingOrders: 0,
    totalOrders: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAllData = async () => {
      if (!user) return;
      setIsLoading(true);

      try {
        // Fetch Profile
        const { data: pData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        if (pData) {
          setProfile(profileRowToDomain(pData as ProfileRow));
        }

        // Fetch Stats
        const { data: orders } = await supabase.from('orders').select('*').eq('seller_id', user.id);
        const { count: pCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('seller_id', user.id);
        const { count: activeCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('seller_id', user.id).eq('status', 'active');

        setProductsCount(pCount || 0);
        setHasActiveProduct((activeCount || 0) > 0);

        if (orders) {
          const revenue = orders.filter(o => o.status === 'delivered').reduce((acc, o) => acc + o.amount_cents, 0) / 100;
          const pending = orders.filter(o => o.status === 'pending').length;
          setStats({
            totalRevenue: revenue,
            pendingOrders: pending,
            totalOrders: orders.length,
          });
        }
      } catch (error: unknown) {
        log.error("Error fetching dashboard stats:", undefined, error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();
  }, [user, supabase]);

  const onboardingSteps = useMemo(() => {
    return [
      {
        id: 'stripe',
        label: 'Connect Stripe Account',
        description: 'Authorize automated payouts.',
        isCompleted: !!profile?.stripeConnected,
        href: '/seller-dashboard/settings'
      },
      {
        id: 'store',
        label: 'Complete Store Profile',
        description: 'Add a logo and description.',
        isCompleted: !!profile?.storeName && !!profile?.storeLogoUrl,
        href: '/seller-dashboard/settings'
      },
      {
        id: 'product',
        label: 'Create Your First Product',
        description: 'List your inventory.',
        isCompleted: productsCount > 0,
        href: '/seller-dashboard/products'
      },
      {
        id: 'active',
        label: 'Publish Active Listing',
        description: 'Make a product visible to buyers.',
        isCompleted: hasActiveProduct,
        href: '/seller-dashboard/products'
      }
    ];
  }, [profile, productsCount, hasActiveProduct]);

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-6 p-4 pt-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Store Overview</h1>
            <p className="text-sm text-muted-foreground">Track sales, manage inventory, and monitor performance.</p>
          </div>
          {!isLoading && productsCount > 0 && profile?.sellerStatus === 'approved' && (
            <Button asChild>
              <Link href="/seller-dashboard/products">
                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
              </Link>
            </Button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <StatCard
                title="Total Earnings"
                value={formatCurrency(stats.totalRevenue)}
                icon={DollarSign}
                isLoading={isLoading}
                description="Successfully delivered"
                trend="+12%"
              />
              <StatCard
                title="Active Orders"
                value={stats.pendingOrders}
                icon={ShoppingCart}
                isLoading={isLoading}
                description="Requiring fulfillment"
              />
              <StatCard
                title="Fulfillment Rate"
                value="98.2"
                trend="%"
                icon={CheckCircle2}
                isLoading={isLoading}
                description="Orders delivered on time"
              />
              <StatCard
                title="Store Products"
                value={productsCount}
                icon={Package}
                isLoading={isLoading}
                description="Live and draft listings"
              />
            </div>

            <Card className="border-none shadow-sm ring-1 ring-border/50">
              <CardHeader>
                <CardTitle>Platform Status</CardTitle>
                <CardDescription>Your current standing on the VendorTrack marketplace.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-3">
                      {profile?.sellerStatus === 'approved' ? (
                          <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center"><CheckCircle2 className="h-4 w-4 text-green-600" /></div>
                      ) : (
                          <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center"><Clock className="h-4 w-4 text-amber-600" /></div>
                      )}
                      <div>
                        <p className="text-sm font-bold">Seller Verification</p>
                        <p className="text-xs text-muted-foreground">Required for public listings</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{profile?.sellerStatus || 'pending'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center"><DollarSign className="h-4 w-4 text-blue-600" /></div>
                      <div>
                        <p className="text-sm font-bold">Payment Method</p>
                        <p className="text-xs text-muted-foreground">Automated Stripe Payouts</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{profile?.stripeConnected ? 'Connected' : 'Missing'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-purple-100 flex items-center justify-center"><ShieldAlert className="h-4 w-4 text-purple-600" /></div>
                      <div>
                        <p className="text-sm font-bold">Marketplace Fee</p>
                        <p className="text-xs text-muted-foreground">Platform operational commission</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">10% commission</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <SellerOnboardingProgress steps={onboardingSteps} />
            
            <Card className="bg-slate-900 text-white border-none shadow-xl">
              <CardHeader>
                <CardTitle className="text-lg">Pro Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <p className="text-sm font-bold text-primary">Use AI Copilot</p>
                  <p className="text-xs text-slate-400 leading-relaxed">Sellers who use our AI description generator see 40% higher conversion rates on their listings.</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-primary">Quick Fulfillment</p>
                  <p className="text-xs text-slate-400 leading-relaxed">Shipping items within 24 hours increases your "Store Reliability" score and search ranking.</p>
                </div>
                <Button variant="outline" className="w-full border-slate-700 bg-transparent text-white hover:bg-slate-800" asChild>
                  <Link href="/help">Visit Knowledge Base</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
