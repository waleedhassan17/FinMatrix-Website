import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Info, Package } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DateField, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { invalidateInventory } from '@/features/inventory/invalidateInventory';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useCapability, useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { isoToday } from '@/models/document';
import {
  ADJUSTMENT_REASONS,
  adjustmentImpact,
  adjustmentPayload,
  emptyAdjustmentForm,
  formatQty,
  formatQtyChange,
  validateAdjustment,
  type AdjustmentForm,
  type AdjustmentReason,
} from '@/models/inventory';
import { adjustItem, getItem } from '@/networks/inventory/inventoryNetwork';
import { formatMoney } from '@/utils/money';

const REASON_OPTIONS = ADJUSTMENT_REASONS.map((r) => ({ value: r.value, label: r.label }));

/**
 * Correct an item's quantity — a count, a breakage, a theft.
 *
 * An adjustment is a correction to the books (Table A, "money out &
 * corrections"): the owner's posts at once; a staff member's is filed as a
 * request that changes nothing until the owner approves it. The submit button
 * says which will happen before anyone clicks.
 */
export default function AdjustStockPage() {
  const { itemId = '' } = useParams<{ itemId: string }>();
  const enabled = useFeature('inventory');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const adjust = useCapability('inventory.adjust');

  const itemQuery = useQuery({
    queryKey: ['inventory', 'items', itemId],
    queryFn: () => getItem(itemId),
    enabled,
  });
  const item = itemQuery.data;

  const [form, setForm] = useState<AdjustmentForm>(emptyAdjustmentForm);
  const [errors, setErrors] = useState<Partial<Record<keyof AdjustmentForm, string>>>({});

  const patch = (p: Partial<AdjustmentForm>) => {
    setForm((f) => ({ ...f, ...p }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof AdjustmentForm];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => adjustItem(itemId, adjustmentPayload(itemId, form)),
    onSuccess: (result) => {
      invalidateInventory(queryClient);
      if (result.pending) {
        toast.success('Sent for approval', {
          description:
            'The owner signs this off before the stock or the books change. Track it in My Requests.',
        });
        navigate('/my-requests', { replace: true });
        return;
      }
      toast.success('Adjustment posted', {
        description: 'The quantity, the stock value and the journal entry are updated.',
      });
      navigate(`/inventory/${itemId}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not adjust stock', { description: e.message }),
  });

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Package}
        title="Inventory"
        body="Inventory is not included in your company’s plan."
      />
    );
  }

  if (itemQuery.isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading item…</p>;
  }

  if (!item) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Item not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          {itemQuery.error?.message ?? 'It may have been removed.'}
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/inventory">Back to inventory</Link>
        </Button>
      </Card>
    );
  }

  const impact = adjustmentImpact(item, form.newQty);
  const reason = ADJUSTMENT_REASONS.find((r) => r.value === form.reason);
  const offset = reason?.account ?? 'the account for the reason you choose';
  const unit = item.unitOfMeasure ? ` ${item.unitOfMeasure}` : '';

  const submit = () => {
    const e = validateAdjustment(form, item.quantityOnHand);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-lg">
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={`/inventory/${item.id}`}>
          <ArrowLeft className="size-4" />
          {item.name}
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Adjust stock</h1>
        <p className="text-body-sm text-text-secondary">
          {item.sku} · {item.name} — {formatQty(item.quantityOnHand)}
          {unit} on hand at {formatMoney(item.unitCost)} each.
        </p>
      </div>

      {adjust.needsApproval && (
        <div className="flex items-start gap-sm rounded-md bg-info-light p-md">
          <Info className="mt-[2px] size-4 shrink-0 text-info" />
          <p className="text-body-sm text-text-primary">
            This goes to the owner for approval. Nothing changes — not the
            quantity, the stock value or the books — until they approve it. They
            see the {formatQty(item.quantityOnHand)} you are looking at now, so a
            count is judged against the shelf you saw.
          </p>
        </div>
      )}

      <Card className="grid gap-md p-lg sm:grid-cols-2">
        <Input
          label="New quantity on hand"
          value={form.newQty}
          onChange={(e) => patch({ newQty: e.target.value })}
          inputMode="decimal"
          placeholder={formatQty(item.quantityOnHand)}
          className="tabular"
          autoFocus
          error={errors.newQty}
          hint="What the shelf should read afterwards — not the difference."
        />
        <Select
          label="Reason"
          value={form.reason}
          onChange={(v) => patch({ reason: v as AdjustmentReason })}
          options={REASON_OPTIONS}
          placeholder="Choose a reason"
          error={errors.reason}
          hint={reason ? `The difference posts to ${reason.account}.` : undefined}
        />
        <DateField
          label="Record on"
          value={form.date}
          onChange={(v) => patch({ date: v })}
          max={isoToday()}
          error={errors.date}
          hint="Sets the accounting period."
        />
        <div className="sm:col-span-2">
          <Textarea
            label="Notes (optional)"
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={2}
            placeholder="What happened — the owner reads this when approving."
          />
        </div>
      </Card>

      {/* ── What this will do ───────────────────────────────────────── */}
      <Card className="p-lg">
        <p className="text-overline text-text-secondary">What this will do</p>
        <div className="mt-sm flex flex-wrap items-center gap-md">
          <Figure label="Now" value={`${formatQty(item.quantityOnHand)}${unit}`} />
          <ArrowRight className="size-4 text-text-tertiary" />
          <Figure
            label="After"
            value={impact ? `${formatQty(item.quantityOnHand + impact.variance.toNumber())}${unit}` : '—'}
          />
          <div className="ml-auto flex gap-lg">
            <Figure
              label="Change"
              value={impact ? formatQtyChange(impact.variance) : '—'}
              tone={impact ? (impact.variance.isNegative() ? 'danger' : 'success') : undefined}
            />
            <Figure
              label="Value"
              value={impact ? formatMoney(impact.value) : '—'}
              tone={impact ? (impact.value.isNegative() ? 'danger' : 'success') : undefined}
            />
          </div>
        </div>
        {impact && !impact.variance.isZero() && (
          <p className="mt-md border-t border-border-light pt-sm text-body-sm text-text-secondary">
            {impact.variance.isNegative() ? (
              <>
                Posts <strong className="text-text-primary">Dr {offset}</strong> and{' '}
                <strong className="text-text-primary">Cr Inventory (1200)</strong> for{' '}
                {formatMoney(impact.value.abs())}.
              </>
            ) : (
              <>
                Posts <strong className="text-text-primary">Dr Inventory (1200)</strong> and{' '}
                <strong className="text-text-primary">Cr {offset}</strong> for{' '}
                {formatMoney(impact.value)}.
              </>
            )}{' '}
            Valued at the current average cost.
          </p>
        )}
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to={`/inventory/${item.id}`}>Cancel</Link>
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? 'Submitting…' : adjust.submitLabel('Post adjustment')}
        </Button>
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger';
}) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p
        className={cn(
          'text-h4 tabular',
          tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-text-primary',
        )}
      >
        {value}
      </p>
    </div>
  );
}
