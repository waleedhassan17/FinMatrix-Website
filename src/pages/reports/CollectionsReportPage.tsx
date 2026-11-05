import { useQuery } from '@tanstack/react-query';
import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { MessageStatusTicks } from '@/features/messaging/MessageStatusTicks';
import { messagingKeys, useConnect } from '@/features/messaging/useConnect';
import { getMessagingStats } from '@/networks/messaging/messagingNetwork';

const days = (v: number | null) => (v === null ? '—' : `${Math.round(v)} days`);
const OUTCOME: Record<'paid' | 'open' | 'void', { label: string; tone: string }> = {
  paid: { label: 'Paid', tone: 'text-success' },
  open: { label: 'Still owing', tone: 'text-text-secondary' },
  void: { label: 'Voided', tone: 'text-text-tertiary' },
};

/**
 * Collections on WhatsApp: what the payment reminders did this month, days
 * sales outstanding against the three months before Connect, and the last 50
 * reminders with what became of each invoice.
 */
export default function CollectionsReportPage() {
  const { featureOn, enabled } = useConnect();
  const q = useQuery({ queryKey: messagingKeys.stats(), queryFn: () => getMessagingStats(), enabled: featureOn });

  if (!featureOn) {
    return (
      <FeatureUnavailable
        icon={MessageCircle}
        title="WhatsApp Connect is not part of this plan"
        body="Payment reminders on WhatsApp come with WhatsApp Connect."
      />
    );
  }
  const s = q.data;
  const readRate = s && s.sent > 0 ? `${Math.round((s.read / s.sent) * 100)}%` : '—';
  const kpis: Array<[string, string, string?]> = s
    ? [
        ['Reminders sent', String(s.remindersSent), 'this month'],
        ['Paid within 7 days', String(s.invoicesPaidWithin7DaysOfReminder), 'of reminded invoices'],
        ['Messages read', readRate, `${s.read} of ${s.sent} sent`],
        ['Not delivered', String(s.failed), s.failed ? 'see Fix contacts' : undefined],
        ['Days sales outstanding', days(s.dso.period), s.dso.beforeConnect !== null ? `before Connect: ${days(s.dso.beforeConnect)}` : undefined],
      ]
    : [];

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Collections on WhatsApp"
        description={
          enabled
            ? 'What the payment reminders did this month.'
            : 'WhatsApp Connect is switched off — figures below are from when it was on.'
        }
        back={{ to: '/reports/ar-aging', label: 'AR Aging' }}
      />
      {q.isLoading ? (
        <p className="text-body-sm text-text-tertiary">Loading…</p>
      ) : !s ? (
        <p className="text-body-sm text-danger">Could not load the figures.</p>
      ) : (
        <>
          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-5">
            {kpis.map(([label, value, note]) => (
              <Card key={label} className="p-lg">
                <p className="text-overline text-text-tertiary">{label}</p>
                <p className="mt-xxs text-h3 text-text-primary tabular">{value}</p>
                {note ? <p className="text-caption text-text-secondary">{note}</p> : null}
              </Card>
            ))}
          </div>
          <Card>
            <div className="border-b border-border-light px-lg py-sm">
              <h2 className="text-label-lg text-text-primary">Last 50 reminders</h2>
            </div>
            {s.recentReminders.length === 0 ? (
              <p className="p-lg text-body-sm text-text-secondary">No reminders yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-body-sm">
                  <thead>
                    <tr className="text-left text-overline text-text-tertiary">
                      <th className="px-lg py-xs">Invoice</th>
                      <th className="px-lg py-xs">Customer</th>
                      <th className="px-lg py-xs">Reminder</th>
                      <th className="px-lg py-xs">WhatsApp</th>
                      <th className="px-lg py-xs text-right">Balance</th>
                      <th className="px-lg py-xs">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-light">
                    {s.recentReminders.map((r) => (
                      <tr key={r.messageId}>
                        <td className="px-lg py-xs">
                          <Link to={`/invoices/${r.invoiceId}`} className="text-text-link hover:underline">
                            {r.invoiceNumber}
                          </Link>
                        </td>
                        <td className="px-lg py-xs text-text-secondary">{r.customerName || '—'}</td>
                        <td className="px-lg py-xs text-text-secondary">
                          {r.eventType === 'reminder_upcoming' ? 'Before due' : 'Overdue'} ·{' '}
                          {new Date(r.sentAt).toLocaleDateString()}
                        </td>
                        <td className="px-lg py-xs">
                          <span className="inline-flex flex-col">
                            <MessageStatusTicks status={r.status} showLabel />
                            {r.reason ? <span className="text-caption text-text-tertiary">{r.reason}</span> : null}
                          </span>
                        </td>
                        <td className="px-lg py-xs text-right tabular">{r.balance}</td>
                        <td className={`px-lg py-xs ${OUTCOME[r.outcome].tone}`}>{OUTCOME[r.outcome].label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
