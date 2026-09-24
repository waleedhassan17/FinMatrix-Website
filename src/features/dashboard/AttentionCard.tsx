import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Inbox,
  Info,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { PanelHeader } from '@/features/dashboard/PanelHeader';
import { cn } from '@/lib/cn';
import { alertTarget } from '@/models/dashboard';
import type { DashboardAlert } from '@/serializers/dashboardSerializer';

interface AttentionRow {
  key: string;
  icon: LucideIcon;
  /** Text class for the icon — the severity, and the only colour in the row. */
  tone: string;
  text: string;
  to: string | null;
}

const SEVERITY: Record<DashboardAlert['severity'], { icon: LucideIcon; tone: string }> = {
  danger: { icon: AlertCircle, tone: 'text-danger' },
  warning: { icon: AlertTriangle, tone: 'text-warning' },
  info: { icon: Info, tone: 'text-info' },
};

const ROW_CLASS = 'flex items-start gap-sm px-lg py-sm';

function RowBody({ row }: { row: AttentionRow }) {
  const Icon = row.icon;
  return (
    <>
      <Icon aria-hidden="true" className={cn('mt-[2px] size-4 shrink-0', row.tone)} />
      <span className="min-w-0 flex-1 text-body-sm text-text-primary">{row.text}</span>
      {row.to && (
        <ChevronRight aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-text-tertiary" />
      )}
    </>
  );
}

/**
 * What wants doing, in one place.
 *
 * Replaces a full-width amber banner that carried only the approvals count, and
 * gives the server's alerts somewhere to appear — they were parsed and then
 * never rendered. Each row links to the screen that resolves it.
 */
export function AttentionCard({
  alerts,
  pendingApprovals,
  isOwner,
  deliveryEnabled,
  loading,
  alertsFailed,
}: {
  alerts: DashboardAlert[];
  pendingApprovals: number;
  isOwner: boolean;
  deliveryEnabled: boolean;
  loading: boolean;
  /** The summary failed, so the server's alerts are unknown — not absent. */
  alertsFailed: boolean;
}) {
  const rows: AttentionRow[] = [];

  // One endpoint, two meanings: the server scopes the count by role, so an
  // owner sees what awaits their signature and a staff member sees how many of
  // their own requests are still waiting.
  if (pendingApprovals > 0) {
    rows.push({
      key: 'approvals',
      icon: Inbox,
      tone: 'text-warning',
      text: isOwner
        ? `${pendingApprovals} item${pendingApprovals === 1 ? '' : 's'} awaiting your approval`
        : `${pendingApprovals} of your request${pendingApprovals === 1 ? ' is' : 's are'} pending`,
      to: isOwner ? '/approvals' : '/my-requests',
    });
  }

  for (const alert of alerts) {
    // A delivery alert on a tier without deliveries would link to a 403.
    if (alert.id === 'pending_delivery' && !deliveryEnabled) continue;
    if (!alert.message) continue;
    rows.push({
      key: alert.id,
      ...SEVERITY[alert.severity],
      text: alert.message,
      to: alertTarget(alert),
    });
  }

  return (
    <Card className="flex flex-col overflow-hidden">
      <PanelHeader
        title="Needs attention"
        description={
          loading || alertsFailed
            ? undefined
            : rows.length === 0
              ? 'All clear'
              : `${rows.length} item${rows.length === 1 ? '' : 's'}`
        }
      />

      {loading ? (
        <div className="flex flex-col gap-sm px-lg py-md">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
      ) : rows.length === 0 && alertsFailed ? (
        <p className="px-lg py-md text-body-sm text-text-secondary">
          Alerts are unavailable right now.
        </p>
      ) : rows.length === 0 ? (
        <div className="flex items-start gap-sm px-lg py-md">
          <CheckCircle2 aria-hidden="true" className="mt-[2px] size-4 shrink-0 text-success" />
          <div>
            <p className="text-label-md text-text-primary">Nothing needs attention</p>
            <p className="mt-[2px] text-caption text-text-tertiary">
              Approvals, overdue invoices and unpaid bills are listed here when
              they come up.
            </p>
          </div>
        </div>
      ) : (
        <ul className="divide-y divide-border-light">
          {rows.map((row) => (
            <li key={row.key}>
              {row.to ? (
                <Link
                  to={row.to}
                  className={cn(ROW_CLASS, 'transition-colors hover:bg-surface-2 focus-visible:bg-surface-2')}
                >
                  <RowBody row={row} />
                </Link>
              ) : (
                <div className={ROW_CLASS}>
                  <RowBody row={row} />
                </div>
              )}
            </li>
          ))}
          {/* The approvals count comes from its own endpoint, so it can load
              while the summary fails. Say the rest is missing rather than let
              one row pass for the whole list. */}
          {alertsFailed && (
            <li className="px-lg py-sm text-caption text-text-tertiary">
              Other alerts are unavailable right now.
            </li>
          )}
        </ul>
      )}
    </Card>
  );
}

export default AttentionCard;
