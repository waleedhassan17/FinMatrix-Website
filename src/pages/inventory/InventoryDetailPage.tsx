import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { ArrowLeft, History, Package, PackagePlus, Pencil, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { DateField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { StatTile } from '@/components/ui/StatTile';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { invalidateInventory } from '@/features/inventory/invalidateInventory';
import { KpiTile } from '@/features/reports/KpiTile';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useAdminOnly, useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import {
  STOCK_STATUS_DISPLAY,
  canSetOpeningStock,
  formatQty,
  formatQtyChange,
  isReversibleAdjustment,
  itemValue,
  movementLabel,
  movementLink,
  openingStockPayload,
  stockStatus,
  validateOpeningStock,
  type OpeningStockForm,
  type StockMovement,
} from '@/models/inventory';
import { formatReportDate } from '@/models/reportPeriod';
import {
  getItem,
  getItemMovements,
  reverseAdjustment,
  setOpeningStock,
  toggleItem,
} from '@/networks/inventory/inventoryNetwork';
import { formatMoney, toDecimal } from '@/utils/money';

const columnHelper = createColumnHelper<StockMovement>();

/**
 * One item: what is on hand, what it is worth, and every movement that got it
 * there.
 *
 * The movements ledger is the stock subledger — each row is a receipt, a sale,
 * a dispatch or an adjustment, with the balance it left behind — and it drills
 * through to the document that caused it.
 */
export default function InventoryDetailPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const enabled = useFeature('inventory');
  const queryClient = useQueryClient();

  const canManage = useCapability('inventory.manageItems').allowed;
  const canAdjust = useCapability('inventory.adjust').allowed;
  const reverseCap = useCapability('transaction.void');
  const canToggle = useAdminOnly('inventory.toggleItem');
  const canOpening = useAdminOnly('inventory.openingStock');

  const [openingOpen, setOpeningOpen] = useState(false);
  const [opening, setOpening] = useState<OpeningStockForm>(() => ({
    quantity: '',
    asOfDate: isoToday(),
  }));
  const [reversing, setReversing] = useState<StockMovement | null>(null);

  const itemQuery = useQuery({
    queryKey: ['inventory', 'items', itemId],
    queryFn: () => getItem(itemId),
    enabled,
  });

  const movesQuery = useQuery({
    queryKey: ['inventory', 'items', itemId, 'movements'],
    queryFn: () => getItemMovements(itemId),
    enabled,
  });

  // The server orders by date only; within a day, newest-created first keeps a
  // same-day receipt and adjustment in the order they happened.
  const movements = useMemo(
    () =>
      [...(movesQuery.data?.rows ?? [])].sort(
        (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
      ),
    [movesQuery.data],
  );

  const toggle = useMutation({
    mutationFn: () => toggleItem(itemId),
    onSuccess: (item) => {
      invalidateInventory(queryClient);
      toast.success(item.isActive ? 'Item activated' : 'Item deactivated', {
        description: item.isActive
          ? 'It is selectable on documents again.'
          : 'It is hidden from pickers. Its stock and history are kept.',
      });
    },
    onError: (e: Error) => toast.error('Could not update the item', { description: e.message }),
  });

  const recordOpening = useMutation({
    mutationFn: () => setOpeningStock(itemId, openingStockPayload(opening)),
    onSuccess: () => {
      invalidateInventory(queryClient);
      setOpeningOpen(false);
      toast.success('Opening stock recorded', {
        description: 'Posted to Inventory (1200) against Opening Balance Equity (3900).',
      });
    },
    onError: (e: Error) =>
      toast.error('Could not record opening stock', { description: e.message }),
  });

  const reverse = useMutation({
    mutationFn: (adjustmentId: string) => reverseAdjustment(adjustmentId),
    onSuccess: (result) => {
      invalidateInventory(queryClient);
      setReversing(null);
      if (result.pending) {
        toast.success('Sent for approval', {
          description: 'The owner reverses it once they approve. Nothing has changed yet.',
        });
        return;
      }
      toast.success('Adjustment reversed', {
        description: 'The quantity is restored and a mirrored journal entry posted.',
      });
    },
    onError: (e: Error) => toast.error('Could not reverse', { description: e.message }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('date', {
        header: 'Date',
        cell: (c) => <span className="whitespace-nowrap">{formatReportDate(c.getValue())}</span>,
      }),
      columnHelper.accessor('sourceType', {
        header: 'Activity',
        cell: (c) => {
          const m = c.row.original;
          const link = movementLink(m);
          const label = movementLabel(m);
          // Opening stock writes its own label as the description; saying it
          // twice reads as a rendering fault.
          const detail = [m.reference, m.description]
            .filter((s) => s && s.toLowerCase() !== label.toLowerCase())
            .join(' · ');
          return (
            <div className="min-w-0">
              {link ? (
                <Link to={link} className="text-label-md text-primary hover:underline">
                  {label}
                </Link>
              ) : (
                <span className="text-label-md text-text-primary">{label}</span>
              )}
              {detail && <p className="text-caption text-text-tertiary">{detail}</p>}
            </div>
          );
        },
      }),
      columnHelper.accessor('quantityChange', {
        header: 'Change',
        meta: { align: 'right' },
        cell: (c) => (
          <span
            className={cn(
              'tabular text-label-md',
              c.getValue() > 0 ? 'text-success' : c.getValue() < 0 ? 'text-danger' : 'text-text-secondary',
            )}
          >
            {formatQtyChange(c.getValue())}
          </span>
        ),
      }),
      columnHelper.accessor('balanceAfter', {
        header: 'Balance',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatQty(c.getValue())}</span>,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: (c) =>
          isReversibleAdjustment(c.row.original) ? (
            <Button variant="text" size="sm" onClick={() => setReversing(c.row.original)}>
              <Undo2 className="size-4" />
              {reverseCap.needsApproval ? 'Request reversal' : 'Reverse'}
            </Button>
          ) : null,
      }),
    ],
    [reverseCap.needsApproval],
  ) as never;

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Package}
        title="Inventory"
        body="Inventory is not included in your company’s plan."
      />
    );
  }

  if (itemQuery.isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading item…</p>;
  }

  const item = itemQuery.data;
  if (!item) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Item not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {itemQuery.error?.message ?? 'It may have been removed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/inventory">Back to inventory</Link>
        </Button>
      </Card>
    );
  }

  const status = stockStatus(item);
  const value = itemValue(item).toDecimalPlaces(2).toNumber();
  const unit = item.unitOfMeasure ? ` ${item.unitOfMeasure}` : '';
  const openingAvailable =
    !movesQuery.isLoading && canSetOpeningStock(item, movesQuery.data?.rows.length ?? 0);
  const openingErrors = validateOpeningStock(opening, item.unitCost);
  const openingValue = toDecimal(opening.quantity.replace(/,/g, '') || 0)
    .times(item.unitCost)
    .toDecimalPlaces(2);
  const margin =
    item.sellingPrice > 0
      ? toDecimal(item.sellingPrice)
          .minus(item.unitCost)
          .dividedBy(item.sellingPrice)
          .times(100)
          .toDecimalPlaces(1)
          .toString()
      : null;

  return (
    <div className="flex flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/inventory">
          <ArrowLeft className="size-4" />
          Inventory
        </Link>
      </Button>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-sm">
              <h1 className="text-h2 text-text-primary">{item.name}</h1>
              {item.isActive ? (
                <StatusBadge
                  status={STOCK_STATUS_DISPLAY[status].badge}
                  label={STOCK_STATUS_DISPLAY[status].label}
                />
              ) : (
                <StatusBadge status="inactive" />
              )}
            </div>
            <p className="text-body-sm text-text-secondary">
              {[item.sku, item.category].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex flex-wrap gap-xs">
            {canManage && (
              <Button asChild variant="secondary">
                <Link to={`/inventory/${item.id}/edit`}>
                  <Pencil className="size-4" />
                  Edit
                </Link>
              </Button>
            )}
            {canAdjust && (
              <Button asChild>
                <Link to={`/inventory/${item.id}/adjust`}>
                  <SlidersHorizontal className="size-4" />
                  Adjust stock
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ── Figures ─────────────────────────────────────────────────── */}
      <div className="grid gap-md sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="On hand"
          value={`${formatQty(item.quantityOnHand)}${unit}`}
          tone={status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'default'}
        />
        <KpiTile label="Average unit cost" value={item.unitCost} hint="Weighted average" />
        <KpiTile label="Valuation" value={value} hint="On hand × average cost" />
        <StatTile
          label="Committed"
          value={formatQty(item.quantityCommitted)}
          hint="Reserved for open orders"
        />
        <StatTile
          label="On order"
          value={formatQty(item.quantityOnOrder)}
          hint="On purchase orders not yet received"
        />
      </div>

      {/* ── Opening stock ───────────────────────────────────────────── */}
      {openingAvailable && (
        <Card className="flex flex-wrap items-center justify-between gap-md p-lg">
          <div className="flex min-w-0 items-start gap-sm">
            <PackagePlus className="mt-[2px] size-5 shrink-0 text-primary" />
            <div>
              <p className="text-label-lg text-text-primary">No stock recorded yet</p>
              <p className="text-body-sm text-text-secondary">
                {canOpening
                  ? 'If you already held this item before using FinMatrix, record it as opening stock. Otherwise it arrives when a purchase order is received.'
                  : 'Stock arrives when a purchase order is received, or when the owner records the opening stock.'}
              </p>
            </div>
          </div>
          {canOpening && (
            <Button variant="secondary" onClick={() => setOpeningOpen(true)}>
              Record opening stock
            </Button>
          )}
        </Card>
      )}

      <div className="grid gap-lg lg:grid-cols-3">
        {/* ── Details ─────────────────────────────────────────────── */}
        <Card className="p-lg">
          <SectionHeader title="Details" />
          <div className="mt-md">
            <Row label="Selling price" value={formatMoney(item.sellingPrice)} />
            <Row label="Margin at average cost" value={margin === null ? '—' : `${margin}%`} />
            <Row label="Unit" value={item.unitOfMeasure || '—'} />
            <Row label="Reorder point" value={item.reorderPoint ? formatQty(item.reorderPoint) : 'Not set'} />
            <Row
              label="Reorder quantity"
              value={item.reorderQuantity ? formatQty(item.reorderQuantity) : 'Not set'}
            />
            <Row
              label="Min / max stock"
              value={
                item.minStock || item.maxStock
                  ? `${formatQty(item.minStock)} / ${item.maxStock ? formatQty(item.maxStock) : '—'}`
                  : 'Not set'
              }
            />
          </div>
          {item.description && (
            <p className="mt-md whitespace-pre-line text-body-sm text-text-secondary">
              {item.description}
            </p>
          )}

          {canToggle && (
            <div className="mt-lg border-t border-border-light pt-md">
              <p className="text-body-sm text-text-secondary">
                {item.isActive
                  ? 'Deactivating hides the item from invoice, order and delivery pickers. Its stock and history stay.'
                  : 'Reactivating makes it selectable again.'}
              </p>
              <Button
                variant={item.isActive ? 'secondary' : 'primary'}
                size="sm"
                className="mt-sm"
                disabled={toggle.isPending}
                onClick={() => toggle.mutate()}
              >
                {toggle.isPending ? 'Updating…' : item.isActive ? 'Deactivate item' : 'Activate item'}
              </Button>
            </div>
          )}
        </Card>

        {/* ── Movements ───────────────────────────────────────────── */}
        <section className="flex flex-col gap-sm lg:col-span-2">
          <div className="flex items-center gap-xs">
            <History className="size-4 text-text-secondary" />
            <h2 className="text-h4 text-text-primary">Stock movements</h2>
          </div>
          {movesQuery.error && (
            <p className="text-body-sm text-danger">{movesQuery.error.message}</p>
          )}
          <DataTable
            columns={columns}
            data={movements}
            isLoading={movesQuery.isLoading}
            empty={
              <p className="p-lg text-center text-body-sm text-text-tertiary">
                No movements yet. Receipts, sales, deliveries and adjustments appear
                here as they happen.
              </p>
            }
          />
          {movesQuery.data?.truncated && (
            <p className="text-caption text-text-tertiary">
              Showing the latest {movements.length} movements.
            </p>
          )}
        </section>
      </div>

      {/* ── Opening stock dialog ────────────────────────────────────── */}
      <ConfirmDialog
        open={openingOpen}
        onOpenChange={setOpeningOpen}
        title="Record opening stock"
        description={
          item.unitCost > 0
            ? `Posts Dr Inventory (1200) / Cr Opening Balance Equity (3900) at ${formatMoney(
                item.unitCost,
              )} a unit. This is a one-time entry — later changes go through receipts and adjustments.`
            : 'This item has no unit cost, and stock with no cost has no value to post. Set a unit cost on the item first.'
        }
        confirmLabel="Record opening stock"
        busy={recordOpening.isPending}
        confirmDisabled={Object.keys(openingErrors).length > 0}
        onConfirm={() => recordOpening.mutate()}
      >
        {item.unitCost > 0 ? (
          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Quantity"
              value={opening.quantity}
              onChange={(e) => setOpening((o) => ({ ...o, quantity: e.target.value }))}
              inputMode="decimal"
              className="tabular"
              autoFocus
              hint={openingValue.greaterThan(0) ? `Worth ${formatMoney(openingValue)}` : undefined}
            />
            <DateField
              label="Held as of"
              value={opening.asOfDate}
              onChange={(v) => setOpening((o) => ({ ...o, asOfDate: v }))}
              max={isoToday()}
            />
          </div>
        ) : (
          <Button asChild variant="secondary" size="sm">
            <Link to={`/inventory/${item.id}/edit`}>Set a unit cost</Link>
          </Button>
        )}
      </ConfirmDialog>

      {/* ── Reverse an adjustment ───────────────────────────────────── */}
      <ConfirmDialog
        open={reversing !== null}
        onOpenChange={(o) => !o && setReversing(null)}
        title={reverseCap.needsApproval ? 'Ask the owner to reverse this?' : 'Reverse this adjustment?'}
        description={
          reversing
            ? reverseCap.needsApproval
              ? `The owner is asked to put back the ${formatQtyChange(
                  reversing.quantityChange,
                )} from ${formatReportDate(reversing.date)}. Nothing changes until they approve.`
              : `Puts back the ${formatQtyChange(reversing.quantityChange)} from ${formatReportDate(
                  reversing.date,
                )} at the cost it was booked at, and posts a mirrored journal entry. The original stays on file.`
            : undefined
        }
        confirmLabel={reverseCap.needsApproval ? 'Send for approval' : 'Reverse adjustment'}
        destructive={!reverseCap.needsApproval}
        busy={reverse.isPending}
        onConfirm={() => reversing && reverse.mutate(reversing.sourceId)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-border-light py-xs last:border-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="text-right text-body-sm text-text-primary tabular">{value}</span>
    </div>
  );
}
