import { DateField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { addDays } from '@/models/document';
import {
  AS_OF_COMPARE_KEYS,
  AS_OF_COMPARE_LABELS,
  RANGE_COMPARE_KEYS,
  RANGE_COMPARE_LABELS,
  resolveAsOfComparison,
  resolveRangeComparison,
  type AsOfCompareKey,
  type RangeCompareKey,
} from '@/models/reportComparison';
import { formatShortDate, type ReportRange } from '@/models/reportPeriod';

interface AsOfComparisonProps {
  kind: 'asOf';
  value: AsOfCompareKey;
  asOf: string;
  /** The current fiscal year's first day; "Prior fiscal year-end" waits for it. */
  fiscalYearStart?: string;
  customDate: string | null;
  onChange: (key: AsOfCompareKey, customDate: string | null) => void;
  className?: string;
}

interface RangeComparisonProps {
  kind: 'range';
  value: RangeCompareKey;
  range: ReportRange;
  onChange: (key: RangeCompareKey) => void;
  className?: string;
}

export type ComparisonPickerProps = AsOfComparisonProps | RangeComparisonProps;

/**
 * What a statement is compared against.
 *
 * As-of reports (the balance sheet) compare one date with an earlier one:
 * the prior month-end, the prior fiscal year-end, or a date of your choosing.
 * Range reports compare one period with the one before it, or with the same
 * period a year earlier. The resolved date or window is named under the
 * control, so "Prior month-end" is never a guess about which day it means.
 */
export function ComparisonPicker(props: ComparisonPickerProps) {
  if (props.kind === 'range') {
    const resolved = resolveRangeComparison(props.value, props.range);
    return (
      <div className={cn('flex flex-col gap-xxs', props.className)}>
        <Select<RangeCompareKey>
          label="Compare with"
          compact
          value={props.value}
          onChange={props.onChange}
          options={RANGE_COMPARE_KEYS.map((key) => ({ value: key, label: RANGE_COMPARE_LABELS[key] }))}
          containerClassName="w-56"
        />
        {resolved && (
          <p className="text-caption text-text-tertiary tabular">
            {formatShortDate(resolved.startDate)} – {formatShortDate(resolved.endDate)}
          </p>
        )}
      </div>
    );
  }

  const { value, asOf, fiscalYearStart, customDate, onChange, className } = props;
  const keys = AS_OF_COMPARE_KEYS.filter((k) => k !== 'priorFiscalYearEnd' || !!fiscalYearStart);
  const resolved = resolveAsOfComparison(value, asOf, { fiscalYearStart, custom: customDate });
  const dayBefore = addDays(asOf, -1);

  return (
    <div className={cn('flex flex-wrap items-start gap-sm', className)}>
      <div className="flex flex-col gap-xxs">
        <Select<AsOfCompareKey>
          label="Compare with"
          compact
          value={value}
          onChange={(key) => onChange(key, key === 'custom' ? (customDate ?? null) : null)}
          options={keys.map((key) => ({ value: key, label: AS_OF_COMPARE_LABELS[key] }))}
          containerClassName="w-56"
        />
        {resolved && value !== 'custom' && (
          <p className="text-caption text-text-tertiary tabular">{formatShortDate(resolved)}</p>
        )}
      </div>
      {value === 'custom' && (
        <DateField
          label="Comparison date"
          value={customDate ?? ''}
          max={dayBefore}
          onChange={(date) => onChange('custom', date || null)}
          containerClassName="w-44"
          error={customDate && customDate >= asOf ? 'Pick a date before the statement date.' : undefined}
        />
      )}
    </div>
  );
}

export default ComparisonPicker;
