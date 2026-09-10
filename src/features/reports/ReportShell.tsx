import { ArrowLeft, Printer, Table2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/cn';

export interface ReportShellProps {
  title: string;
  subtitle?: string;
  /** The period controls — `PeriodPicker`, `AsOfPicker`, or nothing. */
  controls?: ReactNode;
  /** Extra controls beside the export actions, e.g. a comparison toggle. */
  actions?: ReactNode;

  /** Called for Download CSV. Omit to hide the button. */
  onExportCsv?: () => void;
  /** Disable export while there is nothing to export. */
  canExport?: boolean;

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
 */
export function ReportShell({
  title,
  subtitle,
  controls,
  actions,
  onExportCsv,
  canExport = true,
  isLoading,
  isRefetching = false,
  error,
  onRetry,
  hasData,
  empty,
  children,
}: ReportShellProps) {
  return (
    <div className="flex flex-col gap-lg">
      {/* `print:hidden` on everything that is chrome — the printed page should be
          the statement alone. */}
      <div className="print:hidden">
        <Button asChild variant="text" size="sm" className="self-start px-0">
          <Link to="/reports">
            <ArrowLeft className="size-4" />
            Reports
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-md print:hidden">
        <div>
          <h1 className="text-h2 text-text-primary">{title}</h1>
          {subtitle && (
            <p className="text-body-sm text-text-secondary">{subtitle}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-xs">
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
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            disabled={!hasData}
          >
            <Printer className="size-4" />
            Print
          </Button>
        </div>
      </div>

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
