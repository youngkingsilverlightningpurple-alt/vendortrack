
'use client';
import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Redirects to the new public storefront URL.
 * The /sellers/[id] route is deprecated in favor of /store/[id].
 */
export default function SellerRedirectPage() {
  const router = useRouter();
  const { id } = useParams();

  useEffect(() => {
    if (id) {
      router.replace(`/store/${id}`);
    } else {
      router.replace('/products');
    }
  }, [router, id]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
