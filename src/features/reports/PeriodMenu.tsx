import * as Popover from '@radix-ui/react-popover';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { DateField } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import {
  formatShortDate,
  matchPreset,
  presetRange,
  type PeriodPreset,
  type PeriodPresetKey,
  type ReportRange,
} from '@/models/reportPeriod';

export interface PeriodMenuProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
  /** The periods on offer. "custom" is always added by the control itself. */
  presets: readonly PeriodPreset[];
  /**
   * `menu` — one button naming the period, the choices in a popover. For a
   * page where the period is a setting, not the subject.
   * `segments` — the choices side by side (short labels), the way a chart's
   * time range reads. Falls back to `menu` on a phone, where six segments
   * would scroll sideways and hide the last one.
   */
  layout?: 'menu' | 'segments';
  /** Short segment labels, e.g. `{ last12m: '12M' }`. */
  shortLabels?: Partial<Record<PeriodPresetKey, string>>;
  /** Names what the period governs — "Sales period". */
  label?: string;
  className?: string;
}

const rangeText = (r: ReportRange) => `${formatShortDate(r.startDate)} – ${formatShortDate(r.endDate)}`;

/** From/To fields and Apply — the custom range, shared by both layouts. */
function CustomRange({
  value,
  onApply,
}: {
  value: ReportRange;
  onApply: (range: ReportRange) => void;
}) {
  const [draft, setDraft] = useState(value);
  const invalid = !draft.startDate || !draft.endDate || draft.startDate > draft.endDate;
  return (
    <div className="flex flex-col gap-sm">
      <p className="text-label-md text-text-primary">Custom range</p>
      <div className="grid grid-cols-2 gap-sm">
        <DateField
          label="From"
          value={draft.startDate}
          max={draft.endDate || undefined}
          onChange={(startDate) => setDraft((d) => ({ ...d, startDate }))}
        />
        <DateField
          label="To"
          value={draft.endDate}
          min={draft.startDate || undefined}
          onChange={(endDate) => setDraft((d) => ({ ...d, endDate }))}
        />
      </div>
      {draft.startDate > draft.endDate && draft.endDate !== '' && (
        <p className="text-caption text-danger">The start date must be on or before the end.</p>
      )}
      <Button size="sm" disabled={invalid} onClick={() => onApply(draft)}>
        Apply
      </Button>
    </div>
  );
}

/**
 * The period a report covers, in one line.
 *
 * Replaces six chips and two full-size date fields on the inventory pages,
 * which took more room than the figures they governed. The active choice is
 * DERIVED from the range (`matchPreset`), never held separately, so the label
 * can never disagree with what is on screen; a range that matches no preset
 * reads as "Custom".
 */
export function PeriodMenu({
  value,
  onChange,
  presets,
  layout = 'menu',
  shortLabels = {},
  label,
  className,
}: PeriodMenuProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const choices = presets.filter((p) => p.key !== 'custom');
  const active = matchPreset(value, undefined, choices);
  const activeLabel = active === 'custom' ? 'Custom' : (choices.find((p) => p.key === active)?.label ?? 'Custom');

  const pick = (key: PeriodPresetKey) => {
    onChange(presetRange(key));
    setOpen(false);
  };

  const menu = (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label ? `${label}: ${activeLabel}, ${rangeText(value)}` : undefined}
          className="inline-flex h-9 items-center gap-xs rounded-md border border-border bg-surface px-sm text-label-md text-text-primary transition-colors hover:bg-surface-2"
        >
          <CalendarRange className="size-4 text-text-tertiary" aria-hidden="true" />
          {activeLabel}
          <ChevronDown className="size-4 text-text-tertiary" aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-xs shadow-md"
        >
          <div role="listbox" aria-label={label ?? 'Period'} className="flex flex-col">
            {choices.map((p) => (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={active === p.key}
                onClick={() => pick(p.key)}
                className={cn(
                  'flex items-center justify-between rounded-sm px-sm py-xs text-left text-body-sm transition-colors hover:bg-primary-tint',
                  active === p.key ? 'text-primary' : 'text-text-primary',
                )}
              >
                {p.label}
                {active === p.key && <Check className="size-4" aria-hidden="true" />}
              </button>
            ))}
          </div>
          <div className="mt-xs border-t border-border-light px-sm pt-sm pb-xs">
            <CustomRange
              key={`${value.startDate}|${value.endDate}`}
              value={value}
              onApply={(r) => {
                onChange(r);
                setOpen(false);
              }}
            />
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );

  return (
    <div className={cn('flex flex-wrap items-center gap-x-sm gap-y-xs', className)}>
      {label && <span className="text-label-md text-text-secondary">{label}</span>}

      {layout === 'segments' ? (
        <>
          <div className="sm:hidden">{menu}</div>
          <div
            role="group"
            aria-label={label ?? 'Period'}
            className="hidden h-9 overflow-hidden rounded-md border border-border bg-surface sm:flex"
          >
            {choices.map((p, i) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={active === p.key}
                onClick={() => onChange(presetRange(p.key))}
                className={cn(
                  'px-sm text-label-md whitespace-nowrap transition-colors',
                  i > 0 && 'border-l border-border',
                  active === p.key
                    ? 'bg-primary-tint text-primary'
                    : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                )}
              >
                {shortLabels[p.key] ?? p.label}
              </button>
            ))}
            <Popover.Root open={customOpen} onOpenChange={setCustomOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  aria-pressed={active === 'custom'}
                  className={cn(
                    'inline-flex items-center gap-xxs border-l border-border px-sm text-label-md whitespace-nowrap transition-colors',
                    active === 'custom'
                      ? 'bg-primary-tint text-primary'
                      : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
                  )}
                >
                  Custom
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="start"
                  sideOffset={6}
                  className="z-50 w-[min(24rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-md shadow-md"
                >
                  <CustomRange
                    key={`${value.startDate}|${value.endDate}`}
                    value={value}
                    onApply={(r) => {
                      onChange(r);
                      setCustomOpen(false);
                    }}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </div>
        </>
      ) : (
        menu
      )}

      <span className="text-body-sm text-text-tertiary tabular">{rangeText(value)}</span>
    </div>
  );
}

export default PeriodMenu;
