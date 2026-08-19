/**
 * @fileoverview Placeholder Image API Route
 *
 * Generates deterministic SVG placeholder images for seeded products.
 * This eliminates dependency on external image services like picsum.photos.
 *
 * Usage: /api/placeholder/[category]/[seed]
 * Returns: SVG image with Content-Type: image/svg+xml
 */

import { NextRequest, NextResponse } from 'next/server';

const CATEGORY_COLORS: Record<string, { bg: string; fg: string; icon: string }> = {
  components: { bg: '#e8f4e8', fg: '#2d7a2d', icon: '⚙' },
  storage: { bg: '#e8eef4', fg: '#2d4f7a', icon: '💾' },
  peripherals: { bg: '#f4eee8', fg: '#7a4f2d', icon: '⌨' },
  power: { bg: '#f4e8e8', fg: '#7a2d2d', icon: '⚡' },
  audio: { bg: '#f0e8f4', fg: '#5a2d7a', icon: '🔊' },
  displays: { bg: '#e8f4f0', fg: '#2d7a6a', icon: '🖥' },
};

const DEFAULT_COLORS = { bg: '#f0f0f0', fg: '#666666', icon: '📦' };

export async function GET(
  request: NextRequest,
  { params }: { params: { category: string; seed: string } }
) {
  const category = params.category.toLowerCase();
  const seed = params.seed;
  const colors = CATEGORY_COLORS[category] || DEFAULT_COLORS;

  // Deterministic seed number for variation
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const variant = Math.abs(hash % 3);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">
    <rect width="600" height="600" fill="${colors.bg}"/>
    <rect x="0" y="0" width="600" height="4" fill="${colors.fg}" opacity="0.6"/>
    <circle cx="300" cy="240" r="80" fill="${colors.fg}" opacity="0.12"/>
    <circle cx="300" cy="240" r="50" fill="${colors.fg}" opacity="0.08"/>
    <rect x="230" y="340" width="140" height="10" rx="5" fill="${colors.fg}" opacity="0.2"/>
    <rect x="200" y="360" width="200" height="8" rx="4" fill="${colors.fg}" opacity="0.12"/>
    <text x="300" y="420" text-anchor="middle" fill="${colors.fg}" font-family="system-ui, sans-serif" font-size="13" font-weight="600" opacity="0.4">${category.toUpperCase()}</text>
    <text x="300" y="445" text-anchor="middle" fill="${colors.fg}" font-family="system-ui, sans-serif" font-size="11" opacity="0.25">SKU-${seed}</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
