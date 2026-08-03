'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Redirects to the main dashboard.
 * The standalone summary page is deprecated in favor of the unified dashboard overview.
 */
export default function SummaryRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/seller-dashboard');
  }, [router]);

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  );
}
