import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TaxTabs } from '@/features/tax/TaxTabs';
import {
  emptyTaxRateForm,
  TAX_TYPE_OPTIONS,
  taxRatePayload,
  taxRateToForm,
  taxTypeLabel,
  validateTaxRate,
  type TaxRate,
  type TaxRateForm,
  type TaxRateType,
} from '@/models/tax';
import {
  createTaxRate,
  deleteTaxRate,
  getTaxRates,
  updateTaxRate,
} from '@/networks/tax/taxNetwork';

/**
 * The company's tax rates. Owner only.
 *
 * Needed for more than bookkeeping: every tax payment is recorded against a
 * rate, so a company with none can never record one. The app shelved its only
 * rates screen and left exactly that dead end.
 */
export default function TaxRatesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null; form: TaxRateForm } | null>(null);
  const [deleting, setDeleting] = useState<TaxRate | null>(null);
  const [touched, setTouched] = useState(false);

  const rates = useQuery({ queryKey: ['tax', 'rates', 'all'], queryFn: () => getTaxRates() });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tax'] });

  const save = useMutation({
    mutationFn: async ({ id, form }: { id: string | null; form: TaxRateForm }) =>
      id ? updateTaxRate(id, taxRatePayload(form)) : createTaxRate(taxRatePayload(form)),
    onSuccess: (r, v) => {
      setEditing(null);
      invalidate();
      toast.success(v.id ? 'Rate updated' : 'Rate added', { description: r.name });
    },
    onError: (e: Error) => toast.error('Could not save the rate', { description: e.message }),
  });

  const toggle = useMutation({
    mutationFn: (r: TaxRate) => updateTaxRate(r.id, { isActive: !r.isActive }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error('Could not change the rate', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteTaxRate(id),
    onSuccess: () => {
      setDeleting(null);
      invalidate();
      toast.success('Rate deleted');
    },
    // A rate with recorded payments is refused — the server's message says to
    // deactivate it instead, which is the right advice, so it is shown as-is.
    onError: (e: Error) => {
      setDeleting(null);
      toast.error('Could not delete the rate', { description: e.message });
    },
  });

  const errors = editing ? validateTaxRate(editing.form) : {};
  const shownErrors = touched ? errors : {};
  const patch = (p: Partial<TaxRateForm>) =>
    setEditing((e) => (e ? { ...e, form: { ...e.form, ...p } } : e));

  const open = (rate: TaxRate | null) => {
    setTouched(false);
    setEditing({ id: rate?.id ?? null, form: rate ? taxRateToForm(rate) : emptyTaxRateForm() });
  };

  return (
    <div className="flex flex-col gap-lg">
      <TaxTabs />
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Tax rates</h1>
          <p className="text-body-sm text-text-secondary">
            The rates the business charges and pays. Payments are recorded against one.
          </p>
        </div>
        <Button onClick={() => open(null)}>
          <Plus className="size-4" />
          New rate
        </Button>
      </div>

      {rates.error && <p className="text-body-sm text-danger">{rates.error.message}</p>}

      <Card className="overflow-hidden">
        {rates.isLoading ? (
          <div className="p-lg">
            <div className="h-16 animate-pulse rounded-md bg-neutral-100" />
          </div>
        ) : (rates.data ?? []).length === 0 ? (
          <p className="p-xl text-center text-body-sm text-text-tertiary">
            No tax rates yet. Add the rates you charge, e.g. GST at 17%.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-md py-sm text-left text-overline text-text-secondary">Name</th>
                  <th className="px-md py-sm text-right text-overline text-text-secondary">Rate</th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">Type</th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">Authority</th>
                  <th className="px-md py-sm text-left text-overline text-text-secondary">Active</th>
                  <th className="px-md py-sm" />
                </tr>
              </thead>
              <tbody>
                {(rates.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border-light last:border-0">
                    <td className="px-md py-sm">
                      <span className="flex items-center gap-xs text-body-sm text-text-primary">
                        {r.name}
                        {r.isDefault && <StatusBadge status="active" label="Default" />}
                      </span>
                    </td>
                    <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                      {r.rate}%
                    </td>
                    <td className="px-md py-sm text-body-sm text-text-secondary">
                      {taxTypeLabel(r.type)}
                    </td>
                    <td className="px-md py-sm text-body-sm text-text-secondary">
                      {r.authority || '—'}
                    </td>
                    <td className="px-md py-sm">
                      <Switch
                        checked={r.isActive}
                        onCheckedChange={() => toggle.mutate(r)}
                        disabled={toggle.isPending && toggle.variables?.id === r.id}
                        label={<span className="sr-only">Active</span>}
                      />
                    </td>
                    <td className="whitespace-nowrap px-md py-sm text-right">
                      <Button variant="text" size="sm" onClick={() => open(r)} aria-label={`Edit ${r.name}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="text" size="sm" onClick={() => setDeleting(r)} aria-label={`Delete ${r.name}`}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.id ? 'Edit tax rate' : 'New tax rate'}
        confirmLabel={editing?.id ? 'Save rate' : 'Add rate'}
        busy={save.isPending}
        confirmDisabled={touched && Object.keys(errors).length > 0}
        onConfirm={() => {
          setTouched(true);
          if (editing && Object.keys(errors).length === 0) save.mutate(editing);
        }}
      >
        {editing && (
          <div className="grid gap-md">
            <Input
              label="Name"
              value={editing.form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="GST 17%"
              error={shownErrors.name}
              autoFocus
            />
            <div className="grid gap-md sm:grid-cols-2">
              <Input
                label="Rate (%)"
                value={editing.form.rate}
                onChange={(e) => patch({ rate: e.target.value })}
                inputMode="decimal"
                placeholder="17"
                className="tabular"
                error={shownErrors.rate}
              />
              <Select
                label="Type"
                value={editing.form.type}
                onChange={(v) => patch({ type: v as TaxRateType })}
                options={TAX_TYPE_OPTIONS}
              />
            </div>
            <Input
              label="Authority (optional)"
              value={editing.form.authority}
              onChange={(e) => patch({ authority: e.target.value })}
              placeholder="Who it is paid to"
              error={shownErrors.authority}
            />
            <Switch
              checked={editing.form.isActive}
              onCheckedChange={(v) => patch({ isActive: v })}
              label="Active"
            />
            <Switch
              checked={editing.form.isDefault}
              onCheckedChange={(v) => patch({ isDefault: v })}
              label="Default rate — replaces the current default"
            />
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this tax rate?"
        description="Deleting is permanent, and refused once a rate has payments recorded against it — switch it off instead to keep the history."
        confirmLabel="Delete rate"
        destructive
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
