import { cn } from '@/lib/cn';

/** A placeholder block with the shape of what is loading. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-neutral-100', className)} />;
}

export default Skeleton;
