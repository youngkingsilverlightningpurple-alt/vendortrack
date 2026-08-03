"use client";

import { useSupabase } from "@/components/providers/supabase-provider";
import { useRouter, usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  LogOut,
  Package as PackageIcon,
  Menu,
  ShoppingBag,
  Settings,
  Store,
  ShoppingCart,
  Users,
  ShieldCheck,
  Zap,
  RotateCcw,
  Search,
  CreditCard,
  RefreshCw,
  Server,
  Database,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useIsMobile } from "@/hooks/use-mobile";
import { BottomNav } from "./bottom-nav";
import { Badge } from "@/components/ui/badge";

type Profile = {
  role: 'buyer' | 'seller';
  is_admin: boolean;
  full_name: string;
};

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { supabase, user, isLoading: isAuthLoading } = useSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      supabase
        .from('profiles')
        .select('role, is_admin, full_name')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setProfile(data);
          setIsProfileLoading(false);
        });
    }
  }, [user, isAuthLoading, router, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  if (isAuthLoading || isProfileLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center animate-pulse">
                <Database className="text-white h-6 w-6" />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary font-bold">Synchronizing...</span>
        </div>
      </div>
    );
  }

  const isSeller = profile?.role === "seller";
  const isAdmin = profile?.is_admin;

  return (
    <SidebarProvider>
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-blue-500 to-primary z-[60]" />
      <Sidebar className="border-r border-primary/5">
        <SidebarHeader className="border-b border-primary/5 px-4 h-16 flex justify-center">
          <Logo />
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {isAdmin && (
              <>
                <div className="px-4 py-4 text-[10px] font-extrabold text-primary uppercase tracking-[0.2em] opacity-70">
                  Mission Control
                </div>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/admin-dashboard'}>
                    <Link href="/admin-dashboard"><ShieldCheck className="text-primary" /><span>Operational Health</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <div className="my-2 border-t mx-3" />
              </>
            )}

            {isSeller ? (
              <>
                <div className="px-4 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em]">
                  Vendor Portal
                </div>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === '/seller-dashboard'}>
                    <Link href="/seller-dashboard"><LayoutDashboard /><span>Overview</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/seller-dashboard/products")}>
                    <Link href="/seller-dashboard/products"><ShoppingBag /><span>Inventory</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/seller-dashboard/orders")}>
                    <Link href="/seller-dashboard/orders"><PackageIcon /><span>Transactions</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : (
              <>
                <div className="px-4 py-4 text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em]">
                  Marketplace
                </div>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/products")}>
                    <Link href="/products"><Store /><span>Active Catalog</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname.startsWith("/buyer-orders")}>
                    <Link href="/buyer-orders"><PackageIcon /><span>My Purchase Ledger</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/cart"}>
                    <Link href="/cart"><ShoppingCart /><span>Transactional Cart</span></Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            )}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-primary/5 p-4">
          <div className="mb-4">
            <Badge variant="outline" className="w-full justify-center bg-primary/5 text-primary border-primary/20 text-[9px] font-bold uppercase tracking-widest py-1">
                Sandbox Environment
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="flex w-full items-center justify-start gap-3 p-3 h-14 bg-muted/30 hover:bg-muted/50 rounded-xl transition-all border border-transparent hover:border-primary/10">
                <Avatar className="h-8 w-8 rounded-lg shadow-sm border border-white">
                  <AvatarFallback className="bg-primary text-white text-[10px] font-bold">
                    {user?.email?.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col items-start overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-900 truncate w-full">{user?.email}</span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold">Verified Session</span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl p-2" align="end" side="right">
              <DropdownMenuLabel className="text-xs uppercase tracking-widest text-slate-400 font-bold">Account</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href={isSeller ? "/seller-dashboard/settings" : "/"} className="rounded-lg">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Preferences</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive/10 focus:text-destructive rounded-lg">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Terminate Session</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background/80 backdrop-blur-md px-4">
          <SidebarTrigger className="md:hidden" />
          <div className="flex-1" />
        </header>
        <main className="flex-1 bg-slate-50/50">{children}</main>
      </SidebarInset>
      {isMobile && <BottomNav />}
    </SidebarProvider>
  );
}
