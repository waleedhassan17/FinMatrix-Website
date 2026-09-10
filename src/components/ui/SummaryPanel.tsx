import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { colors, form } from '@/theme/tokens';
import { formatMoney, type MoneyInput } from '@/utils/money';

const PANEL = form.summaryPanel;

/**
 * The dark totals panel that closes every transaction form.
 *
 * In the app this markup is inlined in five separate screens — InvoiceForm,
 * BillForm, PayBills, POForm and ReceivePayment — each reading THEME.form
 * .summaryPanel but drawing its own rows. Extracting it was called out as the
 * obvious first win of the web port, so it is one component here.
 *
 * The four accents carry meaning and are not interchangeable:
 *   accent    the gold — panel heading and the grand-total label
 *   positive  a credit or discount, money coming back off the total
 *   caution   a figure needing attention — an unapplied payment amount
 *   negative  a figure that is outright wrong — an overpayment with nowhere to go
 *
 * Colours are inline because they live on a near-black gradient that the
 * light-ground token utilities do not cover.
 */

export type SummaryTone = 'default' | 'positive' | 'caution' | 'negative';

const TONE_COLOR: Record<SummaryTone, string> = {
  default: PANEL.text,
  positive: PANEL.positive,
  caution: PANEL.caution,
  negative: PANEL.negative,
};

export interface SummaryRowProps {
  label: ReactNode;
  value: MoneyInput;
  tone?: SummaryTone;
  /** Prefix the value with a minus — used for discounts and credits. */
  negate?: boolean;
  currency?: string;
}

export function SummaryRow({
  label,
  value,
  tone = 'default',
  negate = false,
  currency,
}: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between py-[6px]">
      {/* h5 role at body weight — the app's label/value contrast on this panel. */}
      <span className="text-h5 font-normal" style={{ color: PANEL.label }}>
        {label}
      </span>
      <span className="text-h5 tabular" style={{ color: TONE_COLOR[tone] }}>
        {negate && '−'}
        {formatMoney(value, currency)}
      </span>
    </div>
  );
}

export function SummaryDivider() {
  return (
    <div className="my-[6px] h-px" style={{ backgroundColor: PANEL.divider }} />
  );
}

export interface SummaryPanelProps {
  /** Heading, rendered in the gold accent. Defaults to "SUMMARY". */
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** The grand total, set apart below a divider. */
  total?: { label: string; value: MoneyInput; currency?: string };
  className?: string;
}

export function SummaryPanel({
  title = 'Summary',
  icon,
  children,
  total,
  className,
}: SummaryPanelProps) {
  return (
    <div
      className={cn('rounded-lg p-lg shadow-md', className)}
      style={{ background: PANEL.gradient }}
    >
      <div
        className="mb-xs flex items-center gap-xs text-label-md"
        style={{ color: PANEL.accent, letterSpacing: '0.5px' }}
      >
        {icon}
        <span className="uppercase">{title}</span>
      </div>

      {children}

      {total && (
        <>
          <SummaryDivider />
          <div className="flex items-center justify-between py-[6px]">
            <span className="text-h4" style={{ color: PANEL.accent }}>
              {total.label}
            </span>
            <span className="text-h2 tabular" style={{ color: colors.neutral0 }}>
              {formatMoney(total.value, total.currency)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default SummaryPanel;
