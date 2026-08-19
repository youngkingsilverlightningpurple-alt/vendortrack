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
  title: {
    default: 'VendorTrack — Multi-Vendor Marketplace Platform',
    template: '%s | VendorTrack',
  },
  description: 'The multi-vendor marketplace platform built for trust, scale, and financial integrity. Secure payments, seller dashboards, and automated payouts.',
  keywords: ['marketplace', 'multi-vendor', 'ecommerce', 'seller platform', 'stripe connect', 'vendor management'],
  authors: [{ name: 'VendorTrack' }],
  creator: 'VendorTrack',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    siteName: 'VendorTrack',
    title: 'VendorTrack — Multi-Vendor Marketplace Platform',
    description: 'The multi-vendor marketplace platform built for trust, scale, and financial integrity.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VendorTrack — Multi-Vendor Marketplace Platform',
    description: 'The multi-vendor marketplace platform built for trust, scale, and financial integrity.',
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="theme-color" content="#1a6b3c" />
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
