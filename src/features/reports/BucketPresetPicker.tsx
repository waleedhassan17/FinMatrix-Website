import { useState } from 'react';
import { AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/Button';
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
 * A chip row rather than a Select: there are five options, they are short, and
 * the point of the control is that the alternatives are visible — someone who
 * does not already know the report can be re-bucketed will never open a
 * dropdown to find out. Modelled on PeriodPicker's chips, which is the house
 * pattern for exactly this.
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
    <div className="print:hidden">
      <p className="mb-xs text-overline text-text-tertiary">Age by</p>

      <div className="flex flex-wrap gap-xs">
        {PRESETS.map((opt) => {
          const on = preset === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (opt.key === 'custom') {
                  setDraft(customBuckets);
                  setEditing(true);
                  return;
                }
                setEditing(false);
                onPickPreset(opt.key);
              }}
              className={cn(
                'rounded-full border px-md py-xxs text-label-sm transition-colors',
                on
                  ? 'border-primary bg-primary text-text-inverse'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-hover',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="mt-sm rounded-md bg-surface-2 p-md">
          <label
            htmlFor="aging-buckets"
            className="block text-caption text-text-tertiary"
          >
            Column ends, in days overdue — ascending
          </label>
          <input
            id="aging-buckets"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="3, 6, 9, 12"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!valid}
            aria-describedby="aging-buckets-hint"
            className="mt-xs w-full rounded-md border border-border bg-surface px-sm py-xs text-body-md text-text-primary"
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
            {valid ? previewColumns(parsed.days) : parsed.why}
          </p>

          <div className="mt-sm flex justify-end gap-sm">
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
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
