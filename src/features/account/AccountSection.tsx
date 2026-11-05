import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * One block of My account: what it is about on the left, the card on the
 * right. The label column is what lets a long settings page be scanned
 * top to bottom without opening anything. Stacks on narrower screens.
 */
export function AccountSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'grid gap-md border-t border-border pt-xl lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-xxl',
        className,
      )}
    >
      <div>
        <h2 id={headingId} className="text-h4 text-text-primary">
          {title}
        </h2>
        <p className="mt-xxs text-body-sm text-text-secondary">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export default AccountSection;
