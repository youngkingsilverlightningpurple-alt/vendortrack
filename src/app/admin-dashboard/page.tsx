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
import { 
  DollarSign, 
  TrendingUp, 
  Store, 
  Calendar,
  Percent,
  RefreshCw,
  Layers,
  ShieldAlert,
  Loader2,
  Database,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useSupabase } from '@/components/providers/supabase-provider';
import { getErrorMessage } from '@/types';
import { createLogger } from '@/lib/logger';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { analyticsService, type MarketplaceStats } from '@/services/analytics-service';
import { SystemHealthWidget } from '@/components/system-health-widget';
import { Badge } from '@/components/ui/badge';
import { PlatformRevenueChart } from '@/components/platform-revenue-chart';
import { seedMarketplaceData } from '@/lib/seed-service';

const log = createLogger('admin-dashboard');

const StatCard = ({ title, value, icon: Icon, isLoading, description, valuePrefix = '', valueSuffix = '' }: { 
  title: string, 
  value: string | number, 
  icon: React.ElementType, 
  isLoading: boolean, 
  description: string, 
  valuePrefix?: string,
  valueSuffix?: string
}) => (
    <Card className="overflow-hidden transition-all hover:shadow-md border-primary/10">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="rounded-full bg-primary/10 p-1.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : (
          <>
            <div className="text-2xl font-bold">{valuePrefix}{value}{valueSuffix}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {description}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );

export default function AdminDashboardPage() {
  const { user, supabase } = useSupabase();
  const { toast } = useToast();

  const [stats, setStats] = useState<MarketplaceStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  const loadStats = async (force = false) => {
    if (!user) return;
    setIsLoading(true);
    try {
      const data = await analyticsService.fetchMarketplaceStats();
      setStats(data);
    } catch (error: unknown) {
      log.error("Error loading platform stats:", undefined, error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedData = async () => {
    if (!user) return;
    setIsSeeding(true);
    try {
      await seedMarketplaceData(user.id);
      toast({
        title: "Systems Initialized",
        description: "PostgreSQL has been seeded with realistic operational data.",
      });
      await loadStats(true);
    } catch (error: unknown) {
      toast({
        variant: "destructive",
        title: "Seed Failed",
        description: getErrorMessage(error)
      });
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single();
      setIsAuthorized(!!data?.is_admin);
    };

    checkAuth();
    loadStats();
  }, [user, supabase]);

  if (isAuthorized === false) {
    return (
      <AuthenticatedLayout>
        <div className="flex h-full min-h-[70vh] items-center justify-center p-4 text-center">
          <div className="space-y-4">
            <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
            <h2 className="text-2xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground max-w-sm">Administrative privileges are required. Request access via the core database console.</p>
          </div>
        </div>
      </AuthenticatedLayout>
    );
  }

  return (
    <AuthenticatedLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-widest border-primary/30 text-primary">Live</Badge>
              </div>
              <p className="text-sm text-muted-foreground flex items-center gap-2 font-medium">
                Operational audit of current marketplace activity.
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              <SystemHealthWidget />
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadStats(true)} 
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Data
              </Button>
              {stats && stats.totalOrders === 0 && (
                <Button size="sm" onClick={handleSeedData} disabled={isSeeding}>
                  {isSeeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Initialize System Data
                </Button>
              )}
            </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
           <StatCard
            title="Total GMV"
            value={stats ? formatCurrency(stats.totalRevenueCents / 100) : '0'}
            icon={DollarSign}
            isLoading={isLoading}
            description="Gross Merchandise Volume"
          />
          <StatCard
            title="Platform Yield"
            value={stats ? formatCurrency(stats.totalCommissionCents / 100) : '0'}
            icon={TrendingUp}
            isLoading={isLoading}
            description="Captured Fees (10%)"
          />
          <StatCard
            title="Active Sellers"
            value={stats ? stats.totalSellers : 0}
            icon={Store}
            isLoading={isLoading}
            description="Verified Vendors"
          />
          <StatCard
            title="Throughput (30d)"
            value={stats ? stats.totalOrders30d : 0}
            icon={Calendar}
            isLoading={isLoading}
            description="Fulfillment Events"
          />
          <StatCard
            title="Efficiency"
            value={stats ? stats.conversionRate : 0}
            icon={Percent}
            isLoading={isLoading}
            description="Order/User Ratio"
            valueSuffix="%"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-7">
            <PlatformRevenueChart />
            <Card className="col-span-full lg:col-span-3 border-primary/5">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Relational Integrity
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <p className="text-muted-foreground text-sm leading-relaxed font-medium">
                        State consistency is enforced at the database layer via PostgreSQL transactions. 
                        Every financial interaction is recorded in the immutable audit trail.
                    </p>
                    <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                      <div className="p-4 bg-muted/50 rounded-xl border border-primary/10">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Catalog Size</p>
                        <p className="text-xl font-extrabold">{stats ? stats.totalProducts : 0}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-xl border border-primary/10">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Total Accounts</p>
                        <p className="text-xl font-extrabold">{stats ? stats.totalUsers : 0}</p>
                      </div>
                    </div>
                </CardContent>
            </Card>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
