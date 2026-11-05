import {
  BadgeCheck,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  Lock,
  MailWarning,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import { staffAccessSummary } from '@/models/accountAccess';

/** The small pieces My account is built from. */

export function RolePill({ owner }: { owner: boolean }) {
  const Icon = owner ? ShieldCheck : Users;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xxs rounded-full px-sm py-[2px] text-label-sm',
        owner ? 'bg-primary-tint text-primary' : 'bg-neutral-100 text-text-secondary',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {owner ? 'Owner' : 'Team member'}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  const Icon = verified ? BadgeCheck : MailWarning;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xxs rounded-full px-xs py-[2px] text-label-sm',
        verified ? 'bg-success-lighter text-success' : 'bg-warning-lighter text-warning',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {verified ? 'Verified' : 'Not verified'}
    </span>
  );
}

/** A neutral status chip for the right-hand side of a setting row. */
export function QuietPill({ icon: Icon, children }: { icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-xxs rounded-full bg-neutral-100 px-sm py-[2px] text-label-sm text-text-secondary">
      {Icon && <Icon className="size-3.5" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary',
        className,
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

/**
 * One labelled fact: label in a fixed column, the value beside it, an
 * optional action on the right. Stacks on a phone.
 */
export function InfoRow({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="grid gap-xxs py-md sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:gap-md">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-xs text-body-md text-text-primary">
        {children}
      </dd>
      {action && <div className="sm:justify-self-end">{action}</div>}
    </div>
  );
}

/** A setting with an icon, a title, one line of explanation and an action. */
export function SettingRow({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex flex-col gap-sm px-lg py-md sm:flex-row sm:items-center sm:gap-md">
      <div className="flex min-w-0 flex-1 items-start gap-sm">
        <IconTile icon={icon} />
        <div className="min-w-0">
          <h3 className="text-label-lg text-text-primary">{title}</h3>
          <p className="mt-[2px] text-body-sm text-text-secondary">{description}</p>
        </div>
      </div>
      {action && <div className="shrink-0 pl-[48px] sm:pl-0">{action}</div>}
    </li>
  );
}

export function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the value is on screen to copy by hand.
      toast.error('Could not copy', { description: 'Select the text and copy it instead.' });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

/**
 * What a team member's role lets them do, read from the same capability map
 * the buttons use.
 */
export function StaffAccess({ features }: { features: Parameters<typeof staffAccessSummary>[0] }) {
  const access = staffAccessSummary(features);
  return (
    <div>
      <h3 className="text-label-lg text-text-primary">What your role lets you do</h3>
      <p className="mt-[2px] text-body-sm text-text-secondary">
        Anything that moves money waits for the owner’s approval.
      </p>
      <div className="mt-md grid gap-lg md:grid-cols-3">
        <AccessGroup icon={CircleCheck} tone="success" title="Do directly" items={access.direct} />
        <AccessGroup icon={Clock3} tone="warning" title="Sent for approval" items={access.request} />
        <AccessGroup icon={Lock} tone="neutral" title="Owner only" items={access.ownerOnly} />
      </div>
    </div>
  );
}

const GROUP_TONE = {
  success: 'bg-success-lighter text-success',
  warning: 'bg-warning-lighter text-warning',
  neutral: 'bg-neutral-100 text-text-secondary',
} as const;

function AccessGroup({
  icon: Icon,
  tone,
  title,
  items,
}: {
  icon: LucideIcon;
  tone: keyof typeof GROUP_TONE;
  title: string;
  items: string[];
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId} className="flex items-center gap-xs text-label-md text-text-primary">
        <span className={cn('flex size-6 items-center justify-center rounded-full', GROUP_TONE[tone])}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        {title}
      </h4>
      <ul className="mt-sm flex flex-col gap-xs">
        {items.map((item) => (
          <li key={item} className="flex gap-xs text-body-sm text-text-secondary">
            <span aria-hidden="true" className="mt-[8px] size-1 shrink-0 rounded-full bg-border-strong" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShortcutLink({
  to,
  icon,
  title,
  description,
  count = 0,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-sm rounded-md px-sm py-sm transition-colors outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
    >
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-label-md text-text-primary">{title}</span>
        <span className="block truncate text-caption text-text-secondary">{description}</span>
      </span>
      {count > 0 && (
        <span className="min-w-5 rounded-full bg-danger px-xxs text-center text-label-sm text-text-inverse tabular">
          {count > 99 ? '99+' : count}
        </span>
      )}
      <ChevronRight
        className="size-4 shrink-0 text-text-tertiary transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-text-secondary motion-reduce:transition-none"
        aria-hidden="true"
      />
    </Link>
  );
}
