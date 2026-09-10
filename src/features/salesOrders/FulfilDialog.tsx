import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import {
  buildFulfilDrafts,
  fulfilDraftsToPayload,
  overFulfilledDrafts,
  type FulfilDraft,
  type FulfilLinePayload,
  type SalesOrderLine,
} from '@/models/salesOrder';

/**
 * Record a shipment, line by line.
 *
 * The mobile app has no equivalent — it offers only "Mark Fully Fulfilled",
 * which sends every line at its full ordered quantity, so a partial shipment
 * cannot be recorded there at all even though the API and the data model both
 * support one. A warehouse ships partially all the time, and a desktop has room
 * for the table, so this exists.
 *
 * The subtlety worth knowing: the API's `quantityFulfilled` is the **cumulative
 * total** for the line, not the amount being shipped now. The user types what
 * is going out today; `fulfilDraftsToPayload` adds it to what has already
 * shipped. Getting that backwards would silently under-record every second
 * shipment.
 */
export function FulfilDialog({
  open,
  onOpenChange,
  lines,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: SalesOrderLine[];
  busy?: boolean;
  onSubmit: (payload: FulfilLinePayload[]) => void;
}) {
  const [drafts, setDrafts] = useState<FulfilDraft[]>([]);

  // Reset from the order every time it opens, so a previous session's typing
  // never carries into a new shipment.
  useEffect(() => {
    if (open) setDrafts(buildFulfilDrafts(lines));
  }, [open, lines]);

  const overFulfilled = useMemo(() => overFulfilledDrafts(drafts), [drafts]);
  const payload = useMemo(() => fulfilDraftsToPayload(drafts), [drafts]);

  const overIds = new Set(overFulfilled.map((d) => d.lineId));
  const nothingToShip = payload.length === 0;

  const setShipping = (lineId: string, value: string) =>
    setDrafts((ds) =>
      ds.map((d) =>
        d.lineId === lineId
          ? { ...d, shipping: value.replace(/[^0-9.]/g, '') }
          : d,
      ),
    );

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[color:var(--color-overlay)]" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-surface p-xl shadow-lg">
          <AlertDialog.Title className="text-h4 text-text-primary">
            Record a shipment
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-xs text-body-md text-text-secondary">
            Enter what is going out now. Quantities already shipped are shown for
            reference — you do not need to add them yourself.
          </AlertDialog.Description>

          <div className="mt-lg max-h-80 overflow-y-auto">
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
                    Shipped
                  </th>
                  <th className="py-sm text-right text-overline text-text-secondary">
                    Remaining
                  </th>
                  <th className="py-sm text-right text-overline text-text-secondary">
                    Ship now
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((d) => {
                  const remaining = Math.max(d.ordered - d.alreadyFulfilled, 0);
                  const over = overIds.has(d.lineId);
                  return (
                    <tr key={d.lineId} className="border-b border-border-light">
                      <td className="py-sm text-body-sm text-text-primary">
                        {d.description || '—'}
                      </td>
                      <td className="py-sm text-right text-body-sm text-text-primary tabular">
                        {d.ordered}
                      </td>
                      <td className="py-sm text-right text-body-sm text-text-secondary tabular">
                        {d.alreadyFulfilled}
                      </td>
                      <td className="py-sm text-right text-body-sm text-text-secondary tabular">
                        {remaining}
                      </td>
                      <td className="py-sm pl-sm text-right">
                        <input
                          value={d.shipping}
                          onChange={(e) => setShipping(d.lineId, e.target.value)}
                          inputMode="decimal"
                          aria-label={`Ship now, ${d.description}`}
                          aria-invalid={over || undefined}
                          className={cn(
                            'h-10 w-24 rounded-md border bg-surface px-sm text-right text-body-md text-text-primary tabular',
                            'outline-none transition-colors focus:border-[1.5px] focus:border-primary',
                            over ? 'border-danger' : 'border-border',
                          )}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Caught here rather than left to the server: one over-fulfilled
              line returns 400 OVER_FULFILLED and, because the loop runs in a
              transaction, rolls back every other line in the request too. */}
          {overFulfilled.length > 0 && (
            <p className="mt-md flex items-start gap-xs rounded-md bg-danger-lighter p-sm text-body-sm text-danger">
              <AlertCircle className="mt-[2px] size-4 shrink-0" />
              <span>
                {overFulfilled.length === 1
                  ? 'One line ships more than was ordered.'
                  : `${overFulfilled.length} lines ship more than was ordered.`}{' '}
                Reduce them before saving — the server rejects the whole shipment.
              </span>
            </p>
          )}

          <div className="mt-xl flex justify-end gap-sm">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              disabled={busy || nothingToShip || overFulfilled.length > 0}
              onClick={() => onSubmit(payload)}
            >
              {busy
                ? 'Saving…'
                : nothingToShip
                  ? 'Nothing to ship'
                  : `Record ${payload.length} line${payload.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export default FulfilDialog;
