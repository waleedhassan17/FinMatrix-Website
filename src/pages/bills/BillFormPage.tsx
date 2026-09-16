import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Receipt } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import {
  SummaryPanel,
  SummaryRow,
} from '@/components/ui/SummaryPanel';
import { BillLineRow } from '@/features/bills/BillLineRow';
import { useVendorOptions } from '@/features/documents/useDocumentPickers';
import {
  addDays,
  computeBillTotals,
  freshBillLine,
  isoToday,
  validateBillLines,
  type BillFormData,
  type BillFormLine,
} from '@/models/bill';
import { PAYMENT_TERMS_DAYS } from '@/models/customer';
import { getBillableAccounts } from '@/networks/accounting/accountNetwork';
import {
  createBill,
  getBillById,
  getBills,
  updateBill,
} from '@/networks/purchases/billNetwork';
import { billFormToPayload, billToFormData } from '@/serializers/billSerializer';
import { invalidateAfterPosting } from '@/features/documents/invalidateAfterPosting';

const emptyForm = (): BillFormData => ({
  vendorId: '',
  vendorName: '',
  billNumber: '',
  issueDate: isoToday(),
  dueDate: addDays(isoToday(), 30),
  lines: [freshBillLine()],
  notes: '',
});

export default function BillFormPage() {
  const { billId } = useParams<{ billId: string }>();
  const [searchParams] = useSearchParams();
  const isEditing = Boolean(billId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { byId: vendorsById, options: vendorOptions } = useVendorOptions();

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'billable'],
    queryFn: getBillableAccounts,
  });

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    [accounts],
  );

  const [form, setForm] = useState<BillFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: existing, isLoading: loadingBill } = useQuery({
    queryKey: ['bills', billId],
    queryFn: () => getBillById(billId!),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existing) setForm(billToFormData(existing));
  }, [existing]);

  // Launched from a vendor's detail page.
  useEffect(() => {
    const preset = searchParams.get('vendorId');
    if (!preset || isEditing) return;
    const v = vendorsById.get(preset);
    if (v) applyVendor(v.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, vendorsById, isEditing]);

  const totals = useMemo(() => computeBillTotals(form.lines), [form.lines]);

  const patch = (p: Partial<BillFormData>) => setForm((f) => ({ ...f, ...p }));

  /**
   * Picking a vendor does two things: derives the due date from their terms,
   * and seeds any blank line with their default expense account. The second is
   * the whole point of that field on the vendor record — it is not applied
   * server-side, so if the form does not use it, nothing does.
   */
  const applyVendor = (vendorId: string) => {
    const v = vendorsById.get(vendorId);
    setForm((f) => ({
      ...f,
      vendorId,
      vendorName: v?.name ?? '',
      dueDate: v
        ? addDays(f.issueDate, PAYMENT_TERMS_DAYS[v.paymentTerms] ?? 30)
        : f.dueDate,
      lines: v?.defaultExpenseAccountId
        ? f.lines.map((l) =>
            l.accountId ? l : { ...l, accountId: v.defaultExpenseAccountId },
          )
        : f.lines,
    }));
    setErrors((e) => ({ ...e, vendorId: '' }));
  };

  const defaultAccountId = form.vendorId
    ? (vendorsById.get(form.vendorId)?.defaultExpenseAccountId ?? '')
    : '';

  const patchLine = (id: string, p: Partial<BillFormLine>) =>
    patch({
      lines: form.lines.map((l) => (l.id === id ? { ...l, ...p } : l)),
    });

  // ── Duplicate bill-number warning ───────────────────────────────────
  // billNumber is the vendor's own reference and, uniquely among documents
  // here, carries no unique constraint — the server accepts a duplicate
  // silently. This is a soft warning, not a block: a vendor genuinely can
  // reissue a number, and only the person entering it knows.
  const { data: vendorBills = [] } = useQuery({
    queryKey: ['bills', 'dupe-check', form.vendorId],
    queryFn: () => getBills({ vendorId: form.vendorId, limit: 200 }),
    enabled: Boolean(form.vendorId && form.billNumber.trim()),
  });

  const duplicate = useMemo(() => {
    const n = form.billNumber.trim().toLowerCase();
    if (!n) return null;
    return (
      vendorBills.find(
        (b) => b.id !== billId && b.billNumber.trim().toLowerCase() === n,
      ) ?? null
    );
  }, [vendorBills, form.billNumber, billId]);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a vendor';
    if (!form.issueDate) errs.issueDate = 'Bill date is required';
    if (!form.dueDate) errs.dueDate = 'Due date is required';
    const lineError = validateBillLines(form.lines, totals);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: async (status: 'draft' | 'open') => {
      if (isEditing) {
        return {
          kind: 'updated' as const,
          bill: await updateBill(billId!, billFormToPayload(form, status)),
        };
      }
      return {
        kind: 'created' as const,
        result: await createBill(billFormToPayload(form, status)),
      };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'updated') {
        queryClient.invalidateQueries({ queryKey: ['bills'] });
        toast.success('Bill updated');
        navigate(`/bills/${outcome.bill.id}`, { replace: true });
        return;
      }

      // bill.create is direct for both roles, so this branch should not fire —
      // but the server decides, not the capability map, so it is narrowed
      // anyway rather than assumed away.
      if (outcome.result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval');
        navigate('/my-requests', { replace: true });
        return;
      }

      invalidateAfterPosting(queryClient);
      toast.success(
        outcome.result.bill.status === 'draft' ? 'Draft saved' : 'Bill recorded',
      );
      navigate(`/bills/${outcome.result.bill.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not save bill', { description: e.message }),
  });

  const submit = (status: 'draft' | 'open') => {
    if (!validate()) return;
    save.mutate(status);
  };

  if (isEditing && loadingBill) {
    return <p className="text-body-sm text-text-secondary">Loading bill…</p>;
  }

  // PATCH on a posted bill is refused server-side; a pasted URL should not get
  // as far as a form that cannot save.
  if (isEditing && existing && existing.status !== 'draft') {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">This bill is posted</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          Only draft bills can be edited. Posted bills carry a journal entry and
          may already be part-paid.
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to={`/bills/${billId}`}>Back to the bill</Link>
        </Button>
      </Card>
    );
  }

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/bills/${billId}` : '/bills'}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? `Edit ${existing?.billNumber || 'bill'}` : 'New bill'}
        </h1>
        <p className="text-body-sm text-text-secondary">
          What a supplier has invoiced you for.
        </p>
      </div>

      {/* ── Bill details ────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Bill details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Vendor *"
            value={form.vendorId}
            onChange={applyVendor}
            options={vendorOptions}
            placeholder="Select a vendor…"
            searchPlaceholder="Search vendors…"
            error={errors.vendorId}
            disabled={isEditing}
            hint={isEditing ? 'The vendor cannot be changed after creation.' : undefined}
            containerClassName="sm:col-span-2"
          />

          {/* Unlike every other document here, this number is supplied rather
              than assigned — it is the vendor's reference, not ours. */}
          <Input
            label="Bill number"
            value={form.billNumber}
            onChange={(e) => patch({ billNumber: e.target.value })}
            placeholder="The vendor's own number"
            hint={
              duplicate
                ? undefined
                : "Optional. Use whatever the supplier's invoice says."
            }
            error={
              duplicate
                ? `${duplicate.billNumber} already exists for this vendor, dated ${
                    duplicate.issueDate.slice(0, 10) || '—'
                  }. You can still save it.`
                : undefined
            }
            containerClassName="sm:col-span-2"
          />

          <DateField
            label="Bill date *"
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
      </Card>

      {/* ── Lines ───────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader
          title="Expense lines"
          right={
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                patch({ lines: [...form.lines, freshBillLine(defaultAccountId)] })
              }
            >
              <Plus className="size-4" />
              Add line
            </Button>
          }
        />

        <p className="mt-xs text-caption text-text-tertiary">
          A bill line is coded to a general-ledger account, not to an inventory
          item. To bill goods you have received, convert the purchase order
          instead.
        </p>

        <div className="mt-md flex flex-col gap-md">
          {form.lines.map((line, i) => (
            <BillLineRow
              key={line.id}
              index={i}
              accountId={line.accountId}
              description={line.description}
              amount={line.amount}
              taxRate={line.taxRate}
              accountOptions={accountOptions}
              onAccountChange={(accountId) => patchLine(line.id, { accountId })}
              onDescriptionChange={(description) =>
                patchLine(line.id, { description })
              }
              onAmountChange={(amount) => patchLine(line.id, { amount })}
              onTaxRateChange={(taxRate) => patchLine(line.id, { taxRate })}
              onDelete={() =>
                patch({ lines: form.lines.filter((l) => l.id !== line.id) })
              }
              canDelete={form.lines.length > 1}
            />
          ))}
        </div>

        {errors.lines && (
          <p className="mt-sm text-body-sm text-danger">{errors.lines}</p>
        )}
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Memo" />
        <div className="mt-md">
          <Textarea
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Anything worth recording against this bill…"
          />
        </div>
      </Card>

      {/* No discount card: the bill DTO has no discount field of any kind. */}
      <SummaryPanel
        title="Bill summary"
        icon={<Receipt className="size-4" />}
        total={{ label: 'Total', value: totals.total }}
      >
        <SummaryRow label="Subtotal" value={totals.subtotal} />
        <SummaryRow label="Tax" value={totals.taxAmount} />
      </SummaryPanel>

      {/* ── Actions ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to={isEditing ? `/bills/${billId}` : '/bills'}>Cancel</Link>
        </Button>
        {/* `status` is draft | open on create and only `open` posts the AP
            entry. Recording a bill is direct for staff — the approval gate on
            the purchase side sits on paying it, not on entering it. */}
        <Button variant="secondary" onClick={() => submit('draft')} disabled={busy}>
          Save draft
        </Button>
        <Button onClick={() => submit('open')} disabled={busy}>
          {busy ? 'Saving…' : 'Save & post'}
        </Button>
      </div>
    </div>
  );
}
