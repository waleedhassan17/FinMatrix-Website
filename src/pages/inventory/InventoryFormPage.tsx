import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Package } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { invalidateInventory } from '@/features/inventory/invalidateInventory';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import {
  emptyItemForm,
  formatQty,
  isUnitCostLocked,
  itemPayload,
  itemToForm,
  validateItemForm,
  type ItemForm,
} from '@/models/inventory';
import { createItem, getItem, updateItem } from '@/networks/inventory/inventoryNetwork';
import { formatMoney } from '@/utils/money';

type Errors = Partial<Record<keyof ItemForm, string>>;

/**
 * Create or edit an item. Direct for both roles (`inventory.manageItems`).
 *
 * Deliberately no quantity field: creating an item is reference data and
 * posts nothing. Stock arrives through opening stock, a purchase-order receipt
 * or an adjustment — each of which posts to the ledger.
 */
export default function InventoryFormPage() {
  const { itemId } = useParams<{ itemId: string }>();
  const editing = Boolean(itemId);
  const enabled = useFeature('inventory');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const itemQuery = useQuery({
    queryKey: ['inventory', 'items', itemId],
    queryFn: () => getItem(itemId!),
    enabled: enabled && editing,
  });
  const item = itemQuery.data;

  // Null until the user types; until then the form reads straight off the
  // loaded item, so nothing has to copy it into state in an effect.
  const [draft, setDraft] = useState<ItemForm | null>(null);
  const form = draft ?? (item ? itemToForm(item) : emptyItemForm());
  const [errors, setErrors] = useState<Errors>({});

  const costLocked = editing && isUnitCostLocked(item);

  const patch = (p: Partial<ItemForm>) => {
    setDraft({ ...form, ...p });
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof ItemForm];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = itemPayload(form, { costLocked, editing });
      return editing ? updateItem(itemId!, body) : createItem(body);
    },
    onSuccess: (saved) => {
      invalidateInventory(queryClient);
      toast.success(editing ? 'Item updated' : 'Item created', {
        description: `${saved.name} (${saved.sku}) has been saved.`,
      });
      navigate(`/inventory/${saved.id}`, { replace: true });
    },
    onError: (e: Error) => {
      // The one server rule the form cannot check alone.
      if (/sku already exists/i.test(e.message)) {
        setErrors({ sku: 'Another item already uses this SKU.' });
        return;
      }
      toast.error('Could not save the item', { description: e.message });
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateItemForm(form);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Package}
        title="Inventory"
        body="Inventory is not included in your company’s plan."
      />
    );
  }

  if (editing && itemQuery.isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading item…</p>;
  }

  if (editing && !item) {
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

  const back = editing ? `/inventory/${itemId}` : '/inventory';

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-3xl flex-col gap-lg" noValidate>
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={back}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">{editing ? 'Edit item' : 'New item'}</h1>
        <p className="text-body-sm text-text-secondary">
          {editing
            ? 'Details and reorder levels. Quantities change through receipts and adjustments, not here.'
            : 'Creating an item records no stock. Bring in quantities afterwards with opening stock or a purchase-order receipt.'}
        </p>
      </div>

      <Card className="p-lg">
        <SectionHeader title="Item" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="SKU *"
            value={form.sku}
            onChange={(e) => patch({ sku: e.target.value })}
            maxLength={64}
            error={errors.sku}
            placeholder="RICE-5KG"
          />
          <Input
            label="Name *"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            maxLength={200}
            error={errors.name}
          />
          <Input
            label="Category"
            value={form.category}
            onChange={(e) => patch({ category: e.target.value })}
            maxLength={100}
            error={errors.category}
            placeholder="Groceries"
          />
          <Input
            label="Unit of measure"
            value={form.unitOfMeasure}
            onChange={(e) => patch({ unitOfMeasure: e.target.value })}
            maxLength={32}
            error={errors.unitOfMeasure}
            placeholder="pcs, kg, carton"
          />
          <div className="sm:col-span-2">
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={3}
            />
          </div>
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Cost and price" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Unit cost"
            value={costLocked ? String(item?.unitCost ?? '') : form.unitCost}
            onChange={(e) => patch({ unitCost: e.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            disabled={costLocked}
            error={errors.unitCost}
            trailing={costLocked ? <Lock className="size-4 text-text-tertiary" /> : undefined}
            hint={
              costLocked
                ? undefined
                : 'What one unit costs you. Opening stock is valued at this; every purchase receipt then re-averages it.'
            }
          />
          <Input
            label="Selling price"
            value={form.sellingPrice}
            onChange={(e) => patch({ sellingPrice: e.target.value })}
            inputMode="decimal"
            placeholder="0.00"
            className="tabular"
            error={errors.sellingPrice}
            hint="The default price on invoice and delivery lines."
          />
          {costLocked && item && (
            <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary sm:col-span-2">
              Unit cost is the weighted average of what you actually paid, so it
              can’t be edited while {formatQty(item.quantityOnHand)} units are on
              hand (currently {formatMoney(item.unitCost)}). Receive stock at the
              new price and the average re-computes itself, or correct the
              quantity with a stock adjustment.
            </p>
          )}
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Reorder levels" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Reorder point"
            value={form.reorderPoint}
            onChange={(e) => patch({ reorderPoint: e.target.value })}
            inputMode="decimal"
            className="tabular"
            error={errors.reorderPoint}
            hint="At or below this, the item shows as low stock."
          />
          <Input
            label="Reorder quantity"
            value={form.reorderQuantity}
            onChange={(e) => patch({ reorderQuantity: e.target.value })}
            inputMode="decimal"
            className="tabular"
            error={errors.reorderQuantity}
            hint="How many you usually order."
          />
          <Input
            label="Minimum stock"
            value={form.minStock}
            onChange={(e) => patch({ minStock: e.target.value })}
            inputMode="decimal"
            className="tabular"
            error={errors.minStock}
          />
          <Input
            label="Maximum stock"
            value={form.maxStock}
            onChange={(e) => patch({ maxStock: e.target.value })}
            inputMode="decimal"
            className="tabular"
            error={errors.maxStock}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to={back}>Cancel</Link>
        </Button>
        {/* inventory.manageItems is direct for both roles — no approval step. */}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create item'}
        </Button>
      </div>
    </form>
  );
}
