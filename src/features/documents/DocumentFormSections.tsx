import { AlertCircle, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { LineItemRow } from '@/components/shared/LineItemRow';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select, type SelectOption } from '@/components/ui/Select';
import { SummaryPanel, SummaryRow } from '@/components/ui/SummaryPanel';
import {
  DISCOUNT_TYPE_OPTIONS,
  freshLine,
  lineAmountOf,
  type DiscountType,
  type DocumentTotals,
  type FormLineItem,
} from '@/models/document';
import type { InventoryItemOption } from '@/networks/inventory/inventoryNetwork';

/**
 * Everything below the header card of a transaction form: line items, the
 * discount, notes, and the totals panel.
 *
 * Invoices, estimates and sales orders differ only in their header fields and
 * their action bar — the rest is this. Kept as one component rather than three
 * copies because three copies of a totals panel drift, and a discount that
 * behaves differently on an estimate than on an invoice is a support ticket.
 *
 * Note the app renders estimates and sales orders on a plain white totals card
 * while invoices get the dark panel. We use the panel for all three: it is the
 * house style for a totals block, and the app's inconsistency is an artefact of
 * those screens never being migrated onto it, not a decision.
 */

export interface DocumentFormSectionsProps {
  lines: FormLineItem[];
  discountType: DiscountType;
  discountValue: string;
  notes: string;
  totals: DocumentTotals;

  onLinesChange: (lines: FormLineItem[]) => void;
  onDiscountTypeChange: (type: DiscountType) => void;
  onDiscountValueChange: (value: string) => void;
  onNotesChange: (notes: string) => void;

  itemOptions: SelectOption[];
  items: InventoryItemOption[];
  inventoryEnabled: boolean;

  /** Keyed by field — `lines` is the only one this component renders. */
  errors?: Record<string, string>;

  summaryTitle: string;
  summaryIcon?: ReactNode;
  notesPlaceholder?: string;
  /** Credit memos call this field "Reason". */
  notesTitle?: string;
  /**
   * Credit memos have no discount concept at all — `CreateCreditMemoDto` has
   * no such field — so the card is suppressed rather than shown inert.
   */
  showDiscount?: boolean;

  /**
   * Read-only mode. Used by the approval-review view (module 18) and by a
   * sales order whose lines can no longer be touched without destroying
   * fulfilment progress.
   */
  readOnly?: boolean;
  /** Explains why editing is off, when it is. */
  readOnlyNote?: string;
  /**
   * 'sales' — estimates, sales orders and invoices: where the company tracks
   * inventory, a line is a stock item or a declared service/charge, and the
   * stock on hand is shown. 'free' keeps the optional item picker (credit memos).
   */
  lineMode?: 'sales' | 'free';
}

export function DocumentFormSections({
  lines,
  discountType,
  discountValue,
  notes,
  totals,
  onLinesChange,
  onDiscountTypeChange,
  onDiscountValueChange,
  onNotesChange,
  itemOptions,
  items,
  inventoryEnabled,
  errors = {},
  summaryTitle,
  summaryIcon,
  notesPlaceholder = 'Terms, delivery instructions, anything the customer should see…',
  notesTitle = 'Notes',
  showDiscount = true,
  readOnly,
  readOnlyNote,
  lineMode = 'free',
}: DocumentFormSectionsProps) {
  const salesRules = lineMode === 'sales' && inventoryEnabled;
  const kindOf = (l: FormLineItem) => l.lineKind ?? (l.itemId ? 'item' : salesRules ? 'item' : 'service');
  const stockLabel = (i: InventoryItemOption) =>
    `${i.sku ? `${i.sku} · ` : ''}${i.name} · ${i.quantityOnHand} on hand`;
  const updateLine = (id: string, field: keyof FormLineItem, value: string) =>
    onLinesChange(
      lines.map((l) => (l.id === id ? { ...l, [field]: value } : l)),
    );

  const selectItem = (lineId: string, itemId: string) => {
    const item = items.find((i) => i.id === itemId);
    onLinesChange(
      lines.map((l) =>
        l.id === lineId
          ? {
              ...l,
              itemId,
              // Auto-filled but still editable, matching the app.
              description: item?.name ?? l.description,
              unitPrice: item ? String(item.sellingPrice) : l.unitPrice,
            }
          : l,
      ),
    );
  };

  return (
    <>
      {/* ── Line items ────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader
          title="Line items"
          right={
            readOnly ? undefined : salesRules ? (
              <div className="flex flex-wrap gap-xs">
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => onLinesChange([...lines, { ...freshLine(), lineKind: 'item' }])}
                >
                  <Plus className="size-4" />
                  Stock item
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-full"
                  onClick={() => onLinesChange([...lines, { ...freshLine(), lineKind: 'service' }])}
                >
                  <Plus className="size-4" />
                  Service / charge
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                className="rounded-full"
                onClick={() => onLinesChange([...lines, freshLine()])}
              >
                <Plus className="size-4" />
                Add item
              </Button>
            )
          }
        />

        {readOnlyNote && (
          <p className="mt-sm rounded-md bg-warning-lighter p-sm text-caption text-text-primary">
            {readOnlyNote}
          </p>
        )}

        {errors.lines && (
          <p className="mt-sm flex items-center gap-xs text-caption text-danger">
            <AlertCircle className="size-4" />
            {errors.lines}
          </p>
        )}

        <div className="mt-md flex flex-col gap-md">
          {lines.map((line, index) => (
            <LineItemRow
              key={line.id}
              index={index}
              description={line.description}
              quantity={line.quantity}
              unitPrice={line.unitPrice}
              taxRate={line.taxRate}
              lineAmount={lineAmountOf(line)}
              onDescriptionChange={(v) => updateLine(line.id, 'description', v)}
              onQuantityChange={(v) => updateLine(line.id, 'quantity', v)}
              onUnitPriceChange={(v) => updateLine(line.id, 'unitPrice', v)}
              onTaxRateChange={(v) => updateLine(line.id, 'taxRate', v)}
              onDelete={() => onLinesChange(lines.filter((l) => l.id !== line.id))}
              canDelete={lines.length > 1}
              readOnly={readOnly}
              topSlot={
                salesRules ? (
                  kindOf(line) === 'item' ? (
                    <div className="flex flex-col gap-xxs">
                      <Combobox
                        label="Inventory item *"
                        value={line.itemId}
                        onChange={(v) => selectItem(line.id, v)}
                        options={items.map((i) => ({ value: i.id, label: stockLabel(i) }))}
                        placeholder="Pick the stock item this line sells…"
                        searchPlaceholder="Search by SKU or name…"
                        disabled={readOnly}
                        compact
                      />
                      <StockChip item={items.find((i) => i.id === line.itemId)} quantity={line.quantity} />
                    </div>
                  ) : (
                    <p className="rounded-sm bg-neutral-100 px-sm py-xxs text-caption text-text-secondary">
                      Service / charge — no stock. Use a stock item for anything you sell off the shelf.
                    </p>
                  )
                ) : inventoryEnabled ? (
                  <Combobox
                    label="Inventory item (optional)"
                    value={line.itemId}
                    onChange={(v) => selectItem(line.id, v)}
                    options={itemOptions}
                    placeholder="Link an inventory item…"
                    searchPlaceholder="Search items…"
                    disabled={readOnly}
                    compact
                  />
                ) : undefined
              }
            />
          ))}
        </div>
      </Card>

      {/* ── Discount ──────────────────────────────────────────────── */}
      {showDiscount && (
      <Card className="p-lg">
        <SectionHeader title="Discount" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Select
            label="Discount type"
            value={discountType}
            onChange={(v) => onDiscountTypeChange(v as DiscountType)}
            options={DISCOUNT_TYPE_OPTIONS}
            disabled={readOnly}
          />
          {discountType !== 'none' && (
            <Input
              label={discountType === 'percent' ? 'Discount (%)' : 'Discount (Rs)'}
              value={discountValue}
              onChange={(e) =>
                onDiscountValueChange(e.target.value.replace(/[^0-9.]/g, ''))
              }
              inputMode="decimal"
              disabled={readOnly}
              hint="Tax is charged before the discount, as the server calculates it."
            />
          )}
        </div>
      </Card>
      )}

      {/* ── Notes ─────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title={notesTitle} />
        <div className="mt-md">
          <Textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={notesPlaceholder}
            disabled={readOnly}
          />
        </div>
      </Card>

      {/* ── Totals ────────────────────────────────────────────────── */}
      <SummaryPanel
        title={summaryTitle}
        icon={summaryIcon}
        total={{ label: 'Grand total', value: totals.total }}
      >
        <SummaryRow label="Subtotal" value={totals.subtotal} />
        {showDiscount && totals.discountAmount > 0 && (
          <SummaryRow
            label={
              discountType === 'percent'
                ? `Discount (${discountValue}%)`
                : 'Discount (fixed)'
            }
            value={totals.discountAmount}
            tone="positive"
            negate
          />
        )}
        <SummaryRow label="Tax" value={totals.taxAmount} />
      </SummaryPanel>
    </>
  );
}

export default DocumentFormSections;

/**
 * What the shelf holds for this line's item. On hand only: other orders'
 * promises are counted by the server, which asks to confirm a backorder when
 * the order is saved.
 */
function StockChip({ item, quantity }: { item?: InventoryItemOption; quantity: string }) {
  if (!item) return null;
  const want = parseFloat(quantity) || 0;
  const short = want - item.quantityOnHand;
  return (
    <span
      className={
        short > 0
          ? 'self-start rounded-sm bg-warning-lighter px-xs text-caption text-warning'
          : 'self-start rounded-sm bg-success-lighter px-xs text-caption text-success'
      }
    >
      {short > 0
        ? `Only ${item.quantityOnHand} on hand — ${short} would be on backorder`
        : `${item.quantityOnHand} on hand`}
    </span>
  );
}
