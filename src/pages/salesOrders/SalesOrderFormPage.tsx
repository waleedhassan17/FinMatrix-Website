import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField } from '@/components/ui/Field';
import { DocumentFormSections } from '@/features/documents/DocumentFormSections';
import {
  useCustomerOptions,
  useInventoryOptions,
} from '@/features/documents/useDocumentPickers';
import {
  computeTotals,
  freshLine,
  isoToday,
  validateLines,
  type DiscountType,
  type FormLineItem,
} from '@/models/document';
import { areLinesEditable, type SalesOrderFormData } from '@/models/salesOrder';
import {
  createSalesOrder,
  getSalesOrderById,
  updateSalesOrder,
} from '@/networks/sales/salesOrderNetwork';
import {
  salesOrderFormToPayload,
  salesOrderFormToUpdatePayload,
  salesOrderToFormData,
} from '@/serializers/salesOrderSerializer';

const emptyForm = (): SalesOrderFormData => ({
  customerId: '',
  customerName: '',
  orderDate: isoToday(),
  expectedDate: '',
  lines: [freshLine()],
  discountType: 'none',
  discountValue: '0',
  notes: '',
});

export default function SalesOrderFormPage() {
  const { salesOrderId } = useParams<{ salesOrderId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(salesOrderId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { byId: customersById, options: customerOptions } = useCustomerOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  const [form, setForm] = useState<SalesOrderFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: existing, isLoading } = useQuery({
    queryKey: ['sales-orders', salesOrderId],
    queryFn: () => getSalesOrderById(salesOrderId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing) setForm(salesOrderToFormData(existing));
  }, [existing]);

  useEffect(() => {
    const preset = searchParams.get('customerId');
    if (!preset || isEditing) return;
    const c = customersById.get(preset);
    if (c) setForm((f) => ({ ...f, customerId: c.id, customerName: c.name }));
  }, [searchParams, customersById, isEditing]);

  const totals = useMemo(
    () => computeTotals(form.lines, form.discountType, form.discountValue),
    [form.lines, form.discountType, form.discountValue],
  );

  const patch = (p: Partial<SalesOrderFormData>) => setForm((f) => ({ ...f, ...p }));

  // Lines are locked once anything has shipped. The server would let us send
  // them and would silently reset every quantityFulfilled to zero.
  const linesEditable = !existing || areLinesEditable(existing.status);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    if (!form.orderDate) errs.orderDate = 'Order date is required';
    if (linesEditable) {
      const lineError = validateLines(form.lines, totals);
      if (lineError) errs.lines = lineError;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: () =>
      isEditing
        ? updateSalesOrder(
            salesOrderId!,
            salesOrderFormToUpdatePayload(form, linesEditable),
          )
        : createSalesOrder(salesOrderFormToPayload(form)),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      toast.success(isEditing ? 'Sales order updated' : 'Sales order created', {
        description: order.orderNumber ? `${order.orderNumber} has been saved.` : undefined,
      });
      navigate(`/sales-orders/${order.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not save sales order', { description: e.message }),
  });

  if (isEditing && isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading sales order…</p>;
  }

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/sales-orders/${salesOrderId}` : '/sales-orders'}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? `Edit ${existing?.orderNumber ?? 'order'}` : 'New sales order'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          A confirmed order. Nothing is billed and no stock moves until it is invoiced.
        </p>
      </div>

      <Card className="p-lg">
        <SectionHeader title="Order details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Customer *"
            value={form.customerId}
            onChange={(customerId) => {
              const c = customersById.get(customerId);
              patch({ customerId, customerName: c?.name ?? '' });
              setErrors((e) => ({ ...e, customerId: '' }));
            }}
            options={customerOptions}
            placeholder="Select a customer…"
            searchPlaceholder="Search customers…"
            error={errors.customerId}
            disabled={isEditing}
            hint={
              isEditing ? 'The customer cannot be changed after creation.' : undefined
            }
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
            The order number is assigned when you save.
          </p>
        )}
      </Card>

      <DocumentFormSections
        lines={form.lines}
        discountType={form.discountType}
        discountValue={form.discountValue}
        notes={form.notes}
        totals={totals}
        onLinesChange={(lines: FormLineItem[]) => patch({ lines })}
        onDiscountTypeChange={(discountType: DiscountType) => patch({ discountType })}
        onDiscountValueChange={(discountValue: string) => patch({ discountValue })}
        onNotesChange={(notes: string) => patch({ notes })}
        itemOptions={itemOptions}
        items={items}
        inventoryEnabled={inventoryEnabled}
        errors={errors}
        summaryTitle="Order summary"
        summaryIcon={<ClipboardList className="size-4" />}
        readOnly={!linesEditable}
        readOnlyNote={
          linesEditable
            ? undefined
            : 'Lines are locked because this order has started shipping. Changing them would reset the fulfilment record on every line. Dates and notes can still be edited.'
        }
      />

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={isEditing ? `/sales-orders/${salesOrderId}` : '/sales-orders'}>
            Cancel
          </Link>
        </Button>
        {/* salesOrder.create is 'direct' for both roles. */}
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          disabled={busy}
        >
          {busy ? 'Saving…' : isEditing ? 'Save changes' : 'Save sales order'}
        </Button>
      </div>
    </div>
  );
}
