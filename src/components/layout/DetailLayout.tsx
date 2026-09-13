import type { ReactNode } from 'react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

/**
 * A record page: header across the top, the record itself, and a side rail of
 * what surrounds it — balance, the other party, payments, links.
 *
 * Full width on purpose. A document centred in a 56rem column left most of a
 * desktop screen empty and pushed the context a reader needs (who, how much is
 * still owed, what paid it) onto other pages. The rail stacks under the record
 * below 1280px.
 */
export function DetailLayout({
  header,
  children,
  aside,
  className,
}: {
  header?: ReactNode;
  children: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-lg', className)}>
      {header}
      <div
        className={cn(
          'grid items-start gap-lg',
          aside && 'xl:grid-cols-[minmax(0,1fr)_22rem]',
        )}
      >
        <div className="flex min-w-0 flex-col gap-lg">{children}</div>
        {aside && (
          <div className="flex min-w-0 flex-col gap-lg xl:sticky xl:top-20">{aside}</div>
        )}
      </div>
    </div>
  );
}

/** One titled card in the rail. */
export function RailSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <div className="flex items-center justify-between gap-sm border-b border-border-light px-lg py-sm">
        <h2 className="text-label-lg text-text-primary">{title}</h2>
        {action}
      </div>
      <div className="px-lg py-md">{children}</div>
    </Card>
  );
}

export default DetailLayout;
