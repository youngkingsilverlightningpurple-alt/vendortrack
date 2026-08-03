'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient, User, Session } from '@supabase/supabase-js';

type SupabaseContext = {
  supabase: SupabaseClient;
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAvailable: boolean;
};

const Context = createContext<SupabaseContext | undefined>(undefined);

/**
 * Check if Supabase env vars are configured.
 */
function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/**
 * Create a no-op Supabase client stub for graceful degradation.
 * Returns empty data for all operations, preventing crashes
 * when Supabase is not configured.
 */
function createNoOpClient(): SupabaseClient {
  const noOpHandler = {
    get: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    post: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    put: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    delete: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
  };

  // Create a minimal stub that satisfies the SupabaseClient type
  // using Proxy to intercept all property accesses
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === 'auth') {
        return {
          getUser: () => Promise.resolve({ data: { user: null }, error: null }),
          getSession: () => Promise.resolve({ data: { session: null }, error: null }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signInWithOAuth: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signUp: () => Promise.resolve({ data: { user: null, session: null }, error: { message: 'Supabase not configured' } }),
          signOut: () => Promise.resolve({ error: null }),
          resetPasswordForEmail: () => Promise.resolve({ data: {}, error: { message: 'Supabase not configured' } }),
        };
      }
      if (prop === 'from') {
        // Return a chainable query builder that resolves to empty data
        return (_table: string) => {
          const chain = {
            select: () => chain,
            insert: () => chain,
            update: () => chain,
            delete: () => chain,
            eq: () => chain,
            neq: () => chain,
            gt: () => chain,
            gte: () => chain,
            lt: () => chain,
            lte: () => chain,
            in: () => chain,
            like: () => chain,
            ilike: () => chain,
            is: () => chain,
            not: () => chain,
            range: () => chain,
            limit: () => chain,
            order: () => chain,
            single: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
            match: () => chain,
            overlaps: () => chain,
            contains: () => chain,
            containedBy: () => chain,
            then: (resolve: (v: any) => void) => resolve({ data: [], error: null }),
            catch: (_reject: (e: any) => void) => Promise.resolve({ data: [], error: null }),
            finally: (cb: () => void) => { cb(); return Promise.resolve({ data: [], error: null }); },
          };
          return chain;
        };
      }
      if (prop === 'rpc') {
        return (_fn: string) => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } });
      }
      if (prop === 'channel') {
        return () => ({
          on: function() { return this; },
          subscribe: function() { return this; },
          unsubscribe: () => {},
        });
      }
      if (prop === 'removeChannel') {
        return () => {};
      }
      if (prop === 'getChannels') {
        return () => [];
      }
      return undefined;
    },
  });
}

export function SupabaseProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState<SupabaseClient>(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      // Graceful degradation: return a no-op client stub
      // All operations will return empty data instead of crashing
      return createNoOpClient();
    }

    return createBrowserClient(url, key);
  });

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable] = useState(() => isSupabaseConfigured());

  useEffect(() => {
    if (!isAvailable) {
      // Supabase not configured — skip auth, mark as loaded
      setIsLoading(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: string, session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, isAvailable]);

  return (
    <Context.Provider value={{ supabase, user, session, isLoading, isAvailable }}>
      {children}
    </Context.Provider>
  );
}

export const useSupabase = () => {
  const context = useContext(Context);
  if (context === undefined) {
    throw new Error('useSupabase must be used inside SupabaseProvider');
  }
  return context;
};
