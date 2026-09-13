import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ChevronRight,
  Clock,
  Package,
  PackagePlus,
  Pencil,
  RotateCw,
  ShoppingCart,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { DateField, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
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
import {
  ITEM_PO_SEARCH_LIMIT,
  itemLineQuantities,
  onOrderForItem,
  pendingPORequestsForItem,
  purchaseOrdersForItem,
} from '@/models/itemPurchaseOrders';
import { formatReportDate } from '@/models/reportPeriod';
import { fetchApprovals } from '@/networks/approvals/approvalsNetwork';
import {
  getItem,
  getItemMovements,
  reverseAdjustment,
  setOpeningStock,
  toggleItem,
} from '@/networks/inventory/inventoryNetwork';
import { getRecentPurchaseOrders } from '@/networks/purchases/purchaseOrderNetwork';
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

  // Purchase orders, as the app's POs tab has them. Staff may raise one too —
  // it files a request the owner approves — and the button says which.
  const poCap = useCapability('purchaseOrder.create');
  const posEnabled = useFeature('purchaseOrders');

  // The recent list filtered on its lines: there is no per-item endpoint. Kept
  // under the purchase-orders key, so creating, receiving or closing an order
  // anywhere refreshes this tab too.
  const posQuery = useQuery({
    queryKey: ['purchase-orders', 'for-item', itemId],
    queryFn: () => getRecentPurchaseOrders(),
    enabled: enabled && posEnabled,
    placeholderData: keepPreviousData,
  });

  // Staff only: their own requests for an order, still waiting on the owner.
  // An owner's orders never wait. Failing soft — losing these rows beats
  // failing a tab whose orders loaded fine.
  const requestsQuery = useQuery({
    queryKey: ['approvals', 'mine', 'po'],
    queryFn: () => fetchApprovals({ status: 'pending', type: 'po' }).catch(() => []),
    enabled: enabled && posEnabled && poCap.needsApproval,
  });

  const itemPOs = useMemo(
    () => purchaseOrdersForItem(posQuery.data?.rows ?? [], itemId),
    [posQuery.data, itemId],
  );
  const pendingRequests = useMemo(
    () => pendingPORequestsForItem(requestsQuery.data ?? [], itemId),
    [requestsQuery.data, itemId],
  );
  const onOrder = useMemo(() => onOrderForItem(itemPOs, itemId), [itemPOs, itemId]);
  // Only one page was searched; an unqualified "none" would be a confident
  // wrong answer to "is this already on order?".
  const poTruncated = (posQuery.data?.total ?? 0) > (posQuery.data?.rows.length ?? 0);

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

  if (itemQuery.isLoading) return <DetailPageSkeleton rail={false} />;

  const item = itemQuery.data;
  if (!item) {
    return (
      <PageMessage
        tone={itemQuery.isError ? 'error' : 'notFound'}
        title={itemQuery.isError ? 'This item could not be loaded' : 'Item not found'}
        description={itemQuery.error?.message ?? 'It may have been removed.'}
        onRetry={itemQuery.isError ? () => itemQuery.refetch() : undefined}
        backTo="/inventory"
        backLabel="Back to inventory"
      />
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

  // The PO form's item picker lists active items only, so an inactive item
  // could not be put on the order it opens.
  const canRaisePO = posEnabled && poCap.allowed && item.isActive;
  // Short on stock, ordering more is the likely next step — it leads.
  const needsStock = status === 'out' || status === 'low';

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/inventory', label: 'Inventory' }}
        title={item.name}
        status={
          item.isActive ? (
            <StatusBadge
              status={STOCK_STATUS_DISPLAY[status].badge}
              label={STOCK_STATUS_DISPLAY[status].label}
            />
          ) : (
            <StatusBadge status="inactive" />
          )
        }
        meta={[
          item.sku ? `SKU ${item.sku}` : null,
          item.category || null,
          item.unitOfMeasure ? `Sold by ${item.unitOfMeasure}` : null,
        ]}
        actions={
          (canManage || canAdjust || canRaisePO) && (
            <>
              {canManage && (
                <Button asChild variant="secondary" size="sm">
                  <Link to={`/inventory/${item.id}/edit`}>
                    <Pencil className="size-4" />
                    Edit
                  </Link>
                </Button>
              )}
              {canAdjust && (
                <Button asChild variant={canRaisePO && needsStock ? 'secondary' : 'primary'} size="sm">
                  <Link to={`/inventory/${item.id}/adjust`}>
                    <SlidersHorizontal className="size-4" />
                    Adjust stock
                  </Link>
                </Button>
              )}
              {canRaisePO && (
                <Button asChild variant={needsStock || !canAdjust ? 'primary' : 'secondary'} size="sm">
                  <Link to={`/purchase-orders/new?itemId=${item.id}`}>
                    <ShoppingCart className="size-4" />
                    {poCap.needsApproval ? 'Request PO' : 'Create PO'}
                  </Link>
                </Button>
              )}
            </>
          )
        }
      />

      {/* ── Figures ─────────────────────────────────────────────────────
          No "Committed": the server only ever writes zero there. On order is
          counted from the item's open purchase orders for the same reason. */}
      <div className={cn('grid gap-md sm:grid-cols-2', posEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
        <StatTile
          label="On hand"
          value={`${formatQty(item.quantityOnHand)}${unit}`}
          tone={status === 'out' ? 'danger' : status === 'low' ? 'warning' : 'default'}
        />
        <KpiTile label="Average unit cost" value={item.unitCost} hint="Weighted average" />
        <KpiTile label="Valuation" value={value} hint="On hand × average cost" />
        {posEnabled && (
          <StatTile
            label="On order"
            value={`${formatQty(onOrder.quantity)}${unit}`}
            hint={
              onOrder.orders === 0
                ? 'Nothing waiting on a supplier'
                : `Still to arrive on ${onOrder.orders} open purchase ${onOrder.orders === 1 ? 'order' : 'orders'}`
            }
            loading={posQuery.isLoading}
          />
        )}
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

      {/* grid-cols-1 is minmax(0, 1fr): without it the movements table sizes
          the single phone column and the whole page scrolls sideways. */}
      <div className="grid grid-cols-1 gap-lg lg:grid-cols-3">
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

        {/* ── Movements and purchase orders ───────────────────────── */}
        <section className="min-w-0 lg:col-span-2">
          <Tabs defaultValue="movements">
            <TabsList>
              <TabsTrigger value="movements">Stock movements</TabsTrigger>
              {posEnabled && (
                <TabsTrigger
                  value="purchase-orders"
                  count={posQuery.isLoading ? undefined : itemPOs.length + pendingRequests.length}
                >
                  Purchase orders
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="movements" className="flex flex-col gap-sm">
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
            </TabsContent>

            {posEnabled && (
              <TabsContent value="purchase-orders">
                <ItemPurchaseOrders
                  itemId={item.id}
                  orders={itemPOs}
                  requests={pendingRequests}
                  isLoading={posQuery.isLoading}
                  error={posQuery.error}
                  onRetry={() => posQuery.refetch()}
                  truncated={poTruncated}
                />
              </TabsContent>
            )}
          </Tabs>
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

/**
 * The item's purchase orders, as the app's POs tab shows them: a staff member's
 * own requests first — not orders yet, so they open My Requests — then every
 * order with a line for this item, counting this item's lines only.
 */
function ItemPurchaseOrders({
  itemId,
  orders,
  requests,
  isLoading,
  error,
  onRetry,
  truncated,
}: {
  itemId: string;
  orders: ReturnType<typeof purchaseOrdersForItem>;
  requests: ReturnType<typeof pendingPORequestsForItem>;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  truncated: boolean;
}) {
  const hasRows = orders.length > 0 || requests.length > 0;

  // Only a first load takes over the tab; a background refetch — coming back
  // from a new order — keeps the rows on screen.
  if (isLoading && !hasRows) {
    return (
      <Card className="flex flex-col gap-sm p-lg" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );
  }

  if (error && !hasRows) {
    return (
      <Card className="flex flex-col items-center gap-sm p-xl text-center">
        <p className="text-body-sm text-danger">
          {error.message || 'Could not load purchase orders.'}
        </p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RotateCw className="size-4" />
          Try again
        </Button>
      </Card>
    );
  }

  if (!hasRows) {
    return (
      <Card className="p-xl text-center">
        <p className="text-body-sm text-text-tertiary">
          {truncated
            ? `None in the ${ITEM_PO_SEARCH_LIMIT} most recent purchase orders — older ones are not searched.`
            : 'No purchase orders for this item yet.'}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border-light">
        {requests.map((req) => (
          <li key={req.id}>
            <Link
              to="/my-requests"
              className="flex items-center gap-sm px-lg py-md transition-colors hover:bg-surface-hover"
            >
              <Clock className="size-4 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-label-md text-text-primary">
                  {req.summary || 'Purchase order request'}
                </p>
                <p className="text-caption text-text-secondary">
                  Sent to the owner · not a purchase order yet
                </p>
              </div>
              <StatusBadge status="pending" label="Awaiting owner" />
              <ChevronRight className="hidden size-4 shrink-0 text-text-tertiary sm:block" aria-hidden="true" />
            </Link>
          </li>
        ))}

        {orders.map((po) => {
          const { ordered, received } = itemLineQuantities(po, itemId);
          return (
            <li key={po.id}>
              <Link
                to={`/purchase-orders/${po.id}`}
                className="flex items-center gap-sm px-lg py-md transition-colors hover:bg-surface-hover"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-label-md text-text-primary">
                    {po.poNumber || 'Purchase order'}
                  </p>
                  <p className="truncate text-caption text-text-secondary">
                    {[po.vendorName, po.orderDate ? formatReportDate(po.orderDate.slice(0, 10)) : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-label-md tabular text-text-primary">
                    {formatQty(ordered)} ordered
                  </p>
                  {/* Receipts show whenever there are any — including once the
                      order is complete. */}
                  <p className="text-caption tabular text-text-tertiary">
                    {received > 0 ? `${formatQty(received)} received` : 'None received'}
                  </p>
                </div>
                <StatusBadge status={po.status} />
                <ChevronRight className="hidden size-4 shrink-0 text-text-tertiary sm:block" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
      {truncated && (
        <p className="border-t border-border-light bg-surface-2 px-lg py-sm text-caption text-text-tertiary">
          Searched the {ITEM_PO_SEARCH_LIMIT} most recent purchase orders. Older ones are not shown.
        </p>
      )}
    </Card>
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
