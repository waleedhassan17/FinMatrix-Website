import { Package } from 'lucide-react';
import { useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * An item's photo, or a package mark on the brand tint when it has none — or
 * when the photo fails to load (an expired link, no connection). The URL is a
 * signed link that needs no token, and stays identical all day, so the
 * browser's cache serves it on every refetch of the list.
 */
export function ItemThumb({
  src,
  alt,
  className,
  iconClassName = 'size-4',
}: {
  src: string | null;
  alt: string;
  /** Size and corner radius, e.g. "size-8 rounded-sm". */
  className?: string;
  iconClassName?: string;
}) {
  // WHICH link failed, so a new photo or a refreshed link is tried afresh.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <span
        aria-hidden="true"
        className={cn('flex shrink-0 items-center justify-center bg-primary-tint text-primary', className)}
      >
        <Package className={iconClassName} />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailedSrc(src)}
      className={cn('shrink-0 bg-neutral-100 object-cover', className)}
    />
  );
}

export default ItemThumb;
