/**
 * @fileoverview Placeholder Image System — Self-hosted SVG placeholders
 *
 * Instead of relying on external services like picsum.photos,
 * we generate deterministic SVG placeholders that are always available
 * and require no network requests.
 *
 * These are used ONLY as fallbacks when real product images are missing.
 * In production, all product images should be uploaded to Supabase Storage.
 */

export type ImagePlaceholder = {
  id: string;
  description: string;
  /** Self-hosted SVG data URI — always available, zero latency */
  imageUrl: string;
  imageHint: string;
};

/**
 * Generate a deterministic SVG data URI placeholder
 * Uses a hash of the seed to pick colors from the VendorTrack palette
 */
function generateSvgPlaceholder(seed: string, width = 600, height = 600): string {
  // Deterministic hash from seed
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const hue = Math.abs(hash % 360);
  const bg = `hsl(${hue}, 20%, 92%)`;
  const fg = `hsl(${hue}, 40%, 60%)`;
  const text = `hsl(${hue}, 30%, 45%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <circle cx="${width/2}" cy="${height/2 - 30}" r="60" fill="${fg}" opacity="0.3"/>
    <rect x="${width/2 - 40}" y="${height/2 + 20}" width="80" height="8" rx="4" fill="${fg}" opacity="0.2"/>
    <rect x="${width/2 - 60}" y="${height/2 + 36}" width="120" height="6" rx="3" fill="${fg}" opacity="0.15"/>
    <text x="${width/2}" y="${height/2 + 70}" text-anchor="middle" fill="${text}" font-family="sans-serif" font-size="12" opacity="0.4">${seed}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const PlaceHolderImages: ImagePlaceholder[] = [
  {
    id: 'eco-store',
    description: 'EcoWare Store Logo',
    imageUrl: generateSvgPlaceholder('eco-store', 200, 200),
    imageHint: 'eco environment',
  },
  {
    id: 'tech-store',
    description: 'TechTrend Store Logo',
    imageUrl: generateSvgPlaceholder('tech-store', 200, 200),
    imageHint: 'technology future',
  },
  {
    id: 'luxe-store',
    description: 'LuxeLeather Store Logo',
    imageUrl: generateSvgPlaceholder('luxe-store', 200, 200),
    imageHint: 'luxury fashion',
  },
  {
    id: 'product-bamboo',
    description: 'Bamboo Cutlery Set',
    imageUrl: generateSvgPlaceholder('product-bamboo', 600, 600),
    imageHint: 'bamboo cutlery',
  },
  {
    id: 'product-keyboard',
    description: 'Mechanical Keyboard',
    imageUrl: generateSvgPlaceholder('product-keyboard', 600, 600),
    imageHint: 'mechanical keyboard',
  },
];

/**
 * Get a placeholder image URL for a given seed
 * Used as fallback when no real image is available
 */
export function getPlaceholderUrl(seed: string, width = 600, height = 600): string {
  return generateSvgPlaceholder(seed, width, height);
}
