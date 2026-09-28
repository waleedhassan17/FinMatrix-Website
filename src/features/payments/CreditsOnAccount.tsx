import { Wallet } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/models/reportPeriod';
import type { CreditSource, CreditSpread } from '@/models/allocation';
import { formatMoney } from '@/utils/money';

/**
 * Money the customer or vendor already has with you — an advance, a credit
 * memo, a vendor credit — offered for use in this payment.
 *
 * One switch turns it on; each credit's "Use" figure starts at everything it
 * holds and stays editable. The credits are spent oldest first on the oldest
 * documents, before any new cash, and the "Applies" column says where they
 * actually landed — a figure larger than the documents can absorb is simply
 * not spent.
 */
export function CreditsOnAccount({
  credits,
  enabled,
  onToggle,
  onChange,
  spread,
  kindLabel,
  partyName,
  disabled,
}: {
  credits: CreditSource[];
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onChange: (credits: CreditSource[]) => void;
  spread: CreditSpread;
  kindLabel: (credit: CreditSource) => string;
  partyName: string;
  disabled?: boolean;
}) {
  if (credits.length === 0) return null;
  const available = credits.reduce((t, c) => t + c.available, 0);

  const setUse = (id: string, value: string) =>
    onChange(credits.map((c) => (c.id === id ? { ...c, use: value.replace(/[^0-9.]/g, '') } : c)));

  return (
    <Card className="p-lg">
      <div className="flex flex-wrap items-start justify-between gap-sm">
        <div className="flex min-w-0 items-start gap-sm">
          <Wallet className="mt-[2px] size-4 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="text-label-lg text-text-primary">Credits on account</h3>
            <p className="text-caption text-text-secondary">
              {partyName || 'This party'} has {formatMoney(available)} to use — spent first, oldest due date first,
              before any new money.
            </p>
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-xs text-label-md text-text-primary">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={disabled}
            className="size-4 accent-[color:var(--color-primary)]"
          />
          Use in this payment
        </label>
      </div>

      {enabled && (
        <div className="mt-md overflow-x-auto rounded-md border border-border-light">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-sm py-sm text-left text-overline text-text-secondary">Credit</th>
                <th className="px-sm py-sm text-right text-overline text-text-secondary">Available</th>
                <th className="px-sm py-sm text-right text-overline text-text-secondary">Use</th>
                <th className="px-sm py-sm text-right text-overline text-text-secondary">Applies</th>
              </tr>
            </thead>
            <tbody>
              {credits.map((c) => {
                const applies = spread.perCredit[c.id] ?? 0;
                const over = (parseFloat(c.use) || 0) > c.available + 0.004;
                return (
                  <tr key={c.id} className="border-b border-border-light last:border-0">
                    <td className="px-sm py-sm">
                      <p className="text-body-sm text-text-primary">{c.reference || kindLabel(c)}</p>
                      <p className="text-caption text-text-tertiary">
                        {kindLabel(c)}
                        {c.date ? ` · ${formatShortDate(c.date)}` : ''}
                      </p>
                    </td>
                    <td className="px-sm py-sm text-right text-body-sm text-text-primary tabular">
                      {formatMoney(c.available)}
                    </td>
                    <td className="px-sm py-sm text-right">
                      <input
                        value={c.use}
                        onChange={(e) => setUse(c.id, e.target.value)}
                        disabled={disabled}
                        inputMode="decimal"
                        aria-label={`Amount of ${c.reference || kindLabel(c)} to use`}
                        aria-invalid={over || undefined}
                        className={cn(
                          'h-9 w-28 rounded-md border bg-surface px-sm text-right text-body-sm text-text-primary tabular',
                          'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
                          'disabled:bg-background disabled:opacity-60',
                          over ? 'border-danger' : 'border-border',
                        )}
                      />
                    </td>
                    <td className="px-sm py-sm text-right text-body-sm tabular text-text-secondary">
                      {formatMoney(applies)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="border-t border-border-light bg-surface-2 px-sm py-xs text-right text-label-md text-text-primary tabular">
            Credits used {formatMoney(spread.used)}
          </p>
        </div>
      )}
    </Card>
  );
}

export default CreditsOnAccount;
