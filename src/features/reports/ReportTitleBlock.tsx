import { useAppSelector } from '@/store/store';
import { selectCompany } from '@/store/authSlice';

export interface ReportTitleBlockProps {
  /** The statement's name, e.g. "Profit & Loss". */
  report: string;
  /** `rangeLabel(...)` or `asOfLabel(...)`. */
  periodLabel: string;
}

/**
 * The heading a printed statement needs: whose books, which statement, what
 * period, on what basis.
 *
 * **"Accrual basis" is stated, not offered as a choice.** No report endpoint
 * accepts a basis parameter and the ledger has no cash-basis path — the app's
 * equivalent component takes a `basis` prop that no screen ever passes, so it
 * always prints the same word from a control that does not exist. Saying it plainly
 * is the honest version: a reader needs to know which basis they are looking at,
 * and a toggle that cannot change it would be worse than no toggle.
 *
 * The company name comes from the auth store here rather than from a prop because
 * every caller would pass the same value; what it does not do is reach for a PDF
 * module for a fallback, as the app's version does.
 */
export function ReportTitleBlock({ report, periodLabel }: ReportTitleBlockProps) {
  const company = useAppSelector(selectCompany);

  return (
    <div className="border-b border-border-light pb-md text-center">
      <p className="text-h4 text-text-primary">{company?.name ?? 'Your company'}</p>
      <h2 className="mt-xxs text-h3 text-text-primary">{report}</h2>
      <p className="mt-xxs text-body-sm text-text-secondary">{periodLabel}</p>
      <p className="mt-xxs text-caption text-text-tertiary">Accrual basis</p>
    </div>
  );
}

export default ReportTitleBlock;
