import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { useCapability } from '@/hooks/useCapability';
import {
  computeTotals,
  freshLine,
  isoToday,
  validateLines,
  type FormLineItem,
} from '@/models/document';
import type { CreditMemoFormData } from '@/models/creditMemo';
import { createCreditMemo } from '@/networks/sales/creditMemoNetwork';
import { creditMemoFormToPayload } from '@/serializers/creditMemoSerializer';

const emptyForm = (): CreditMemoFormData => ({
  customerId: '',
  customerName: '',
  date: isoToday(),
  reason: '',
  lines: [freshLine()],
});

export default function CreditMemoFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('creditMemo.manage');
  const { byId: customersById, options: customerOptions } = useCustomerOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  const [form, setForm] = useState<CreditMemoFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const preset = searchParams.get('customerId');
    if (!preset) return;
    const c = customersById.get(preset);
    if (c) setForm((f) => ({ ...f, customerId: c.id, customerName: c.name }));
  }, [searchParams, customersById]);

  // Credit memos have no discount, so the totals are subtotal + tax.
  const totals = useMemo(
    () => computeTotals(form.lines, 'none', '0'),
    [form.lines],
  );

  const patch = (p: Partial<CreditMemoFormData>) => setForm((f) => ({ ...f, ...p }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    if (!form.date) errs.date = 'Date is required';
    const lineError = validateLines(form.lines, totals);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: () =>
      createCreditMemo(creditMemoFormToPayload(form), idempotencyKey.current),
    onSuccess: (result) => {
      if (result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'Nothing is credited until the owner approves it.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['credit-memos'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Credit memo issued', {
        description: result.creditMemo.creditMemoNumber
          ? `${result.creditMemo.creditMemoNumber} has been created.`
          : undefined,
      });
      navigate(`/credit-memos/${result.creditMemo.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not issue credit memo', { description: e.message }),
  });

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/credit-memos">
          <ArrowLeft className="size-4" />
          Credit memos
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">New credit memo</h1>
        <p className="text-body-sm text-text-secondary">
          Credit a customer for returned or over-billed goods. This posts against
          your books immediately.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This credit memo will be sent to the owner for approval. Nothing is
            credited and no stock moves until they approve it.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader title="Credit details" />
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
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Date *"
            value={form.date}
            onChange={(v) => patch({ date: v })}
            error={errors.date}
            containerClassName="sm:col-span-2"
          />
        </div>

        <p className="mt-sm text-caption text-text-tertiary">
          The credit memo number is assigned when you save.
        </p>
      </Card>

      {/* The item link is not cosmetic here: a line with an inventory item
          restocks the goods and reverses their cost, while a free-text line is
          a pure revenue credit. That is the difference between a return and a
          write-off, so it is worth saying out loud. */}
      {inventoryEnabled && (
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
          <RotateCcw className="mt-[2px] size-4 shrink-0 text-text-tertiary" />
          <p className="text-body-sm text-text-secondary">
            Link a line to an inventory item to put the goods back on the shelf
            and reverse their cost. Leave it free-text to credit the money only —
            a write-off rather than a return.
          </p>
        </div>
      )}

      <DocumentFormSections
        lines={form.lines}
        // Credit memos have no discount field on the DTO at all.
        showDiscount={false}
        discountType="none"
        discountValue="0"
        notes={form.reason}
        totals={totals}
        onLinesChange={(lines: FormLineItem[]) => patch({ lines })}
        onDiscountTypeChange={() => {}}
        onDiscountValueChange={() => {}}
        onNotesChange={(reason: string) => patch({ reason })}
        itemOptions={itemOptions}
        items={items}
        inventoryEnabled={inventoryEnabled}
        errors={errors}
        summaryTitle="Credit summary"
        summaryIcon={<RotateCcw className="size-4" />}
        notesTitle="Reason"
        notesPlaceholder="e.g. returned goods, damaged on arrival, over-billed"
      />

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/credit-memos">Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          disabled={busy}
        >
          {busy ? 'Saving…' : cap.submitLabel('Issue credit memo')}
        </Button>
      </div>
    </div>
  );
}
