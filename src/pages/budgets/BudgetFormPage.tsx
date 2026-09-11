import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarRange, History, PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  BUDGET_STATUS_OPTIONS,
  MONTHS_SHORT,
  budgetPayload,
  budgetToForm,
  emptyBudgetForm,
  hasBudgetErrors,
  isRevenueType,
  lineAnnual,
  newBudgetLine,
  spreadAnnual,
  validateBudget,
  type BudgetErrors,
  type BudgetForm,
  type BudgetLineDraft,
  type BudgetStatus,
} from '@/models/budget';
import { getAccounts } from '@/networks/accounting/accountNetwork';
import {
  createBudget,
  getBudget,
  getBudgetPrefill,
  updateBudget,
} from '@/networks/payroll/budgetNetwork';
import { Decimal, formatMoney } from '@/utils/money';

/**
 * Create or edit a budget. Owner only.
 *
 * Each line is an account with twelve monthly amounts. Typing an annual figure
 * spreads it evenly (rounding lands in December); opening the months lets the
 * seasonality be set by hand. "Start from last year" fills the lines with the
 * previous fiscal year's posted actuals, month by month.
 */
export default function BudgetFormPage() {
  const { budgetId } = useParams<{ budgetId: string }>();
  const editing = Boolean(budgetId);
  const enabled = useFeature('budgets');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const thisYear = new Date().getFullYear();

  const budgetQuery = useQuery({
    queryKey: ['budgets', budgetId],
    queryFn: () => getBudget(budgetId!),
    enabled: enabled && editing,
  });
  const accountsQuery = useQuery({
    queryKey: ['accounts', 'list', 'budgetable'],
    queryFn: () => getAccounts({ isActive: true }),
    enabled,
  });

  const [draft, setDraft] = useState<BudgetForm | null>(null);
  const form =
    draft ?? (budgetQuery.data ? budgetToForm(budgetQuery.data) : emptyBudgetForm(thisYear));
  const [errors, setErrors] = useState<BudgetErrors>({ line: {} });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [confirmPrefill, setConfirmPrefill] = useState(false);

  const accounts = useMemo(
    () => (accountsQuery.data ?? []).filter((a) => a.type === 'revenue' || a.type === 'expense'),
    [accountsQuery.data],
  );
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const accountOptions = useMemo(
    () =>
      [...accounts]
        .sort((a, b) => a.accountNumber.localeCompare(b.accountNumber))
        .map((a) => ({
          value: a.id,
          label: `${a.accountNumber} · ${a.name} (${a.type === 'revenue' ? 'revenue' : 'expense'})`,
        })),
    [accounts],
  );

  const set = (next: BudgetForm) => {
    setDraft(next);
    setErrors({ line: {} });
  };
  const setLine = (key: string, line: BudgetLineDraft) =>
    set({ ...form, lines: form.lines.map((l) => (l.key === key ? line : l)) });

  const fy = Number(form.fiscalYear) || thisYear;
  const prefill = useMutation({
    mutationFn: () => getBudgetPrefill(fy - 1),
    onSuccess: (lines) => {
      setConfirmPrefill(false);
      if (lines.length === 0) {
        toast.info(`Nothing posted in FY${fy - 1}`, {
          description: 'There are no revenue or expense actuals to start from.',
        });
        return;
      }
      set({
        ...form,
        name: form.name || `FY${fy} Budget`,
        lines: lines.map((l) => newBudgetLine(l.accountId, l.monthlyAmounts)),
      });
      toast.success(`Filled from FY${fy - 1} actuals`, {
        description: `${lines.length} accounts, month by month. Adjust them for the year ahead.`,
      });
    },
    onError: (e: Error) => toast.error('Could not load last year’s actuals', { description: e.message }),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = budgetPayload(form);
      return editing ? updateBudget(budgetId!, body) : createBudget(body);
    },
    onSuccess: (saved) => {
      for (const key of ['budgets']) queryClient.invalidateQueries({ queryKey: [key] });
      toast.success(editing ? 'Budget updated' : 'Budget created', { description: saved.name });
      navigate(`/budgets/${saved.id || budgetId}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not save the budget', { description: e.message }),
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateBudget(form);
    setErrors(e);
    if (!hasBudgetErrors(e)) save.mutate();
  };

  if (!enabled) {
    return <FeatureUnavailable icon={PiggyBank} title="Budgets" body="Budgets are not included in your company’s plan." />;
  }
  if (editing && budgetQuery.isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading budget…</p>;
  }
  if (editing && !budgetQuery.data) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Budget not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">{budgetQuery.error?.message ?? 'It may have been deleted.'}</p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/budgets">Back to budgets</Link>
        </Button>
      </Card>
    );
  }

  // Revenue and spending are totalled apart — adding them together would be
  // a number that means nothing.
  let revenue = new Decimal(0);
  let expense = new Decimal(0);
  for (const l of form.lines) {
    const a = accountById.get(l.accountId);
    if (!a) continue;
    if (isRevenueType(a.type)) revenue = revenue.plus(lineAnnual(l));
    else expense = expense.plus(lineAnnual(l));
  }
  const hasValues = form.lines.some((l) => lineAnnual(l).greaterThan(0));

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-5xl flex-col gap-lg" noValidate>
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={editing ? `/budgets/${budgetId}` : '/budgets'}>
          <ArrowLeft className="size-4" />
          {editing ? 'Budget' : 'Budgets'}
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">{editing ? 'Edit budget' : 'New budget'}</h1>
          <p className="text-body-sm text-text-secondary">
            Budget vs Actual compares each line against the account’s posted ledger movement for
            the fiscal year.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={prefill.isPending}
          onClick={() => (hasValues ? setConfirmPrefill(true) : prefill.mutate())}
        >
          <History className="size-4" />
          {prefill.isPending ? 'Loading…' : `Start from FY${fy - 1} actuals`}
        </Button>
      </div>

      <Card className="grid gap-md p-lg sm:grid-cols-3">
        <Input label="Name *" value={form.name} onChange={(e) => set({ ...form, name: e.target.value })} error={errors.name} placeholder="FY2026 Operating Budget" />
        <Input label="Fiscal year *" value={form.fiscalYear} onChange={(e) => set({ ...form, fiscalYear: e.target.value })} inputMode="numeric" error={errors.fiscalYear} />
        <Select label="Status" value={form.status} onChange={(v) => set({ ...form, status: v as BudgetStatus })} options={BUDGET_STATUS_OPTIONS} />
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Lines" />
        {errors.lines && <p className="mt-sm text-body-sm text-danger">{errors.lines}</p>}
        <div className="mt-md flex flex-col gap-md">
          {form.lines.map((line) => {
            const open = expanded.has(line.key);
            const annual = lineAnnual(line);
            return (
              <div key={line.key} className="rounded-md border border-border-light p-md">
                <div className="grid items-start gap-sm sm:grid-cols-[minmax(0,1fr)_12rem_auto]">
                  <Combobox
                    label="Account"
                    value={line.accountId}
                    onChange={(v) => setLine(line.key, { ...line, accountId: v })}
                    options={accountOptions}
                    placeholder={accountsQuery.isLoading ? 'Loading accounts…' : 'Choose a revenue or expense account'}
                    searchPlaceholder="Search by number or name…"
                    error={errors.line[line.key]}
                    compact
                  />
                  <AnnualInput
                    value={annual}
                    onSpread={(text) => setLine(line.key, spreadAnnual(line, text))}
                  />
                  <div className="flex gap-xxs sm:mt-lg">
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      aria-expanded={open}
                      onClick={() =>
                        setExpanded((s) => {
                          const next = new Set(s);
                          if (next.has(line.key)) next.delete(line.key);
                          else next.add(line.key);
                          return next;
                        })
                      }
                    >
                      <CalendarRange className="size-4" />
                      {open ? 'Hide months' : 'Months'}
                    </Button>
                    <Button
                      type="button"
                      variant="text"
                      size="sm"
                      aria-label="Remove line"
                      onClick={() =>
                        set({
                          ...form,
                          lines: form.lines.length > 1 ? form.lines.filter((l) => l.key !== line.key) : [newBudgetLine()],
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {open && (
                  <div className="mt-md grid grid-cols-3 gap-xs sm:grid-cols-6 lg:grid-cols-12">
                    {line.months.map((m, i) => (
                      <label key={MONTHS_SHORT[i]} className="flex flex-col gap-xxs">
                        <span className="text-caption text-text-secondary">{MONTHS_SHORT[i]}</span>
                        <input
                          value={m}
                          onChange={(e) =>
                            setLine(line.key, {
                              ...line,
                              months: line.months.map((x, j) => (j === i ? e.target.value : x)),
                            })
                          }
                          inputMode="decimal"
                          aria-label={`${MONTHS_SHORT[i]} amount`}
                          className="h-9 w-full rounded-md border border-border bg-surface px-xs text-right text-body-sm tabular outline-none focus:border-primary"
                        />
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-md"
          onClick={() => set({ ...form, lines: [...form.lines, newBudgetLine()] })}
        >
          <Plus className="size-4" />
          Add account
        </Button>
      </Card>

      <Card className="grid gap-md p-lg sm:grid-cols-3">
        <Total label="Budgeted revenue" value={revenue} />
        <Total label="Budgeted spending" value={expense} />
        <Total label="Planned surplus" value={revenue.minus(expense)} strong />
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to={editing ? `/budgets/${budgetId}` : '/budgets'}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : editing ? 'Save budget' : 'Create budget'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmPrefill}
        onOpenChange={setConfirmPrefill}
        title={`Replace the lines with FY${fy - 1} actuals?`}
        description="The lines you have entered are replaced by last year’s posted revenue and expense figures, month by month."
        confirmLabel="Replace lines"
        busy={prefill.isPending}
        onConfirm={() => prefill.mutate()}
      />
    </form>
  );
}

/**
 * The annual figure. Shows the sum of the months, but keeps what is typed while
 * the field has focus — re-deriving on every keystroke would swallow a trailing
 * "." and make decimals impossible to type.
 */
function AnnualInput({ value, onSpread }: { value: Decimal; onSpread: (text: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <Input
      label="Annual"
      value={text ?? (value.isZero() ? '' : value.toString())}
      onFocus={() => setText(value.isZero() ? '' : value.toString())}
      onChange={(e) => {
        setText(e.target.value);
        onSpread(e.target.value);
      }}
      onBlur={() => setText(null)}
      inputMode="decimal"
      className="tabular"
      placeholder="0.00"
      hint="Spread evenly across months"
    />
  );
}

function Total({ label, value, strong }: { label: string; value: Decimal; strong?: boolean }) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={cn('tabular', strong ? 'text-h3 text-text-primary' : 'text-h4 text-text-primary')}>
        {formatMoney(value)}
      </p>
    </div>
  );
}
