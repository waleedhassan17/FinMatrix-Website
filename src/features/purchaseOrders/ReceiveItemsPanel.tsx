import { PackageCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { cn } from '@/lib/cn';
import {
  overReceivedDrafts,
  type ReceiptDraft,
} from '@/models/purchaseOrder';

/**
 * Booking goods in against a purchase order.
 *
 * An in-place panel on the detail page rather than a dialog, as the app does
 * it: a delivery is checked off line by line against the paperwork, and that is
 * not a job for a modal over the thing you are reading.
 *
 * The input asks **what arrived today**, not what the running total should be.
 * The cumulative figure is computed on submit (`receiptDraftsToPayload`) —
 * asking the user for a total they would have to work out themselves is how a
 * second delivery gets entered as a first one.
 */
export function ReceiveItemsPanel({
  drafts,
  onChange,
  onSubmit,
  onCancel,
  busy,
}: {
  drafts: ReceiptDraft[];
  onChange: (drafts: ReceiptDraft[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const over = new Set(overReceivedDrafts(drafts).map((d) => d.lineId));
  const anything = drafts.some((d) => (parseFloat(d.arriving) || 0) > 0);

  const setArriving = (lineId: string, value: string) =>
    onChange(
      drafts.map((d) =>
        d.lineId === lineId
          ? { ...d, arriving: value.replace(/[^0-9.]/g, '') }
          : d,
      ),
    );

  const receiveAll = () =>
    onChange(
      drafts.map((d) => ({
        ...d,
        arriving: String(Math.max(d.ordered - d.alreadyReceived, 0)),
      })),
    );

  return (
    <Card className="p-lg">
      <SectionHeader
        title="Receive items"
        right={
          <Button variant="secondary" size="sm" onClick={receiveAll} disabled={busy}>
            Receive everything outstanding
          </Button>
        }
      />

      <p className="mt-xs text-caption text-text-tertiary">
        Enter what arrived today. Stock rises by that amount and Goods Received
        Not Invoiced is posted against it.
      </p>

      <div className="mt-md overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="py-sm text-left text-overline text-text-secondary">
                Item
              </th>
              <th className="py-sm text-right text-overline text-text-secondary">
                Ordered
              </th>
              <th className="py-sm text-right text-overline text-text-secondary">
                Received
              </th>
              <th className="py-sm text-right text-overline text-text-secondary">
                Remaining
              </th>
              <th className="py-sm text-right text-overline text-text-secondary">
                Arrived today
              </th>
            </tr>
          </thead>
          <tbody>
            {drafts.map((d) => {
              const remaining = Math.max(d.ordered - d.alreadyReceived, 0);
              return (
                <tr key={d.lineId} className="border-b border-border-light">
                  <td className="py-sm text-body-sm text-text-primary">
                    {d.description || '—'}
                  </td>
                  <td className="py-sm text-right text-body-sm text-text-primary tabular">
                    {d.ordered}
                  </td>
                  <td className="py-sm text-right text-body-sm text-text-secondary tabular">
                    {d.alreadyReceived}
                  </td>
                  <td className="py-sm text-right text-body-sm text-text-secondary tabular">
                    {remaining}
                  </td>
                  <td className="py-sm text-right">
                    <input
                      value={d.arriving}
                      onChange={(e) => setArriving(d.lineId, e.target.value)}
                      inputMode="decimal"
                      disabled={busy || remaining === 0}
                      aria-label={`Quantity of ${d.description} arrived today`}
                      className={cn(
                        'h-10 w-24 rounded-md border bg-surface px-sm text-right text-body-md text-text-primary tabular',
                        'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
                        'disabled:bg-background disabled:opacity-70',
                        over.has(d.lineId) ? 'border-danger' : 'border-border',
                      )}
                    />
                    {/* The server refuses the whole call with OVER_FULFILLED,
                        and because the loop is one transaction a single bad
                        line rolls back every other line with it. */}
                    {over.has(d.lineId) && (
                      <p className="mt-xxs text-caption text-danger">
                        More than was ordered
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-lg flex flex-wrap justify-end gap-sm">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={busy || !anything || over.size > 0}>
          <PackageCheck className="size-4" />
          {busy ? 'Booking in…' : 'Book in'}
        </Button>
      </div>
    </Card>
  );
}

export default ReceiveItemsPanel;
