import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, Plus, Trash2, Truck } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { useRiders } from '@/features/delivery/useRiders';
import { useCustomerOptions, useInventoryOptions } from '@/features/documents/useDocumentPickers';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import type { CustomerAddress } from '@/models/customer';
import {
  PRIORITY_OPTIONS,
  deliveryPayload,
  draftTotals,
  emptyDeliveryForm,
  hasDeliveryErrors,
  newLineDraft,
  riderLabel,
  validateDelivery,
  type DeliveryErrors,
  type DeliveryForm,
  type DeliveryLineDraft,
  type DeliveryPriority,
  type StockInfo,
} from '@/models/delivery';
import { isoToday } from '@/models/document';
import { createDelivery } from '@/networks/delivery/deliveryNetwork';
import { formatMoney, toDecimal } from '@/utils/money';
import { CreditLimitDialog } from '@/features/customers/CreditLimitDialog';
import { creditLimitError, type CreditAssessment } from '@/models/credit';

/** Radix Select will not hold an empty value, so "no rider" needs a word. */
const NO_RIDER = 'none';

const formatAddress = (a: CustomerAddress | undefined): string =>
  a
    ? [a.street, [a.city, a.state].filter(Boolean).join(', '), a.country].filter(Boolean).join('\n')
    : '';

/**
 * Create a delivery — the app's Create Delivery screen. Direct for staff
 * (`delivery.create`).
 *
 * Two things are deliberately different from a plain order form:
 *   - Choosing a rider here DISPATCHES at once (sales order + stock to Goods in
 *     Transit), so it asks first and says so. Leaving it unassigned posts
 *     nothing.
 *   - There is no "prepaid" switch. On the server it raises an invoice and a
 *     payment directly — revenue and cash with no owner sign-off — which the
 *     rest of this console never lets staff do.
 */
export default function CreateDeliveryPage() {
  const enabled = useFeature('delivery');
  const canCreate = useCapability('delivery.create').allowed;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { options: customerOptions, byId: customersById, isLoading: customersLoading } =
    useCustomerOptions();
  const { items } = useInventoryOptions();
  const { riders } = useRiders(enabled);

  const [form, setForm] = useState<DeliveryForm>(emptyDeliveryForm);
  const [errors, setErrors] = useState<DeliveryErrors>({ line: {} });
  const [confirming, setConfirming] = useState(false);

  const stock = useMemo(
    () =>
      new Map<string, StockInfo>(
        items.map((i) => [i.id, { name: i.name, quantityOnHand: i.quantityOnHand }]),
      ),
    [items],
  );
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const itemOptions = useMemo(
    () =>
      items.map((i) => ({
        value: i.id,
        label: `${i.sku ? `${i.sku} — ` : ''}${i.name} · ${i.quantityOnHand} on hand`,
      })),
    [items],
  );

  const riderOptions = useMemo(
    () => [
      { value: NO_RIDER, label: 'Leave unassigned — assign later' },
      ...riders
        .filter((r) => r.status === 'active')
        .map((r) => ({
          value: r.userId,
          label: `${riderLabel(r)} · ${r.isAvailable ? 'available' : 'busy'} · load ${r.currentLoad}`,
        })),
    ],
    [riders],
  );

  const customer = customersById.get(form.customerId);
  const destination = customer
    ? formatAddress(customer.shippingAddress) ||
      formatAddress(customer.billingAddress) ||
      customer.address
    : '';
  const totals = draftTotals(form.lines);
  const dispatching = form.personnelId !== '';
  const riderName = riderLabel(riders.find((r) => r.userId === form.personnelId));

  const patch = (p: Partial<DeliveryForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => ({
      ...e,
      ...(p.customerId !== undefined ? { customerId: undefined } : {}),
    }));
  };

  const setLine = (key: string, p: Partial<DeliveryLineDraft>) => {
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...p } : l)) }));
    setErrors((e) => {
      const line = { ...e.line };
      delete line[key];
      return { ...e, lines: undefined, line };
    });
  };

  const pickItem = (key: string, itemId: string) => {
    const item = itemsById.get(itemId);
    // Default the price to the item's selling price; the dispatcher can change it.
    setLine(key, {
      itemId,
      unitPrice: item && item.sellingPrice > 0 ? String(item.sellingPrice) : '',
    });
  };

  const removeLine = (key: string) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.length > 1 ? f.lines.filter((l) => l.key !== key) : [newLineDraft()],
    }));

  const [creditIssue, setCreditIssue] = useState<CreditAssessment | null>(null);

  const save = useMutation({
    mutationFn: (overrideReason?: string) => {
      const body = deliveryPayload(form, customer?.name ?? '', stock);
      return createDelivery(overrideReason ? { ...body, creditOverride: { reason: overrideReason } } : body);
    },
    onSuccess: (d) => {
      invalidateDeliveries(queryClient);
      setConfirming(false);
      toast.success(dispatching ? 'Delivery created and dispatched' : 'Delivery created', {
        description: dispatching
          ? `${d.referenceNo} is with ${riderName}. The stock is in Goods in Transit.`
          : `${d.referenceNo} is waiting for a rider.`,
      });
      navigate(`/deliveries/${d.id}`, { replace: true });
    },
    onError: (e: Error) => {
      setConfirming(false);
      // Dispatching on credit past the customer's limit.
      const credit = creditLimitError(e);
      if (credit) {
        setCreditIssue(credit);
        return;
      }
      toast.error('Could not create the delivery', { description: e.message });
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateDelivery(form, stock);
    setErrors(e);
    if (hasDeliveryErrors(e)) return;
    if (dispatching) setConfirming(true);
    else save.mutate(undefined);
  };

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Truck}
        title="Deliveries"
        body="Delivery operations are not included in your company’s plan."
      />
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-4xl flex-col gap-lg" noValidate>
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/deliveries">
          <ArrowLeft className="size-4" />
          Delivery monitor
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">New delivery</h1>
        <p className="text-body-sm text-text-secondary">
          Goods from the warehouse to a customer. The sale is recorded only when the rider’s
          completion is approved.
        </p>
      </div>

      {/* ── Customer ──────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Customer" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Customer *"
            value={form.customerId}
            onChange={(v) => patch({ customerId: v })}
            options={customerOptions}
            placeholder={customersLoading ? 'Loading customers…' : 'Choose a customer'}
            searchPlaceholder="Search customers…"
            error={errors.customerId}
          />
          <div>
            <p className="text-label-md text-text-secondary">Deliver to</p>
            <p className="mt-xxs whitespace-pre-line text-body-sm text-text-primary">
              {customer
                ? destination || 'This customer has no address on file.'
                : 'The customer’s shipping address.'}
            </p>
            {customer && (
              <p className="mt-xxs text-caption text-text-tertiary">
                Pinned on the map from this address when the delivery is created.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* ── Items ─────────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Items" />
        {errors.lines && <p className="mt-sm text-body-sm text-danger">{errors.lines}</p>}
        <div className="mt-md flex flex-col gap-md">
          {form.lines.map((l) => {
            const le = errors.line[l.key] ?? {};
            const q = Number(l.quantity);
            const amount =
              l.itemId && Number.isFinite(q) && l.unitPrice
                ? toDecimal(q)
                    .times(toDecimal(l.unitPrice.replace(/,/g, '') || 0))
                    .times(toDecimal(100).plus(toDecimal(l.taxRate || 0)))
                    .dividedBy(100)
                : null;
            return (
              <div
                key={l.key}
                className="grid items-start gap-sm border-b border-border-light pb-md last:border-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_5rem_7rem_auto]"
              >
                <Combobox
                  label="Item"
                  value={l.itemId}
                  onChange={(v) => pickItem(l.key, v)}
                  options={itemOptions}
                  placeholder="Choose an item"
                  searchPlaceholder="Search by name or SKU…"
                  error={le.itemId}
                  compact
                />
                <Input
                  label="Qty"
                  value={l.quantity}
                  onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                  inputMode="numeric"
                  className="tabular"
                  error={le.quantity}
                />
                <Input
                  label="Unit price"
                  value={l.unitPrice}
                  onChange={(e) => setLine(l.key, { unitPrice: e.target.value })}
                  inputMode="decimal"
                  className="tabular"
                  error={le.unitPrice}
                />
                <Input
                  label="Tax %"
                  value={l.taxRate}
                  onChange={(e) => setLine(l.key, { taxRate: e.target.value.replace(/[^0-9.]/g, '') })}
                  inputMode="decimal"
                  placeholder="0"
                  className="text-right tabular"
                  trailing={<span className="text-body-sm text-text-tertiary">%</span>}
                  error={le.taxRate}
                />
                <div>
                  <p className="text-label-md text-text-secondary">Amount</p>
                  <p className="mt-sm text-body-md tabular text-text-primary">
                    {amount ? formatMoney(amount.toDecimalPlaces(2)) : '—'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="text"
                  size="sm"
                  className="mt-lg"
                  onClick={() => removeLine(l.key)}
                  aria-label="Remove line"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-md flex flex-wrap items-end justify-between gap-md">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, newLineDraft()] }))}
          >
            <Plus className="size-4" />
            Add item
          </Button>
          <div className="text-right">
            <p className="text-body-sm text-text-secondary tabular">
              Subtotal {formatMoney(totals.subtotal)} · Tax {formatMoney(totals.tax)}
            </p>
            <p className="text-h4 tabular text-text-primary">{formatMoney(totals.total)}</p>
          </div>
        </div>
      </Card>

      {/* ── Schedule ──────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Schedule" />
        <div className="mt-md grid gap-md sm:grid-cols-3">
          <Select
            label="Priority"
            value={form.priority}
            onChange={(v) => patch({ priority: v as DeliveryPriority })}
            options={PRIORITY_OPTIONS}
          />
          <DateField
            label="Wanted on"
            value={form.preferredDate}
            onChange={(v) => patch({ preferredDate: v })}
            min={isoToday()}
          />
          <Input
            label="Time slot"
            value={form.preferredTimeSlot}
            onChange={(e) => patch({ preferredTimeSlot: e.target.value })}
            maxLength={64}
            placeholder="10am – 1pm"
          />
          <div className="sm:col-span-3">
            <Textarea
              label="Notes for the rider"
              value={form.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              rows={2}
              placeholder="Gate number, who to ask for…"
            />
          </div>
        </div>
      </Card>

      {/* ── Rider ─────────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Rider" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Select
            label="Assign to"
            value={form.personnelId || NO_RIDER}
            onChange={(v) => patch({ personnelId: v === NO_RIDER ? '' : v })}
            options={riderOptions}
          />
          {dispatching ? (
            <p className="flex items-start gap-xs rounded-md bg-warning-lighter p-md text-body-sm text-text-primary">
              <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
              Assigning now dispatches: a sales order is raised and the stock moves from
              Inventory to Goods in Transit as soon as you create it.
            </p>
          ) : (
            <p className="self-center text-body-sm text-text-secondary">
              Unassigned deliveries post nothing. Assign one later from Assign Deliveries.
            </p>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to="/deliveries">Cancel</Link>
        </Button>
        <Button type="submit" disabled={!canCreate || save.isPending}>
          {save.isPending ? 'Creating…' : dispatching ? 'Create and dispatch' : 'Create delivery'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Dispatch to ${riderName}?`}
        description={`Creating this delivery raises a sales order and moves its stock to Goods in Transit straight away — ${formatMoney(
          totals.total,
        )} of goods leave the shelf. The sale itself posts only when the rider’s completion is approved.`}
        confirmLabel="Create and dispatch"
        busy={save.isPending}
        onConfirm={() => save.mutate(undefined)}
      />
      <CreditLimitDialog
        assessment={creditIssue}
        onOpenChange={(open) => !open && setCreditIssue(null)}
        busy={save.isPending}
        onOverride={(reason) => {
          setCreditIssue(null);
          save.mutate(reason);
        }}
      />
    </form>
  );
}
