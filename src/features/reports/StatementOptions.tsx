import { AlignJustify, Rows3 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Switch } from '@/components/ui/Field';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { cn } from '@/lib/cn';
import { useStatementDensity, type StatementDensity } from '@/features/reports/statementPrefs';

export interface StatementOptionsProps {
  /** "Show zero-balance accounts". Omitted when the server sends no zero rows. */
  showZero?: { value: boolean; onChange: (value: boolean) => void };
  /** Further view toggles — common-size on the balance sheet. */
  children?: ReactNode;
  className?: string;
}

/**
 * The view toggles that sit above a statement: row density (kept in this
 * browser for every statement) and whatever the page adds. Print-hidden —
 * they change how the page reads, not what the statement says.
 */
export function StatementOptions({ showZero, children, className }: StatementOptionsProps) {
  const [density, setDensity] = useStatementDensity();
  return (
    <div className={cn('flex flex-wrap items-center gap-x-lg gap-y-sm print:hidden', className)}>
      {children}
      {showZero && (
        <Switch
          checked={showZero.value}
          onCheckedChange={showZero.onChange}
          label={<span className="text-body-sm">Show zero-balance accounts</span>}
        />
      )}
      <SegmentedControl<StatementDensity>
        label="Row density"
        size="sm"
        value={density}
        onChange={setDensity}
        className="ml-auto"
        options={[
          {
            value: 'comfortable',
            ariaLabel: 'Comfortable rows',
            label: <Rows3 className="size-4" aria-hidden="true" />,
          },
          {
            value: 'compact',
            ariaLabel: 'Compact rows',
            label: <AlignJustify className="size-4" aria-hidden="true" />,
          },
        ]}
      />
    </div>
  );
}

export default StatementOptions;
