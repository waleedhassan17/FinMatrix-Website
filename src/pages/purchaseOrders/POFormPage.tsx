import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Info, Plus, ShoppingCart } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { LineItemRow } from '@/components/shared/LineItemRow';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField, Textarea } from '@/components/ui/Field';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import {
  useInventoryOptions,
  useVendorOptions,
} from '@/features/documents/useDocumentPickers';
import { useCapability } from '@/hooks/useCapability';
import {
  computeTotals,
  freshLine,
  isoToday,
  lineAmountOf,
  validateLines,
  type FormLineItem,
} from '@/models/document';
import { poPrefillLine } from '@/models/itemPurchaseOrders';
import {
  isPOEditable,
  type PurchaseOrderFormData,
} from '@/models/purchaseOrder';
import { getItem } from '@/networks/inventory/inventoryNetwork';
import {
  createPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrder,
} from '@/networks/purchases/purchaseOrderNetwork';
import {
  purchaseOrderFormToPayload,
  purchaseOrderToFormData,
} from '@/serializers/purchaseOrderSerializer';

const emptyForm = (): PurchaseOrderFormData => ({
  vendorId: '',
  vendorName: '',
  orderDate: isoToday(),
  expectedDate: '',
  lines: [freshLine()],
  notes: '',
});

export default function POFormPage() {
  const { poId } = useParams<{ poId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(poId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createCap = useCapability('purchaseOrder.create');
  const editCap = useCapability('purchaseOrder.edit');

  const { byId: vendorsById, options: vendorOptions } = useVendorOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  const [form, setForm] = useState<PurchaseOrderFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Raised from an inventory item's "Create PO": the form starts from that
  // item and goes back to it.
  const prefillItemId = isEditing ? '' : (searchParams.get('itemId') ?? '');
  const prefilled = useRef(false);

  const { data: existing, isLoading } = useQuery({
    queryKey: ['purchase-orders', poId],
    queryFn: () => getPurchaseOrderById(poId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing) setForm(purchaseOrderToFormData(existing));
  }, [existing]);

  useEffect(() => {
    const preset = searchParams.get('vendorId');
    if (!preset || isEditing) return;
    const v = vendorsById.get(preset);
    if (v) setForm((f) => ({ ...f, vendorId: v.id, vendorName: v.name }));
  }, [searchParams, vendorsById, isEditing]);

  // The whole item — the picker's list carries no description or reorder
  // quantity. Same key as the item page, so coming from there it is cached.
  const { data: prefillItem } = useQuery({
    queryKey: ['inventory', 'items', prefillItemId],
    queryFn: () => getItem(prefillItemId),
    enabled: Boolean(prefillItemId) && inventoryEnabled,
  });

  // Seed the first line the way the app does: the item, at its cost, for its
  // reorder quantity. It runs once, so a later refetch never overwrites what
  // the user has typed. The vendor stays blank — an item carries no supplier
  // to guess from, and the API needs a real one.
  useEffect(() => {
    if (!prefillItem || prefilled.current) return;
    prefilled.current = true;
    setForm((f) => ({ ...f, lines: [poPrefillLine(prefillItem), ...f.lines.slice(1)] }));
  }, [prefillItem]);

  // A purchase order has no discount, so 'none'/0 are constants here rather
  // than form state — computeTotals is otherwise the same arithmetic.
  const totals = useMemo(
    () => computeTotals(form.lines, 'none', '0'),
    [form.lines],
  );

  const patch = (p: Partial<PurchaseOrderFormData>) =>
    setForm((f) => ({ ...f, ...p }));

  const updateLine = (id: string, field: keyof FormLineItem, value: string) =>
    patch({
      lines: form.lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    });

  /**
   * Picking an inventory item fills the description and the item's **cost**.
   *
   * Not its selling price — that is what the sales forms use, and putting it on
   * a PO line would order stock at retail and overstate both the payable and
   * the value of the goods received.
   */
  const selectItem = (lineId: string, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    patch({
      lines: form.lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              itemId,
              description: item?.name ?? l.description,
              unitPrice: item ? String(item.unitCost) : l.unitPrice,
            }
          : l,
      ),
    });
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a vendor';
    if (!form.orderDate) errs.orderDate = 'Order date is required';
    const lineError = validateLines(form.lines, totals);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: async () => {
      const payload = purchaseOrderFormToPayload(form);
      if (isEditing) {
        return {
          kind: 'updated' as const,
          po: await updatePurchaseOrder(poId!, payload),
        };
      }
      return { kind: 'created' as const, result: await createPurchaseOrder(payload) };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'updated') {
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
        toast.success('Purchase order updated');
        navigate(`/purchase-orders/${outcome.po.id}`, { replace: true });
        return;
      }

      if (outcome.result.pending) {
        // No PO exists — do not invalidate the list, a refetch would only
        // confirm its absence.
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'The order is raised once the owner approves it.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }

      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Purchase order created', {
        description: `${outcome.result.purchaseOrder.poNumber} has been raised.`,
      });
      navigate(`/purchase-orders/${outcome.result.purchaseOrder.id}`, {
        replace: true,
      });
    },
    onError: (e: Error) =>
      toast.error('Could not save purchase order', { description: e.message }),
  });

  if (isEditing && isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading purchase order…</p>;
  }

  /**
   * The second of the two edit gates.
   *
   * The first is the button, which does not render for staff (`purchaseOrder
   * .edit` is `false`) or on a non-draft. This one stops a pasted URL, because
   * PATCH deletes every line and rebuilds it with `receivedQty: '0'` while
   * leaving the stock and the GRNI entry posted — the paperwork would then
   * disagree with the ledger with nothing to show what happened.
   */
  if (isEditing && existing && !isPOEditable(existing.status)) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">
          This order can no longer be edited
        </p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          Only a draft can be rewritten. Once an order is sent, editing it would
          erase the record of what has already been received while leaving that
          stock on the shelf.
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to={`/purchase-orders/${poId}`}>Back to the order</Link>
        </Button>
      </Card>
    );
  }

  if (isEditing && !editCap.allowed) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Not available</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          Only the owner can rewrite a purchase order they approved.
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to={`/purchase-orders/${poId}`}>Back to the order</Link>
        </Button>
      </Card>
    );
  }

  const busy = save.isPending;
  const backTo = isEditing
    ? `/purchase-orders/${poId}`
    : prefillItemId
      ? `/inventory/${prefillItemId}`
      : '/purchase-orders';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={backTo}>
          <ArrowLeft className="size-4" />
          {prefillItemId ? 'Back to item' : 'Back'}
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? `Edit ${existing?.poNumber ?? 'order'}` : 'New purchase order'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          What you are ordering from a supplier.
        </p>
      </div>

      {createCap.needsApproval && !isEditing && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This order will be sent to the owner for approval. Nothing is ordered
            and no commitment is made until they approve it.
          </p>
        </div>
      )}

      {/* ── Order details ───────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Order details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Vendor *"
            value={form.vendorId}
            onChange={(vendorId) =>
              patch({ vendorId, vendorName: vendorsById.get(vendorId)?.name ?? '' })
            }
            options={vendorOptions}
            placeholder="Select a vendor…"
            searchPlaceholder="Search vendors…"
            error={errors.vendorId}
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Order date *"
            value={form.orderDate}
            onChange={(v) => patch({ orderDate: v })}
            error={errors.orderDate}
          />
          <DateField
            label="Expected date"
            value={form.expectedDate}
            onChange={(v) => patch({ expectedDate: v })}
            min={form.orderDate}
            hint="Optional."
          />
        </div>

        {!isEditing && (
          <p className="mt-sm text-caption text-text-tertiary">
            The PO number is assigned when you save.
          </p>
        )}
      </Card>

      {/* ── Lines ───────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader
          title="Order lines"
          right={
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => patch({ lines: [...form.lines, freshLine()] })}
            >
              <Plus className="size-4" />
              Add line
            </Button>
          }
        />

        {errors.lines && (
          <p className="mt-sm flex items-center gap-xs text-caption text-danger">
            <AlertCircle className="size-4" />
            {errors.lines}
          </p>
        )}

        <div className="mt-md flex flex-col gap-md">
          {form.lines.map((line, index) => (
            <LineItemRow
              key={line.id}
              index={index}
              description={line.description}
              quantity={line.quantity}
              unitPrice={line.unitPrice}
              taxRate={line.taxRate}
              lineAmount={lineAmountOf(line)}
              // A PO orders a quantity at a cost. Same arithmetic, and the
              // wrong word here reads as a selling price.
              itemLabel="Line"
              quantityLabel="Ordered"
              priceLabel="Unit cost"
              onDescriptionChange={(v) => updateLine(line.id, 'description', v)}
              onQuantityChange={(v) => updateLine(line.id, 'quantity', v)}
              onUnitPriceChange={(v) => updateLine(line.id, 'unitPrice', v)}
              onTaxRateChange={(v) => updateLine(line.id, 'taxRate', v)}
              onDelete={() =>
                patch({ lines: form.lines.filter((l) => l.id !== line.id) })
              }
              canDelete={form.lines.length > 1}
              topSlot={
                inventoryEnabled ? (
                  <Combobox
                    label="Inventory item (optional)"
                    value={line.itemId}
                    onChange={(v) => selectItem(line.id, v)}
                    options={itemOptions}
                    placeholder="Link an inventory item…"
                    searchPlaceholder="Search items…"
                    compact
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Notes" />
        <div className="mt-md">
          <Textarea
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Delivery instructions, terms, anything the supplier should see…"
          />
        </div>
      </Card>

      {/* No discount card — a purchase order has no discount field. */}
      <SummaryPanel
        title="Order summary"
        icon={<ShoppingCart className="size-4" />}
        total={{ label: 'Order total', value: totals.total }}
      >
        <SummaryRow label="Subtotal" value={totals.subtotal} />
        <SummaryRow label="Tax" value={totals.taxAmount} />
      </SummaryPanel>

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={backTo}>Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          disabled={busy}
        >
          {busy
            ? 'Saving…'
            : isEditing
              ? 'Save changes'
              : createCap.needsApproval
                ? createCap.submitLabel('Create order')
                : 'Create order'}
        </Button>
      </div>
    </div>
  );
}
