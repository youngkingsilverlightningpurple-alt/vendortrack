'use client';

import { cn } from "@/lib/utils";

/**
 * VendorTrack Logo — Original Brand Identity
 *
 * Design language: Commerce + Trust + Tracking + Infrastructure
 * The mark combines a route/track path (representing shipment tracking)
 * with a storefront facade (representing the marketplace).
 * The angular geometry communicates infrastructure and reliability.
 *
 * Works at: 16px, 32px, 48px, 128px, 512px
 * Recognizable in both light and dark mode.
 */

export function Logo({
  className,
  showText = true,
  size = 'default',
}: {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'default' | 'lg';
}) {
  const iconSizes = {
    sm: 'h-5 w-5',
    default: 'h-7 w-7',
    lg: 'h-9 w-9',
  };

  const textSizes = {
    sm: 'text-sm',
    default: 'text-lg',
    lg: 'text-2xl',
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        fill="none"
        className={cn(iconSizes[size], "text-primary shrink-0")}
        aria-label="VendorTrack"
      >
        {/* Storefront base — represents marketplace/commerce */}
        <path
          d="M4 14L16 6L28 14V26H4V14Z"
          className="fill-primary/15"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        {/* Roof/awning — represents the marketplace canopy */}
        <path
          d="M2 14L16 4L30 14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Tracking route path — the core "Track" in VendorTrack */}
        <path
          d="M10 18C10 16 12 14 16 14C20 14 22 16 22 18"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          className="opacity-70"
        />
        {/* Route origin dot */}
        <circle cx="10" cy="18" r="1.5" className="fill-current" />
        {/* Route destination dot */}
        <circle cx="22" cy="18" r="1.5" className="fill-current" />
        {/* Door — represents the open marketplace */}
        <rect
          x="13" y="20" width="6" height="6"
          rx="1"
          stroke="currentColor"
          strokeWidth="1.5"
          className="opacity-60"
        />
      </svg>
      {showText && (
        <span className={cn(
          "font-extrabold tracking-tight text-foreground",
          textSizes[size]
        )}>
          Vendor<span className="text-primary">Track</span>
        </span>
      )}
    </div>
  );
}

/**
 * Compact logo mark — just the icon, no text
 * Used for favicons, app icons, compact headers, loading states
 */
export function LogoMark({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      fill="none"
      className={cn("text-primary", className)}
      aria-label="VendorTrack"
    >
      <path
        d="M4 14L16 6L28 14V26H4V14Z"
        className="fill-primary/15"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M2 14L16 4L30 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M10 18C10 16 12 14 16 14C20 14 22 16 22 18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="opacity-70"
      />
      <circle cx="10" cy="18" r="1.5" className="fill-current" />
      <circle cx="22" cy="18" r="1.5" className="fill-current" />
      <rect
        x="13" y="20" width="6" height="6"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.5"
        className="opacity-60"
      />
    </svg>
  );
}
