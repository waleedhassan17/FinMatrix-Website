import { useQuery } from '@tanstack/react-query';
import { ChevronRight, UserCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { messagingKeys, useConnect } from '@/features/messaging/useConnect';
import { formatWhatsappPreview } from '@/features/messaging/whatsappPreview';
import { getContactHealth } from '@/networks/messaging/messagingNetwork';
import { CONTACT_STATUS_WORDS, type ContactStatus } from '@/models/messaging';

/** What to do about each status, in the words the owner reads. */
const FIX: Record<ContactStatus, string> = {
  ready: 'Ready',
  unverified: 'Not delivered to yet — it verifies on the first message',
  no_consent: 'Record their consent on the form',
  missing: 'Add a WhatsApp number',
  invalid: 'The phone is not a WhatsApp number — correct it',
  not_on_whatsapp: 'WhatsApp could not deliver to this number — check it',
  opted_out: 'They replied STOP. They can reply START to receive messages again',
};
const ORDER: ContactStatus[] = ['not_on_whatsapp', 'invalid', 'missing', 'no_consent', 'opted_out', 'unverified', 'ready'];

/**
 * Customers and vendors WhatsApp cannot reach yet — no number, a number that
 * is not on WhatsApp, no consent, or opted out — each linked to its form.
 */
export default function FixContactsPage() {
  const { featureOn } = useConnect();
  const [filter, setFilter] = useState<'all' | 'customer' | 'vendor'>('all');
  const q = useQuery({ queryKey: messagingKeys.contactHealth, queryFn: () => getContactHealth(), enabled: featureOn });

  const rows = useMemo(
    () =>
      (q.data?.contacts ?? [])
        .filter((c) => filter === 'all' || c.partyType === filter)
        .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.name.localeCompare(b.name)),
    [q.data, filter],
  );

  if (!featureOn) {
    return (
      <FeatureUnavailable icon={UserCheck} title="WhatsApp Connect is not part of this plan" body="There is nothing to fix here." />
    );
  }
  const s = q.data?.summary;
  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Fix contacts"
        description="Who WhatsApp cannot reach yet. Open one to add a number or record consent."
        back={{ to: '/settings/whatsapp', label: 'WhatsApp Connect' }}
      />
      {s && (
        <p className="text-body-sm text-text-secondary">
          {s.ready} of {s.total} ready · {s.missing + s.invalid} without a number · {s.noConsent} without consent ·{' '}
          {s.notOnWhatsapp} not on WhatsApp · {s.optedOut} opted out
        </p>
      )}
      <SegmentedControl
        label="Show"
        value={filter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'customer', label: 'Customers' },
          { value: 'vendor', label: 'Vendors' },
        ]}
        onChange={setFilter}
      />
      <Card>
        {q.isLoading ? (
          <p className="p-lg text-body-sm text-text-tertiary">Loading…</p>
        ) : q.isError ? (
          <p className="p-lg text-body-sm text-danger">Could not load contacts.</p>
        ) : rows.length === 0 ? (
          <p className="p-lg text-body-sm text-text-secondary">Every contact can be messaged.</p>
        ) : (
          <ul className="divide-y divide-border-light">
            {rows.map((c) => (
              <li key={`${c.partyType}-${c.id}`}>
                <Link
                  to={c.partyType === 'customer' ? `/customers/${c.id}/edit` : `/vendors/${c.id}/edit`}
                  className="flex items-center gap-md px-lg py-md hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label-lg text-text-primary">
                      {c.name}
                      {c.code ? <span className="ml-xs text-caption text-text-tertiary">{c.code}</span> : null}
                    </p>
                    <p className="text-body-sm text-text-secondary">
                      {formatWhatsappPreview(c.whatsappE164) ?? c.phone ?? 'No phone'} ·{' '}
                      {c.partyType === 'customer' ? 'Customer' : 'Vendor'}
                    </p>
                    <p className="text-caption text-text-tertiary">{FIX[c.status]}</p>
                  </div>
                  <span className="rounded-full bg-neutral-100 px-xs py-xxs text-label-sm text-text-secondary">
                    {CONTACT_STATUS_WORDS[c.status]}
                  </span>
                  <ChevronRight className="size-4 text-text-tertiary" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
