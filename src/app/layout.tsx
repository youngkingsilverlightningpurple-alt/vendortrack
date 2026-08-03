import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { SupabaseProvider } from '@/components/providers/supabase-provider';

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
  preload: true,
});

export const metadata: Metadata = {
  title: 'VendorTrack | Enterprise Multi-Vendor Infrastructure',
  description: 'A transaction-safe multi-vendor marketplace engine with database-enforced financial integrity.',
  // Preconnect to external domains for faster resource loading
  other: {
    'dns-prefetch': 'https://images.unsplash.com',
    'preconnect': 'https://images.unsplash.com',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#0F172A',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${manrope.variable}`} suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet"/>
      </head>
      <body className="font-body antialiased bg-background text-foreground transition-colors">
        <SupabaseProvider>
          {children}
          <Toaster />
        </SupabaseProvider>
      </body>
    </html>
  );
}
