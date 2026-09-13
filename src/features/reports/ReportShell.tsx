import { Printer, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import type { ReportSection } from '@/features/reports/reportPdfTable';
import { DocumentActions } from '@/features/share/DocumentActions';
import { cn } from '@/lib/cn';

export interface ReportPdfOptions {
  /** "Jan 1, 2026 – Sep 13, 2026" or "As of Sep 13, 2026". */
  periodLabel: string;
  basis?: string;
  /** Changes whenever the figures or the controls do, so a stale PDF is never reused. */
  cacheKey: string;
  /** The report's tables, from the same rows the screen draws. */
  build: () => ReportSection[];
}

export interface ReportShellProps {
  title: string;
  subtitle?: string;
  /** The period controls — `PeriodPicker`, `AsOfPicker`, or nothing. */
  controls?: ReactNode;
  /** Extra controls beside the export actions, e.g. a comparison toggle. */
  actions?: ReactNode;
  /** Where "back" goes. Defaults to the reports hub; `null` for none. */
  back?: { to: string; label: string } | null;

  /** Called for Download CSV. Omit to hide the button. */
  onExportCsv?: () => void;
  /** Disable export while there is nothing to export. */
  canExport?: boolean;
  /** Print, PDF and Share. Without it the page falls back to the browser's print. */
  pdf?: ReportPdfOptions;

  /** True only on the very first load, when there is nothing to show yet. */
  isLoading: boolean;
  /** True on a refetch, while previous figures are still on screen. */
  isRefetching?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  /** Whether any data has arrived. Drives the empty state. */
  hasData: boolean;
  empty?: ReactNode;

  children: ReactNode;
}

/**
 * The frame every report sits in, and the state machine behind it.
 *
 * Two behaviours here are deliberate departures from the app, and both are about
 * not lying to the reader:
 *
 *   REFETCHING KEEPS THE OLD FIGURES, DIMMED. The app renders
 *   `{report && !isLoading && …}`, so changing a date blanks the whole statement
 *   to a spinner and throws away the scroll position. Dimming says "these are the
 *   previous figures, new ones are coming" — which is true — and the reader keeps
 *   their place.
 *
 *   AN ERROR REPLACES THE STATEMENT, it does not sit above it. The app's error
 *   block is not exclusive with its data block, so a failed refresh shows a red
 *   banner above figures that are silently out of date, with nothing to say which
 *   period they belong to. Stale accounting figures presented as current are worse
 *   than no figures.
 *
 * Print, PDF and Share produce the statement on company letterhead from the same
 * rows the page draws — not a screenshot of the screen with its controls.
 */
export function ReportShell({
  title,
  subtitle,
  controls,
  actions,
  back,
  onExportCsv,
  canExport = true,
  pdf,
  isLoading,
  isRefetching = false,
  error,
  onRetry,
  hasData,
  empty,
  children,
}: ReportShellProps) {
  const company = useDocumentCompany();
  const backLink = back === undefined ? { to: '/reports', label: 'Reports' } : (back ?? undefined);

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        className="print:hidden"
        back={backLink}
        title={title}
        description={subtitle}
        actions={
          <>
            {actions}
            {onExportCsv && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onExportCsv}
                disabled={!canExport || !hasData}
              >
                <Table2 className="size-4" />
                CSV
              </Button>
            )}
            {pdf ? (
              <DocumentActions
                document={{ kind: title, period: pdf.periodLabel, companyName: company.name }}
                getPdf={() =>
                  reportPdfBlob({
                    title,
                    periodLabel: pdf.periodLabel,
                    basis: pdf.basis,
                    company,
                    sections: pdf.build(),
                  })
                }
                cacheKey={[title, pdf.cacheKey, company.name, company.logo].join('|')}
                disabled={!hasData || isRefetching}
              />
            ) : (
              <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!hasData}>
                <Printer className="size-4" />
                Print
              </Button>
            )}
          </>
        }
      />

      {controls && <div className="print:hidden">{controls}</div>}

      {isLoading && (
        <p className="text-body-sm text-text-secondary">Loading…</p>
      )}

      {!isLoading && error && (
        <Card className="p-xl">
          <p className="text-label-lg text-text-primary">
            This report could not be loaded
          </p>
          <p className="mt-xxs text-body-sm text-text-secondary">
            {error.message}
          </p>
          {onRetry && (
            <Button variant="secondary" className="mt-lg" onClick={onRetry}>
              Try again
            </Button>
          )}
        </Card>
      )}

      {!isLoading && !error && !hasData && (
        <Card className="p-xl text-center">
          {empty ?? (
            <>
              <p className="text-label-lg text-text-primary">Nothing to report</p>
              <p className="mt-xxs text-body-sm text-text-secondary">
                There are no figures for this period yet.
              </p>
            </>
          )}
        </Card>
      )}

      {!isLoading && !error && hasData && (
        <div
          className={cn(
            'transition-opacity',
            // Dimmed, not replaced. `aria-busy` tells a screen reader the same
            // thing the opacity tells everyone else.
            isRefetching && 'pointer-events-none opacity-50',
          )}
          aria-busy={isRefetching}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default ReportShell;
