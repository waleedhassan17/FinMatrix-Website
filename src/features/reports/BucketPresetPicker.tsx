import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import type { AgingPresetKey } from '@/serializers/reportSerializers';

/** What the chips say, in the order they are shown. */
const PRESETS: { key: AgingPresetKey; label: string }[] = [
  { key: 'days3', label: '3-day' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'biweekly', label: 'Fortnightly' },
  { key: 'monthly', label: '30/60/90' },
  { key: 'custom', label: 'Custom' },
];

export interface ParsedBoundaries {
  /** Empty when the input is not usable. */
  days: number[];
  /** Empty when it is. */
  why: string;
}

const bad = (why: string): ParsedBoundaries => ({ days: [], why });

/** The same rule the server enforces, so the UI refuses before the round trip. */
export function parseBoundaries(raw: string): ParsedBoundaries {
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return bad('Enter at least one number of days.');
  if (parts.length > 12) return bad('At most 12 columns.');
  const days: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,4}$/.test(p)) return bad(`“${p}” is not a whole number of days.`);
    const v = Number(p);
    if (v < 1) return bad('Days must be 1 or more.');
    if (days.length && v <= days[days.length - 1]) {
      return bad(`${days[days.length - 1]} must be followed by a larger number.`);
    }
    days.push(v);
  }
  return { days, why: '' };
}

/** What the chosen boundaries will actually produce, so the user can check. */
export function previewColumns(days: number[]): string {
  const parts = ['Current'];
  days.forEach((d, i) => {
    const min = i === 0 ? 1 : days[i - 1] + 1;
    parts.push(min === d ? `${d}` : `${min}–${d}`);
  });
  parts.push(`${days[days.length - 1] + 1}+`);
  return parts.join(' · ');
}

export interface BucketPresetPickerProps {
  preset: AgingPresetKey | null;
  customBuckets: string;
  onPickPreset: (key: AgingPresetKey) => void;
  onApplyCustom: (buckets: string) => void;
}

/**
 * How the aging report slices its columns.
 *
 * A segmented control rather than a Select: there are five options, they are
 * short, and the point of the control is that the alternatives are visible —
 * someone who does not already know the report can be re-bucketed will never
 * open a dropdown to find out. Segments rather than the pills this used to be:
 * one bordered group, the same 40px height as the search box and the sort
 * beside it, so the toolbar reads as one row of controls.
 *
 * "Custom" opens a small editor anchored under the control instead of pushing
 * the toolbar apart, and shows what the boundaries will produce before they
 * are applied.
 */
export function BucketPresetPicker({
  preset,
  customBuckets,
  onPickPreset,
  onApplyCustom,
}: BucketPresetPickerProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customBuckets);

  const parsed = parseBoundaries(draft);
  const valid = parsed.days.length > 0;

  return (
    // As wide as its contents, so the Custom editor — anchored to this box's
    // right edge — opens under the Custom segment wherever the picker sits.
    <div className="relative flex w-fit max-w-full items-center gap-xs print:hidden">
      <span id="aging-age-by" className="shrink-0 text-label-md text-text-secondary">
        Age by
      </span>

      {/* On a phone five segments do not fit, and a control that scrolls
          sideways hides its last option. The same choices as a dropdown. */}
      <Select
        compact
        value={preset ?? ''}
        onChange={(key: AgingPresetKey) => {
          if (key === 'custom') {
            setDraft(customBuckets);
            setEditing(true);
            return;
          }
          setEditing(false);
          onPickPreset(key);
        }}
        options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        containerClassName="w-[10rem] sm:hidden"
      />

      <div
        role="group"
        aria-labelledby="aging-age-by"
        className="hidden h-10 max-w-full overflow-x-auto rounded-md border border-border bg-surface sm:flex"
      >
        {PRESETS.map((opt, i) => {
          const on = preset === opt.key || (opt.key === 'custom' && editing);
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={preset === opt.key}
              aria-expanded={opt.key === 'custom' ? editing : undefined}
              onClick={() => {
                if (opt.key === 'custom') {
                  setDraft(customBuckets);
                  setEditing((v) => !v);
                  return;
                }
                setEditing(false);
                onPickPreset(opt.key);
              }}
              className={cn(
                'shrink-0 px-sm text-label-md whitespace-nowrap transition-colors',
                i > 0 && 'border-l border-border',
                on
                  ? 'bg-primary-tint text-primary'
                  : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {editing && (
        <div
          role="dialog"
          aria-label="Custom aging periods"
          className="absolute right-0 top-full z-30 mt-xs w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-border bg-surface p-md shadow-md"
        >
          <label htmlFor="aging-buckets" className="block text-label-md text-text-primary">
            Custom periods
          </label>
          <p className="text-caption text-text-tertiary">
            Where each column ends, in days overdue, smallest first.
          </p>
          <input
            id="aging-buckets"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(false);
              if (e.key === 'Enter' && valid) {
                setEditing(false);
                onApplyCustom(draft.trim());
              }
            }}
            placeholder="3, 6, 9, 12"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            aria-invalid={!valid}
            aria-describedby="aging-buckets-hint"
            className="mt-sm h-10 w-full rounded-md border border-border bg-surface px-sm text-body-md text-text-primary"
          />

          {/* What they are about to get, before they commit to it. */}
          <p
            id="aging-buckets-hint"
            className={cn(
              'mt-xs flex items-center gap-xxs text-caption',
              valid ? 'text-text-secondary' : 'text-danger',
            )}
          >
            {!valid && <AlertCircle className="size-3.5 shrink-0" />}
            {valid ? `Columns: ${previewColumns(parsed.days)}` : parsed.why}
          </p>

          <div className="mt-md flex justify-end gap-xs">
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                setEditing(false);
                onApplyCustom(draft.trim());
              }}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BucketPresetPicker;
