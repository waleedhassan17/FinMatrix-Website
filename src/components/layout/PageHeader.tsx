import { ChevronLeft, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { cn } from '@/lib/cn';

export interface PageHeaderProps {
  title: ReactNode;
  /** Where "back" goes — the list this record belongs to. */
  back?: { to: string; label: string };
  /** Status badge(s), shown beside the title. */
  status?: ReactNode;
  description?: ReactNode;
  /** Short facts under the title, separated by dots: a customer link, a date. */
  meta?: ReactNode[];
  /** Right-hand actions: primary buttons, document actions, a More menu. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The top of every page.
 *
 * One header instead of a hand-copied back link, h1 and wrapping button row per
 * page — which is how a detail page ended up with five equal-weight buttons,
 * Delete among them, in a line that broke unpredictably.
 *
 * The rule it encodes: one or two primary actions, the document's Print / PDF /
 * Share, and everything else in a More menu, destructive items last.
 */
export function PageHeader({
  title,
  back,
  status,
  description,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  const facts = (meta ?? []).filter((m) => m !== null && m !== undefined && m !== false && m !== '');

  return (
    <div className={cn('flex flex-col gap-xs', className)}>
      {back && (
        <Link
          to={back.to}
          className="inline-flex w-fit items-center gap-xxs rounded-sm text-label-md text-text-secondary transition-colors hover:text-primary"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {back.label}
        </Link>
      )}

      <div className="flex flex-col gap-md lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-sm">
            <h1 className="min-w-0 break-words text-h2 text-text-primary">{title}</h1>
            {status}
          </div>
          {description && (
            <p className="mt-xxs max-w-3xl text-body-sm text-text-secondary">{description}</p>
          )}
          {facts.length > 0 && (
            <p className="mt-xs flex flex-wrap items-center gap-x-sm gap-y-xxs text-body-sm text-text-secondary">
              {facts.map((fact, i) => (
                <Fragment key={i}>
                  {i > 0 && (
                    <span aria-hidden="true" className="size-1 rounded-full bg-border-strong" />
                  )}
                  <span className="inline-flex min-w-0 items-center gap-xxs">{fact}</span>
                </Fragment>
              ))}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-xs lg:shrink-0 lg:justify-end">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export interface MoreAction {
  label: string;
  icon?: LucideIcon;
  onSelect?: () => void;
  /** Navigate instead of calling onSelect. */
  to?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Leave the item out entirely — for permission checks at the call site. */
  hidden?: boolean;
}

/** The "⋯" menu for a page's secondary and destructive actions. */
export function MoreActionsMenu({
  actions,
  label = 'More actions',
}: {
  actions: MoreAction[];
  label?: string;
}) {
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const regular = visible.filter((a) => !a.destructive);
  const destructive = visible.filter((a) => a.destructive);

  const item = (a: MoreAction) => {
    const Icon = a.icon;
    const icon = Icon ? <Icon aria-hidden="true" /> : undefined;
    if (a.to) {
      return (
        <DropdownMenuItem key={a.label} asChild disabled={a.disabled} destructive={a.destructive}>
          <Link to={a.to}>
            {icon}
            {a.label}
          </Link>
        </DropdownMenuItem>
      );
    }
    return (
      <DropdownMenuItem
        key={a.label}
        icon={icon}
        disabled={a.disabled}
        destructive={a.destructive}
        // Deferred a tick: the menu returns focus to its trigger as it closes,
        // and a dialog opened in the same moment would be dismissed by it.
        onSelect={() => {
          if (a.onSelect) setTimeout(a.onSelect, 0);
        }}
      >
        {a.label}
      </DropdownMenuItem>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={label} className="px-sm">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {regular.map(item)}
        {regular.length > 0 && destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default PageHeader;
