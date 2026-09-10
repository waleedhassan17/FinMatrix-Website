import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The surface. One elevation — `shadow-card` — everywhere something lifts off
 * the canvas. The token file carries a full xs…xl scale for parity with the
 * app, but nothing needs a 28px blur, and stacking several depths is most of
 * what makes an interface look synthetic.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-lg bg-surface shadow-card', className)}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-md border-b border-border-light px-lg py-md',
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-h4 text-text-primary', className)} {...props} />;
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn('text-body-sm text-text-secondary', className)} {...props} />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-lg py-md', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-sm border-t border-border-light px-lg py-md',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Section header: an 8px dot then an 11px uppercase tracked title. Ported from
 * THEME.form.sectionTitle / sectionDot — the app draws this above every group
 * of fields in a document form.
 */
export function SectionHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center gap-xs', className)}>
      <span className="size-2 rounded-full bg-primary" />
      <span className="text-overline text-neutral-500">{title}</span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export default Card;
