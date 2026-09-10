import { DateField } from '@/components/ui/Field';
import { cn } from '@/lib/cn';
import {
  matchPreset,
  PERIOD_PRESETS,
  presetRange,
  type PeriodPresetKey,
  type ReportRange,
} from '@/models/reportPeriod';

export interface PeriodPickerProps {
  value: ReportRange;
  onChange: (range: ReportRange) => void;
  className?: string;
}

/**
 * Preset chips plus From/To fields, for the reports that cover a period.
 *
 * The active chip is DERIVED from the range (`matchPreset`) rather than held in
 * its own piece of state. The app keeps the selected index separately from the
 * range it loaded, so after the range is re-seeded the highlight points at a
 * period that is not what is on screen — two sources of truth for one fact.
 *
 * Typing in a date field moves the selection to Custom by the same derivation,
 * with nothing to keep in step.
 */
export function PeriodPicker({ value, onChange, className }: PeriodPickerProps) {
  const active = matchPreset(value);

  const pick = (key: PeriodPresetKey) => {
    // Custom is not a range of its own — it means "I will set the dates myself",
    // so selecting it leaves the current window alone rather than jumping.
    if (key === 'custom') return;
    onChange(presetRange(key));
  };

  return (
    <div className={cn('flex flex-col gap-sm', className)}>
      <div className="flex flex-wrap gap-xs">
        {PERIOD_PRESETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => pick(key)}
            aria-pressed={active === key}
            // Custom is a state, not an action: it lights up when the dates stop
            // matching a preset, and there is nothing to do when it is clicked.
            disabled={key === 'custom'}
            className={cn(
              'rounded-full border px-md py-xxs text-label-md transition-colors',
              active === key
                ? 'border-primary bg-primary-tint text-primary'
                : 'border-border text-text-secondary hover:border-primary hover:text-primary',
              key === 'custom' && 'cursor-default',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-sm">
        <DateField
          label="From"
          value={value.startDate}
          onChange={(startDate) => onChange({ ...value, startDate })}
          containerClassName="w-44"
          max={value.endDate}
        />
        <DateField
          label="To"
          value={value.endDate}
          onChange={(endDate) => onChange({ ...value, endDate })}
          containerClassName="w-44"
          min={value.startDate}
        />
      </div>
    </div>
  );
}

export interface AsOfPickerProps {
  value: string;
  onChange: (asOfDate: string) => void;
  className?: string;
}

/**
 * A single date, for the statements that close AS OF a moment rather than
 * covering a span — the balance sheet being the one that matters.
 */
export function AsOfPicker({ value, onChange, className }: AsOfPickerProps) {
  return (
    <DateField
      label="As of"
      value={value}
      onChange={onChange}
      containerClassName={cn('w-44', className)}
      hint="The date the statement closes on."
    />
  );
}

export default PeriodPicker;
