import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText } from 'lucide-react';
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
  addDays,
  computeTotals,
  freshLine,
  isoToday,
  validateLines,
  type DiscountType,
  type FormLineItem,
} from '@/models/document';
import type { EstimateFormData } from '@/models/estimate';
import {
  createEstimate,
  getEstimateById,
  updateEstimate,
} from '@/networks/sales/estimateNetwork';
import {
  estimateFormToPayload,
  estimateFormToUpdatePayload,
  estimateToFormData,
} from '@/serializers/estimateSerializer';

const emptyForm = (): EstimateFormData => ({
  customerId: '',
  customerName: '',
  estimateDate: isoToday(),
  // A quote that never expires is a quote you can be held to forever, so a
  // default is offered — but the field stays optional, as the DTO has it.
  expiryDate: addDays(isoToday(), 30),
  lines: [freshLine()],
  discountType: 'none',
  discountValue: '0',
  notes: '',
});

export default function EstimateFormPage() {
  const { estimateId } = useParams<{ estimateId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(estimateId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { byId: customersById, options: customerOptions } = useCustomerOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  const [form, setForm] = useState<EstimateFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: existing, isLoading } = useQuery({
    queryKey: ['estimates', estimateId],
    queryFn: () => getEstimateById(estimateId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing) setForm(estimateToFormData(existing));
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

  const patch = (p: Partial<EstimateFormData>) => setForm((f) => ({ ...f, ...p }));

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    if (!form.estimateDate) errs.estimateDate = 'Estimate date is required';
    const lineError = validateLines(form.lines, totals);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: (status: 'draft' | 'sent') =>
      isEditing
        ? updateEstimate(estimateId!, estimateFormToUpdatePayload(form))
        : createEstimate(estimateFormToPayload(form, status)),
    onSuccess: (estimate) => {
      queryClient.invalidateQueries({ queryKey: ['estimates'] });
      toast.success(isEditing ? 'Estimate updated' : 'Estimate created', {
        description: estimate.estimateNumber
          ? `${estimate.estimateNumber} has been saved.`
          : undefined,
      });
      navigate(`/estimates/${estimate.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not save estimate', { description: e.message }),
  });

  const submit = (status: 'draft' | 'sent') => {
    if (!validate()) return;
    save.mutate(status);
  };

  if (isEditing && isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading estimate…</p>;
  }

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/estimates/${estimateId}` : '/estimates'}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? `Edit ${existing?.estimateNumber ?? 'estimate'}` : 'New estimate'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          A quote for a customer. Nothing is billed and no stock moves.
        </p>
      </div>

      {/* ── Estimate details ────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Estimate details" />
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
            // Absent from UpdateEstimateDto — it would be silently stripped.
            disabled={isEditing}
            hint={
              isEditing ? 'The customer cannot be changed after creation.' : undefined
            }
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Estimate date *"
            value={form.estimateDate}
            onChange={(v) => patch({ estimateDate: v })}
            error={errors.estimateDate}
          />
          <DateField
            label="Valid until"
            value={form.expiryDate}
            onChange={(v) => patch({ expiryDate: v })}
            min={form.estimateDate}
            hint="Optional. Shown to you only — the server does not act on it."
          />
        </div>

        {!isEditing && (
          <p className="mt-sm text-caption text-text-tertiary">
            The estimate number is assigned when you save.
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
        summaryTitle="Estimate summary"
        summaryIcon={<FileText className="size-4" />}
        notesPlaceholder="Scope, assumptions, validity terms…"
      />

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={isEditing ? `/estimates/${estimateId}` : '/estimates'}>Cancel</Link>
        </Button>

        {/* estimate.create is 'direct' for both roles — no approval wording
            anywhere in this module. */}
        {isEditing ? (
          <Button onClick={() => submit('draft')} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        ) : (
          <>
            {/* The app hardcodes status:'sent' and can never make a draft. The
                DTO accepts both, and a quote still being written should not be
                marked as sent to the customer. */}
            <Button variant="secondary" onClick={() => submit('draft')} disabled={busy}>
              Save draft
            </Button>
            <Button onClick={() => submit('sent')} disabled={busy}>
              {busy ? 'Saving…' : 'Save & mark sent'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
