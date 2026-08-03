'use client';

import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import { useSupabase } from '@/components/providers/supabase-provider';
import { Skeleton } from '@/components/ui/skeleton';

interface ChartData {
  name: string;
  gmv: number;
}

export function PlatformRevenueChart() {
  const { supabase } = useSupabase();
  const [data, setData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchChartData = async () => {
      // In a production environment, this would query a materialized view or aggregated analytics table.
      // For this audit-ready environment, we aggregate the current orders table to reflect reality.
      const { data: orders, error } = await supabase
        .from('orders')
        .select('amount_total_cents, created_at')
        .order('created_at', { ascending: true });

      if (!error && orders) {
        // Group by day for the last 14 days
        const groups: Record<string, number> = {};
        const last14Days = Array.from({ length: 14 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() - (13 - i));
          return d.toISOString().split('T')[0];
        });

        last14Days.forEach(date => groups[date as string] = 0);

        orders.forEach(o => {
          const date = o.created_at.split('T')[0];
          if (groups[date] !== undefined) {
            groups[date] += o.amount_total_cents / 100;
          }
        });

        const chartData = Object.entries(groups).map(([date, amount]) => ({
          name: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          gmv: amount
        }));

        setData(chartData);
      }
      setIsLoading(false);
    };

    fetchChartData();
  }, [supabase]);

  return (
    <Card className="col-span-full lg:col-span-4 border-primary/5">
      <CardHeader>
        <CardTitle>Platform Throughput</CardTitle>
        <CardDescription>Daily Gross Merchandise Volume (GMV) captured across the system.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full" />
        ) : (
          <div className="h-[300px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted))" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 10}}
                  tickFormatter={(value) => `$${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '12px', 
                    border: '1px solid hsl(var(--border))', 
                    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    fontSize: '12px'
                  }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'GMV']}
                />
                <Area 
                  type="monotone" 
                  dataKey="gmv" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorGmv)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
