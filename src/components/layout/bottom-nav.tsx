
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Settings,
  User as UserIcon,
  LogOut,
  Store,
  ShoppingCart,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/components/providers/supabase-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useState } from 'react';

export function BottomNav() {
  const pathname = usePathname();
  const { user, supabase } = useSupabase();
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      supabase.from('profiles').select('role').eq('id', user.id).single()
        .then(({ data }) => setRole(data?.role || null));
    }
  }, [user, supabase]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isSeller = role === 'seller';

  const navItems = isSeller
      ? [
          { href: '/seller-dashboard', icon: LayoutDashboard, label: 'Overview' },
          { href: '/seller-dashboard/products', icon: ShoppingBag, label: 'Products' },
          { href: '/seller-dashboard/orders', icon: Package, label: 'Orders' },
          { href: '/seller-dashboard/settings', icon: Settings, label: 'Settings' },
        ]
      : [
          { href: '/products', icon: Store, label: 'Products' },
          { href: '/buyer-orders', icon: Package, label: 'Orders' },
          { href: '/cart', icon: ShoppingCart, label: 'Cart' },
      ];


  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className={cn("grid h-16 items-stretch", isSeller ? 'grid-cols-5' : 'grid-cols-4')}>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-xs font-medium',
               pathname.startsWith(item.href) && (item.href !== '/seller-dashboard' || pathname === '/seller-dashboard')
                ? 'text-primary'
                : 'text-muted-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground cursor-pointer'
              )}
            >
              <UserIcon className="h-5 w-5" />
              <span>Profile</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="mb-2 w-56">
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
