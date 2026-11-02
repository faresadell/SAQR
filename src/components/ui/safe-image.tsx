"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icon";

interface SafeImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackIcon?: IconName;
}

/**
 * Image with a neutral placeholder when there is no source or the file fails to load.
 * Uses a plain <img> on purpose: sources can be any origin an admin or merchant uploads to.
 */
export function SafeImage({ src, alt, className, fallbackIcon = "image" }: SafeImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden bg-canvas text-silver-dim", className)}>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src ?? undefined} alt={alt} loading="lazy" onError={() => setFailedSrc(src ?? null)} className="size-full object-cover" />
      ) : (
        <span role="img" aria-label={alt} className="flex flex-col items-center gap-1">
          <Icon name={fallbackIcon} className="size-8" />
        </span>
      )}
    </div>
  );
}
