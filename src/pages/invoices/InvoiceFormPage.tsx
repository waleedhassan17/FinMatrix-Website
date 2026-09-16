import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CreditCard, Info } from 'lucide-react';
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
import { useCapability } from '@/hooks/useCapability';
import {
  addDays,
  computeTotals,
  freshLine,
  isoToday,
  validateLines,
  validateSalesLineKinds,
  type DiscountType,
  type FormLineItem,
  type InvoiceFormData,
} from '@/models/invoice';
import { PAYMENT_TERMS_DAYS } from '@/models/customer';
import {
  createInvoice,
  getInvoiceById,
  updateInvoice,
} from '@/networks/sales/invoiceNetwork';
import {
  invoiceFormToPayload,
  invoiceFormToUpdatePayload,
  invoiceToFormData,
} from '@/serializers/invoiceSerializer';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';
import { CreditLimitDialog } from '@/features/customers/CreditLimitDialog';
import { creditLimitError, type CreditAssessment } from '@/models/credit';

const emptyForm = (): InvoiceFormData => ({
  customerId: '',
  customerName: '',
  issueDate: isoToday(),
  dueDate: addDays(isoToday(), 30),
  lines: [freshLine()],
  discountType: 'none',
  discountValue: '0',
  notes: '',
});

export default function InvoiceFormPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(invoiceId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('invoice.create');
  const { byId: customersById, options: customerOptions } = useCustomerOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  const [form, setForm] = useState<InvoiceFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Data ────────────────────────────────────────────────────────────
  const { data: existing, isLoading: loadingInvoice } = useQuery({
    queryKey: ['invoices', invoiceId],
    queryFn: () => getInvoiceById(invoiceId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing) setForm(invoiceToFormData(existing));
  }, [existing]);

  // Launched from a customer's detail page.
  useEffect(() => {
    const preset = searchParams.get('customerId');
    if (!preset || isEditing) return;
    const c = customersById.get(preset);
    if (c) {
      setForm((f) => ({
        ...f,
        customerId: c.id,
        customerName: c.name,
        dueDate: addDays(f.issueDate, PAYMENT_TERMS_DAYS[c.paymentTerms] ?? 30),
      }));
    }
  }, [searchParams, customersById, isEditing]);

  const totals = useMemo(
    () => computeTotals(form.lines, form.discountType, form.discountValue),
    [form.lines, form.discountType, form.discountValue],
  );

  // ── Editing ─────────────────────────────────────────────────────────
  const patch = (p: Partial<InvoiceFormData>) => setForm((f) => ({ ...f, ...p }));

  const pickCustomer = (customerId: string) => {
    const c = customersById.get(customerId);
    setForm((f) => ({
      ...f,
      customerId,
      customerName: c?.name ?? '',
      // Derive the due date from the customer's own terms.
      dueDate: c
        ? addDays(f.issueDate, PAYMENT_TERMS_DAYS[c.paymentTerms] ?? 30)
        : f.dueDate,
    }));
    setErrors((e) => ({ ...e, customerId: '' }));
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.customerId) errs.customerId = 'Select a customer';
    if (!form.issueDate) errs.issueDate = 'Issue date is required';
    if (!form.dueDate) errs.dueDate = 'Due date is required';
    const lineError =
      validateLines(form.lines, totals) ?? validateSalesLineKinds(form.lines, inventoryEnabled);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Save ────────────────────────────────────────────────────────────
  const [creditIssue, setCreditIssue] = useState<CreditAssessment | null>(null);

  const save = useMutation({
    mutationFn: async ({ status, overrideReason }: { status: 'draft' | 'sent'; overrideReason?: string }) => {
      if (isEditing) {
        return {
          kind: 'updated' as const,
          invoice: await updateInvoice(invoiceId!, invoiceFormToUpdatePayload(form)),
        };
      }
      const payload = invoiceFormToPayload(form, status);
      const result = await createInvoice(
        overrideReason ? { ...payload, creditOverride: { reason: overrideReason } } : payload,
      );
      return { kind: 'created' as const, result };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'updated') {
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        toast.success('Invoice updated');
        navigate(`/invoices/${outcome.invoice.id}`, { replace: true });
        return;
      }

      // THE maker-checker branch. A 2xx here does not mean an invoice exists:
      // for staff the server filed an approval request and wrote nothing else.
      if (outcome.result.pending) {
        // Deliberately NOT invalidating the invoice list — nothing was created,
        // and a refetch would only confirm its absence.
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description:
            'The invoice is created, and the sale posts, once the owner approves.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }

      invalidateAfterPosting(queryClient);
      toast.success('Invoice created', {
        description: `${outcome.result.invoice.invoiceNumber} has been saved.`,
      });
      navigate(`/invoices/${outcome.result.invoice.id}`, { replace: true });
    },
    onError: (e: Error) => {
      // Posting past the customer's credit limit: advance or owner override.
      const credit = creditLimitError(e);
      if (credit) {
        setCreditIssue(credit);
        return;
      }
      // Server reasons matter here — insufficient stock, a closed period — so
      // the message is surfaced verbatim rather than replaced.
      toast.error('Could not save invoice', { description: e.message });
    },
  });

  const submit = (status: 'draft' | 'sent') => {
    if (!validate()) return;
    save.mutate({ status });
  };

  if (isEditing && loadingInvoice) {
    return <p className="text-body-sm text-text-secondary">Loading invoice…</p>;
  }

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/invoices/${invoiceId}` : '/invoices'}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? `Edit ${existing?.invoiceNumber ?? 'invoice'}` : 'New invoice'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          {isEditing
            ? 'Only drafts can be edited.'
            : 'Bill a customer for goods or services.'}
        </p>
      </div>

      {/* Staff are told what the button will actually do, before they use it. */}
      {cap.needsApproval && !isEditing && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This invoice will be sent to the owner for approval before it posts.
            Nothing is billed and no stock moves until they approve it.
          </p>
        </div>
      )}

      {/* ── Invoice details ─────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Invoice details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Customer *"
            value={form.customerId}
            onChange={pickCustomer}
            options={customerOptions}
            placeholder="Select a customer…"
            searchPlaceholder="Search customers…"
            error={errors.customerId}
            // customerId is absent from UpdateInvoiceDto and would be silently
            // stripped, so editing it is disabled rather than ignored.
            disabled={isEditing}
            hint={isEditing ? 'The customer cannot be changed after creation.' : undefined}
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Issue date *"
            value={form.issueDate}
            onChange={(v) => patch({ issueDate: v })}
            error={errors.issueDate}
          />
          <DateField
            label="Due date *"
            value={form.dueDate}
            onChange={(v) => patch({ dueDate: v })}
            min={form.issueDate}
            error={errors.dueDate}
          />
        </div>

        {/* No invoice-number field. The server assigns it as INV-<year>-NNNN;
            the app offers an editable one and then never sends it, so the
            number a user types there is never the number they get. */}
        {!isEditing && (
          <p className="mt-sm text-caption text-text-tertiary">
            The invoice number is assigned when you save.
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
        lineMode="sales"
        errors={errors}
        summaryTitle="Invoice summary"
        summaryIcon={<CreditCard className="size-4" />}
      />

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={isEditing ? `/invoices/${invoiceId}` : '/invoices'}>Cancel</Link>
        </Button>

        {isEditing ? (
          <Button onClick={() => submit('draft')} disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        ) : cap.needsApproval ? (
          // One button on purpose: draft-versus-sent is the owner's call, and
          // a staff member is not making that choice — they are asking.
          <Button onClick={() => submit('sent')} disabled={busy}>
            {busy ? 'Sending…' : cap.submitLabel('Save & Send')}
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={() => submit('draft')} disabled={busy}>
              Save draft
            </Button>
            <Button onClick={() => submit('sent')} disabled={busy}>
              {busy ? 'Saving…' : 'Save & Send'}
            </Button>
          </>
        )}
      </div>
      <CreditLimitDialog
        assessment={creditIssue}
        onOpenChange={(open) => !open && setCreditIssue(null)}
        busy={save.isPending}
        onOverride={(reason) => {
          setCreditIssue(null);
          save.mutate({ status: 'sent', overrideReason: reason });
        }}
      />
    </div>
  );
}
