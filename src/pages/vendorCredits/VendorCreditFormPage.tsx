import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CornerUpLeft, Info, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { DateField, Textarea } from '@/components/ui/Field';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import {
  useInventoryOptions,
  useVendorOptions,
} from '@/features/documents/useDocumentPickers';
import { VendorCreditLineRow } from '@/features/vendorCredits/VendorCreditLineRow';
import { useCapability } from '@/hooks/useCapability';
import { isoToday } from '@/models/document';
import {
  computeVendorCreditTotals,
  freshVendorCreditLine,
  itemLineAmount,
  validateVendorCreditLines,
  type VendorCreditFormData,
  type VendorCreditFormLine,
} from '@/models/vendorCredit';
import { getVendorCreditAccounts } from '@/networks/accounting/accountNetwork';
import { createVendorCredit } from '@/networks/purchases/vendorCreditNetwork';
import { vendorCreditFormToPayload } from '@/serializers/vendorCreditSerializer';

const emptyForm = (): VendorCreditFormData => ({
  vendorId: '',
  date: isoToday(),
  reason: '',
  lines: [freshVendorCreditLine()],
});

export default function VendorCreditFormPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const cap = useCapability('vendorCredit.manage');
  const { byId: vendorsById, options: vendorOptions } = useVendorOptions();
  const {
    options: itemOptions,
    items,
    enabled: inventoryEnabled,
  } = useInventoryOptions();

  // Expense and non-inventory asset accounts. Inventory is excluded because a
  // money-only line pointed at 1200 is refused server-side.
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'vendor-credit'],
    queryFn: getVendorCreditAccounts,
  });

  const accountOptions = useMemo(
    () =>
      accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    [accounts],
  );

  const [form, setForm] = useState<VendorCreditFormData>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    const preset = searchParams.get('vendorId');
    if (!preset) return;
    if (vendorsById.has(preset)) setForm((f) => ({ ...f, vendorId: preset }));
  }, [searchParams, vendorsById]);

  const totals = useMemo(
    () => computeVendorCreditTotals(form.lines),
    [form.lines],
  );

  const patch = (p: Partial<VendorCreditFormData>) => setForm((f) => ({ ...f, ...p }));

  const patchLine = (id: string, p: Partial<VendorCreditFormLine>) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.map((line) => (line.id === id ? { ...line, ...p } : line)),
    }));

  const unitCostOf = (itemId: string): number =>
    items.find((i) => i.id === itemId)?.unitCost ?? 0;

  /**
   * Naming an item turns the line into a stock return: the amount stops being
   * the user's to set and becomes quantity × carrying cost, because that is the
   * figure the server will relieve inventory by.
   *
   * Any expense account already chosen is cleared — that leg now posts to
   * Inventory, and leaving a stale `accountId` in state would send a field the
   * server ignores while the form still showed it as chosen.
   */
  const selectItem = (line: VendorCreditFormLine, itemId: string) => {
    if (!itemId) {
      patchLine(line.id, { itemId: '', quantity: '' });
      return;
    }
    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    const quantity = line.quantity || '1';
    patchLine(line.id, {
      itemId,
      accountId: '',
      quantity,
      description: line.description.trim() || item.name,
      amount: itemLineAmount(quantity, item.unitCost),
    });
  };

  const setQuantity = (line: VendorCreditFormLine, quantity: string) => {
    const cost = unitCostOf(line.itemId);
    patchLine(
      line.id,
      line.itemId
        ? { quantity, amount: itemLineAmount(quantity, cost) }
        : { quantity },
    );
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.vendorId) errs.vendorId = 'Select a supplier';
    if (!form.date) errs.date = 'Date is required';
    const lineError = validateVendorCreditLines(form.lines);
    if (lineError) errs.lines = lineError;
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const save = useMutation({
    mutationFn: () =>
      createVendorCredit(vendorCreditFormToPayload(form), idempotencyKey.current),
    onSuccess: (result) => {
      if (result.pending) {
        queryClient.invalidateQueries({ queryKey: ['approvals'] });
        toast.success('Sent for approval', {
          description: 'Nothing is credited until the owner approves it.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['vendor-credits'] });
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Vendor credit recorded', {
        description: result.vendorCredit.vendorCreditNumber
          ? `${result.vendorCredit.vendorCreditNumber} has been created.`
          : undefined,
      });
      navigate(`/vendor-credits/${result.vendorCredit.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not record vendor credit', { description: e.message }),
  });

  const busy = save.isPending;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/vendor-credits">
          <ArrowLeft className="size-4" />
          Vendor credits
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">New vendor credit</h1>
        <p className="text-body-sm text-text-secondary">
          Record money a supplier owes back for returned goods or an overcharge.
          This reduces what you owe them immediately.
        </p>
      </div>

      {cap.needsApproval && (
        <div className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-warning" />
          <p className="text-body-sm text-text-primary">
            This vendor credit will be sent to the owner for approval. Nothing is
            credited and no stock moves until they approve it.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader title="Credit details" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Combobox
            label="Supplier *"
            value={form.vendorId}
            onChange={(vendorId) => {
              patch({ vendorId });
              setErrors((e) => ({ ...e, vendorId: '' }));
            }}
            options={vendorOptions}
            placeholder="Select a supplier…"
            searchPlaceholder="Search suppliers…"
            error={errors.vendorId}
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
          The vendor credit number is assigned when you save.
        </p>
      </Card>

      {/* The item link is not cosmetic: a line naming an item takes the goods
          back off the shelf at what they are carried at, while a free-text line
          credits the money only. That is the difference between a return and a
          billing correction. */}
      {inventoryEnabled && (
        <div className="flex items-start gap-sm rounded-md bg-surface-2 p-md">
          <CornerUpLeft className="mt-[2px] size-4 shrink-0 text-text-secondary" />
          <p className="text-body-sm text-text-secondary">
            Link a line to an inventory item to send the goods back and take them
            out of stock at cost. Leave it free-text to credit the money only — a
            correction rather than a return.
          </p>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader
          title="Credit lines"
          right={
            <Button
              variant="text"
              size="sm"
              onClick={() =>
                patch({ lines: [...form.lines, freshVendorCreditLine()] })
              }
            >
              <Plus className="size-4" />
              Add line
            </Button>
          }
        />

        <div className="mt-md flex flex-col gap-sm">
          {form.lines.map((line, index) => (
            <VendorCreditLineRow
              key={line.id}
              index={index}
              itemId={line.itemId}
              accountId={line.accountId}
              description={line.description}
              quantity={line.quantity}
              amount={line.amount}
              taxRate={line.taxRate}
              itemOptions={itemOptions}
              accountOptions={accountOptions}
              inventoryEnabled={inventoryEnabled}
              unitCost={unitCostOf(line.itemId)}
              onItemChange={(itemId) => selectItem(line, itemId)}
              onAccountChange={(accountId) => patchLine(line.id, { accountId })}
              onDescriptionChange={(description) => patchLine(line.id, { description })}
              onQuantityChange={(quantity) => setQuantity(line, quantity)}
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
          <p role="alert" className="mt-sm text-body-sm text-danger">
            {errors.lines}
          </p>
        )}
      </Card>

      <div className="grid gap-lg lg:grid-cols-2">
        <Card className="p-lg">
          <SectionHeader title="Reason" />
          <Textarea
            value={form.reason}
            onChange={(e) => patch({ reason: e.target.value })}
            placeholder="e.g. returned damaged stock, overcharged on freight"
            containerClassName="mt-md"
          />
        </Card>

        <SummaryPanel
          title="Credit summary"
          icon={<CornerUpLeft className="size-4" />}
          total={{ label: 'Total credit', value: totals.total }}
        >
          <SummaryRow label="Subtotal" value={totals.subtotal} />
          {/* Tax here is input tax coming back OFF a claim, not tax charged —
              so it adds to what the supplier owes us, like every other line. */}
          <SummaryRow label="Input tax reversed" value={totals.taxAmount} />
        </SummaryPanel>
      </div>

      <div className="flex flex-wrap justify-end gap-sm pb-xl">
        <Button asChild variant="secondary" disabled={busy}>
          <Link to="/vendor-credits">Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            if (validate()) save.mutate();
          }}
          disabled={busy}
        >
          {busy ? 'Saving…' : cap.submitLabel('Record vendor credit')}
        </Button>
      </div>
    </div>
  );
}
