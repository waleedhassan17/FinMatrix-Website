import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';

/** A text link to the screen a panel summarises. */
export function PanelLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex shrink-0 items-center gap-xxs rounded-sm text-label-md text-primary transition-colors hover:text-primary-dark"
    >
      {children}
      <ChevronRight className="size-4" aria-hidden="true" />
    </Link>
  );
}

/**
 * The head of a dashboard panel: what it is, what it covers, and where the full
 * version lives.
 *
 * Not SectionHeader. That is the dot-and-overline a document FORM draws above a
 * group of fields; a panel on a dashboard is a summary of somewhere else, and
 * the header's job is to name the scope and link to it.
 */
export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  /** Right-hand content — a PanelLink, or several. */
  action?: ReactNode;
}) {
  return (
    <CardHeader className="items-center">
      <div className="min-w-0">
        <CardTitle className="text-h5">{title}</CardTitle>
        {description && (
          <CardDescription className="mt-[2px] text-caption text-text-tertiary">
            {description}
          </CardDescription>
        )}
      </div>
      {action && <div className="flex items-center gap-md">{action}</div>}
    </CardHeader>
  );
}
