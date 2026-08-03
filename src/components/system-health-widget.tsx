
'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '@/components/providers/supabase-provider';
import { Activity, Zap, Cpu, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

export type HealthStatus = 'checking' | 'healthy' | 'degraded' | 'offline';

export function SystemHealthWidget() {
  const { supabase } = useSupabase();
  const [status, setStatus] = useState<{
    db: HealthStatus;
    latency: number;
    stripe: HealthStatus;
    ai: HealthStatus;
  }>({
    db: 'checking',
    latency: 0,
    stripe: 'checking',
    ai: 'checking',
  });

  const performHealthCheck = async () => {
    const start = performance.now();
    let dbStatus: HealthStatus = 'healthy';
    let latency = 0;

    // Check database health
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      if (error) throw error;
      latency = Math.round(performance.now() - start);
    } catch (e) {
      dbStatus = 'degraded';
    }

    // Check Stripe health via payment-health API
    let stripeStatus: HealthStatus = 'healthy';
    try {
      const res = await fetch('/api/payment-health');
      if (res.ok) {
        const data = await res.json();
        stripeStatus = data.healthy ? 'healthy' : 'degraded';
      } else {
        stripeStatus = 'degraded';
      }
    } catch (e) {
      // If the API is unreachable, it might be a network issue
      // Don't mark as offline since the API might not be deployed yet
      stripeStatus = 'degraded';
    }

    setStatus({
      db: dbStatus,
      latency,
      stripe: stripeStatus,
      ai: 'healthy',
    });
  };

  useEffect(() => {
    performHealthCheck();
    const interval = setInterval(performHealthCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex items-center gap-3 bg-slate-900 px-4 py-2 rounded-xl border border-white/10 shadow-2xl">
      <div className="flex items-center gap-1.5 pr-3 border-r border-white/10">
        <Server className={cn("h-3.5 w-3.5", status.db === 'healthy' ? 'text-primary' : 'text-amber-500')} />
        <span className={cn("text-[10px] font-mono font-bold", status.db === 'healthy' ? 'text-white' : 'text-amber-500')}>
          {status.latency > 0 ? `${status.latency}ms` : '--'}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <Zap className={cn("h-3 w-3", status.stripe === 'healthy' ? 'text-blue-400' : 'text-amber-500')} />
        <Cpu className={cn("h-3 w-3", status.ai === 'healthy' ? 'text-purple-400' : 'text-slate-600')} />
      </div>

      <div className="flex items-center gap-1.5 ml-1">
        <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse",
          status.db === 'healthy' && status.stripe === 'healthy' ? 'bg-primary' : 'bg-amber-500'
        )} />
        <span className="text-[9px] font-extrabold uppercase text-slate-400 tracking-widest">Core Live</span>
      </div>
    </div>
  );
}
