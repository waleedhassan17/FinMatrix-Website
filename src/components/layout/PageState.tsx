import { AlertTriangle, FileQuestion, RotateCw } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * A record page while it loads: header, a sheet and a rail, in their real
 * positions — so the page does not jump when the data lands, and a slow network
 * reads as "loading" rather than as a sentence of grey text.
 */
export function DetailPageSkeleton({ rail = true }: { rail?: boolean }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-lg">
      <div className="flex flex-col gap-sm">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap items-center justify-between gap-md">
          <Skeleton className="h-8 w-64 max-w-full" />
          <div className="flex gap-xs">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-9" />
          </div>
        </div>
      </div>
      <div className={rail ? 'grid gap-lg xl:grid-cols-[minmax(0,1fr)_22rem]' : 'grid gap-lg'}>
        <Card className="flex flex-col gap-lg p-xl">
          <div className="flex justify-between gap-lg">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-12 w-40" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="ml-auto h-24 w-64 max-w-full" />
        </Card>
        {rail && (
          <div className="flex flex-col gap-lg">
            <Skeleton className="h-36 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Not found, or failed to load — with a way out, and a retry when it can help. */
export function PageMessage({
  title,
  description,
  backTo,
  backLabel,
  onRetry,
  tone = 'notFound',
}: {
  title: string;
  description?: string;
  backTo?: string;
  backLabel?: string;
  onRetry?: () => void;
  tone?: 'notFound' | 'error';
}) {
  const Icon = tone === 'error' ? AlertTriangle : FileQuestion;
  return (
    <Card className="mx-auto flex w-full max-w-[36rem] flex-col items-center px-xl py-xxxl text-center">
      <span
        className={
          tone === 'error'
            ? 'flex size-12 items-center justify-center rounded-full bg-danger-lighter text-danger'
            : 'flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary'
        }
      >
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <p className="mt-md text-h4 text-text-primary">{title}</p>
      {description && <p className="mt-xxs text-body-sm text-text-secondary">{description}</p>}
      <div className="mt-lg flex flex-wrap justify-center gap-xs">
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RotateCw className="size-4" />
            Try again
          </Button>
        )}
        {backTo && (
          <Button asChild size="sm">
            <Link to={backTo}>{backLabel ?? 'Back'}</Link>
          </Button>
        )}
      </div>
    </Card>
  );
}
