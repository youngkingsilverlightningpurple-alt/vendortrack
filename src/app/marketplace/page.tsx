'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

// This page is a redirect to /products.
// The /marketplace route is deprecated.
export default function MarketplaceRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/products');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
