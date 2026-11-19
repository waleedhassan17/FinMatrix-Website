import { ArrowRight, MoveRight } from 'lucide-react';

import { Card, SectionHeader } from '@/components/ui/Card';
import { Select, type SelectOption } from '@/components/ui/Select';
import type { ChartChange, MappingsView } from '@/models/migration';

const KEEP = 'keep';

/**
 * How FinMatrix's own chart changes to fit the owner's. The owner's accounts
 * keep their numbers and names; a FinMatrix account that IS one of them takes
 * its number and name (Receivables becomes "1200 Accounts Receivable"), and
 * one the owner does not have moves off a number they use. Each system
 * account's choice can be changed: another of the owner's accounts, or keep
 * FinMatrix's own.
 */
export function YourChart({
  view,
  editable,
  saving,
  onChoose,
}: {
  view: MappingsView;
  editable: boolean;
  saving: boolean;
  /** Save which owner account a FinMatrix role becomes ('keep' for none). */
  onChoose: (role: string, target: string) => void;
}) {
  const changes = view.chartChanges ?? [];
  if (changes.length === 0) return null;
  const adopted = changes.filter((c) => c.change === 'adopt');
  const moved = changes.filter((c) => c.change === 'step_aside');
  const typeOf = new Map(view.chartOfAccounts.map((a) => [a.id ?? a.number, a.type]));
  const owners = view.sourceAccounts ?? [];

  const optionsFor = (c: ChartChange): SelectOption[] => {
    const type = typeOf.get(c.accountId);
    return [
      ...owners
        .filter((o) => !type || !o.type || o.type.toLowerCase() === type)
        .map((o) => ({ value: o.number, label: `Your ${o.number}${o.name ? ` ${o.name}` : ''}` })),
      { value: KEEP, label: `Keep FinMatrix's own ${c.fromName}` },
    ];
  };

  return (
    <Card className="flex flex-col gap-md p-lg">
      <SectionHeader title="Your chart in FinMatrix" />
      <p className="text-body-sm text-text-secondary">
        Your accounts keep their numbers and names. FinMatrix&apos;s own accounts take them over — invoices, payments and stock
        keep posting to them, whatever their number — or move to a free number. This stays after the import, and after an undo.
      </p>
      {adopted.length > 0 && (
        <section className="flex flex-col gap-xs">
          <h3 className="text-label-md text-text-primary">
            FinMatrix accounts that become yours ({adopted.length})
          </h3>
          <ul className="flex flex-col divide-y divide-border-light rounded-md border border-border-light">
            {adopted.map((c) => (
              <li
                key={c.accountId}
                className="grid gap-sm px-md py-sm md:grid-cols-[minmax(0,1fr)_auto_minmax(0,20rem)] md:items-center"
              >
                <span className="min-w-0 text-body-sm text-text-secondary">
                  FinMatrix&apos;s <span className="tabular text-text-primary">{c.fromNumber}</span>{' '}
                  <span className="text-text-primary">{c.fromName}</span>
                </span>
                <ArrowRight className="hidden h-4 w-4 text-text-secondary md:block" aria-hidden />
                {c.role ? (
                  <Select
                    compact
                    aria-label={`Which of your accounts FinMatrix's ${c.fromName} becomes`}
                    value={c.source ?? c.toNumber}
                    options={optionsFor(c)}
                    disabled={!editable || saving}
                    onChange={(v) => onChoose(c.role!, v)}
                  />
                ) : (
                  <span className="text-body-sm text-text-primary">
                    <span className="tabular">{c.toNumber}</span> {c.toName}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {moved.length > 0 && (
        <section className="flex flex-col gap-xs">
          <h3 className="text-label-md text-text-primary">
            FinMatrix accounts that move to a free number ({moved.length})
          </h3>
          <ul className="flex flex-col divide-y divide-border-light rounded-md border border-border-light">
            {moved.map((c) => (
              <li key={c.accountId} className="flex flex-wrap items-center gap-xs px-md py-sm text-body-sm">
                <span className="tabular text-text-primary">{c.fromNumber}</span>
                <span className="text-text-primary">{c.fromName}</span>
                <MoveRight className="h-4 w-4 text-text-secondary" aria-hidden />
                <span className="tabular text-text-primary">{c.toNumber}</span>
                <span className="text-caption text-text-secondary">— your chart uses {c.fromNumber}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

export default YourChart;
