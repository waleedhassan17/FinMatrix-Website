import { useQuery } from '@tanstack/react-query';

import { Card } from '@/components/ui/Card';
import { PanelHeader, PanelLink } from '@/features/dashboard/PanelHeader';
import { getMessagingStats } from '@/networks/messaging/messagingNetwork';
import { messagingKeys } from './useConnect';

const days = (v: number | null) => (v === null ? '—' : `${Math.round(v)} days`);

/**
 * FinMatrix Connect on the dashboard: payment reminders sent this month, how
 * many of those invoices were paid within a week, and days sales outstanding
 * against the three months before Connect. Render only while Connect is on.
 */
export function CollectionsCard() {
  const q = useQuery({ queryKey: messagingKeys.stats(), queryFn: () => getMessagingStats() });
  const s = q.data;
  const readRate = s && s.sent > 0 ? `${Math.round((s.read / s.sent) * 100)}%` : '—';
  return (
    <Card className="flex flex-col gap-md p-lg">
      <PanelHeader
        title="Collections on WhatsApp"
        description="Payment reminders this month"
        action={<PanelLink to="/reports/collections">Report</PanelLink>}
      />
      {q.isLoading ? (
        <p className="text-body-sm text-text-tertiary">Loading…</p>
      ) : !s ? (
        <p className="text-body-sm text-text-tertiary">No WhatsApp activity yet.</p>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-sm">
            {(
              [
                ['Reminders', String(s.remindersSent)],
                ['Paid in 7 days', String(s.invoicesPaidWithin7DaysOfReminder)],
                ['Read', readRate],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-caption text-text-secondary">{label}</dt>
                <dd className="text-h4 text-text-primary tabular">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-body-sm text-text-secondary">
            Days sales outstanding: {days(s.dso.period)}
            {s.dso.beforeConnect !== null ? ` (before Connect: ${days(s.dso.beforeConnect)})` : ''}
          </p>
          {s.failed > 0 ? (
            <p className="text-body-sm text-danger">
              {s.failed} message{s.failed === 1 ? '' : 's'} not delivered this month
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
}
