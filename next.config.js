/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Strict type checking is now enforced.
    // All type errors have been fixed — Supabase RPC return types are
    // properly typed, and missing types have been generated.
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  // Standalone output for Docker — produces minimal server bundle
  output: 'standalone',
  experimental: {
    // NOTE: instrumentationHook is now enabled by default in Next.js 14+
    // serverComponentsExternalPackages moved to top-level in Next.js 14.2+
  },
  // Move serverComponentsExternalPackages to top-level (Next.js 14.2+)
  serverExternalPackages: ['stripe'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', port: '', pathname: '/**' },
    ],
    // Image optimization settings
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 3600,
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
  },
  // Compression
  compress: true,
  /**
   * SECURITY HEADERS — Applied at the Next.js build level.
   * These are the fallback headers for any route not handled by middleware.
   * The middleware.ts applies additional headers (CSP with nonce, rate limit headers, etc.)
   * on top of these.
   *
   * OWASP: A05:2021 — Security Misconfiguration
   */
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: [
          // --- Strict Transport Security ---
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          // --- X-Frame-Options ---
          { key: 'X-Frame-Options', value: 'DENY' },
          // --- X-Content-Type-Options ---
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // --- Referrer-Policy ---
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // --- Permissions-Policy ---
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self https://js.stripe.com), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), ambient-light-sensor=(), autoplay=(), encrypted-media=(), picture-in-picture=(), speaker-selection=(), sync-xhr=(), vr=()' },
          // --- Cross-Origin Isolation ---
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          // --- X-DNS-Prefetch-Control ---
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
          // --- X-Permitted-Cross-Domain-Policies ---
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          // --- X-XSS-Protection ---
          { key: 'X-XSS-Protection', value: '0' },
        ],
      },
      // Cache static assets aggressively
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Cache images
      {
        source: '/_next/image(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
