import { useQuery } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { PiggyBank, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import type { Budget } from '@/models/budget';
import { getBudgets } from '@/networks/payroll/budgetNetwork';
import { formatMoney } from '@/utils/money';

const columnHelper = createColumnHelper<Budget>();

/** Budgets by fiscal year. Owner only. */
export default function BudgetListPage() {
  const enabled = useFeature('budgets');
  const navigate = useNavigate();
  const [year, setYear] = useState<number | 'all'>('all');

  const query = useQuery({ queryKey: ['budgets', 'list'], queryFn: () => getBudgets(), enabled });
  const budgets = useMemo(() => query.data ?? [], [query.data]);
  const years = useMemo(
    () => [...new Set(budgets.map((b) => b.fiscalYear))].sort((a, b) => b - a),
    [budgets],
  );
  const rows = year === 'all' ? budgets : budgets.filter((b) => b.fiscalYear === year);

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Budget',
        cell: (c) => <span className="text-label-md text-text-primary">{c.getValue()}</span>,
      }),
      columnHelper.accessor('fiscalYear', { header: 'Fiscal year', cell: (c) => `FY${c.getValue()}` }),
      columnHelper.accessor('totalBudget', {
        header: 'Total budgeted',
        meta: { align: 'right' },
        cell: (c) => <span className="tabular">{formatMoney(c.getValue())}</span>,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
    ],
    [],
  ) as never;

  if (!enabled) {
    return <FeatureUnavailable icon={PiggyBank} title="Budgets" body="Budgets are not included in your company’s plan." />;
  }

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        title="Budgets"
        description="Plan revenue and spending by account and month, then compare against what actually posted."
        actions={
          <Button asChild>
            <Link to="/budgets/new">
              <Plus className="size-4" />
              New budget
            </Link>
          </Button>
        }
      />

      {years.length > 1 && (
        <div className="flex flex-wrap gap-xs">
          {(['all', ...years] as const).map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setYear(y)}
              className={cn(
                'rounded-full px-md py-xs text-label-md transition-colors',
                year === y
                  ? 'bg-primary text-text-inverse'
                  : 'bg-surface-2 text-text-secondary hover:text-text-primary',
              )}
            >
              {y === 'all' ? 'All years' : `FY${y}`}
            </button>
          ))}
        </div>
      )}

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={rows}
        isLoading={query.isLoading}
        onRowClick={(b) => navigate(`/budgets/${b.id}`)}
        empty={
          <div className="py-xl text-center">
            <PiggyBank className="mx-auto size-8 text-text-tertiary" />
            <p className="mt-sm text-body-md text-text-secondary">No budgets yet.</p>
            <Button asChild className="mt-lg">
              <Link to="/budgets/new">
                <Plus className="size-4" />
                New budget
              </Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
