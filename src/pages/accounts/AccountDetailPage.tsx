import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Lock, Pencil, Power, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { MoreActionsMenu, PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable, TablePager } from '@/components/ui/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import {
  ACCOUNT_TYPE_SINGULAR,
  checkDeactivation,
  normalBalanceFor,
} from '@/models/account';
import {
  deleteAccount,
  getAccountById,
  getAccounts,
  getAccountTransactions,
  toggleAccountActive,
} from '@/networks/accounting/accountNetwork';
import type { AccountLedgerRow } from '@/serializers/accountSerializer';
import { formatMoney } from '@/utils/money';

const PAGE_SIZE = 25;

const columnHelper = createColumnHelper<AccountLedgerRow>();

export default function AccountDetailPage() {
  const { accountId = '' } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['accounts', accountId],
    queryFn: () => getAccountById(accountId),
  });

  const account = data?.account ?? null;

  // For the parent's name — the detail route returns `parentId` alone.
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'chart', 'all'],
    queryFn: () => getAccounts(),
  });

  const { data: ledger, isFetching: loadingLedger } = useQuery({
    queryKey: ['accounts', accountId, 'transactions', page],
    queryFn: () => getAccountTransactions(accountId, { page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accounts'] });
  };

  const toggle = useMutation({
    mutationFn: () => toggleAccountActive(accountId),
    onSuccess: (updated) => {
      setToggleOpen(false);
      invalidate();
      toast.success(
        updated.isActive ? 'Account switched back on' : 'Account switched off',
      );
    },
    onError: (e: Error) => {
      setToggleOpen(false);
      toast.error('Could not change the account', { description: e.message });
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteAccount(accountId),
    onSuccess: () => {
      invalidate();
      toast.success('Account deleted');
      navigate('/accounts', { replace: true });
    },
    onError: (e: Error) => {
      setDeleteOpen(false);
      toast.error('Could not delete the account', { description: e.message });
    },
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('date', {
        header: 'Date',
        cell: (ctx) => (
          <span className="text-body-sm tabular text-text-primary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('reference', {
        header: 'Reference',
        cell: (ctx) => (
          <span className="text-label-md text-text-primary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('memo', {
        header: 'Memo',
        cell: (ctx) => (
          <span className="text-body-sm text-text-secondary">
            {ctx.getValue() || '—'}
          </span>
        ),
      }),
      columnHelper.accessor('debit', {
        header: 'Debit',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className="tabular text-body-sm text-text-primary">
            {ctx.getValue() > 0 ? formatMoney(ctx.getValue()) : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('credit', {
        header: 'Credit',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className="tabular text-body-sm text-text-primary">
            {ctx.getValue() > 0 ? formatMoney(ctx.getValue()) : '—'}
          </span>
        ),
      }),
      columnHelper.accessor('balance', {
        header: 'Balance',
        meta: { align: 'right' },
        cell: (ctx) => (
          <span className="tabular text-label-md text-text-primary">
            {formatMoney(ctx.getValue())}
          </span>
        ),
      }),
    ],
    [],
    // The column-helper's per-column value type will not widen to
    // `ColumnDef<T, unknown>`; the same cast every other list page uses.
  ) as never;

  if (isLoading) return <DetailPageSkeleton rail={false} />;

  if (isError || !account) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This account could not be loaded' : 'Account not found'}
        description={error instanceof Error ? error.message : 'It may have been deleted.'}
        backTo="/accounts"
        backLabel="Back to the chart of accounts"
      />
    );
  }

  const parent = account.parentId
    ? accounts.find((a) => a.id === account.parentId)
    : undefined;
  const children = accounts.filter((a) => a.parentId === account.id);
  const deactivation = checkDeactivation(account);
  const normal = normalBalanceFor(account.type);

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/accounts', label: 'Chart of accounts' }}
        title={
          <>
            <span className="tabular">{account.accountNumber}</span> · {account.name}
          </>
        }
        status={
          <>
            {account.isSystemAccount && (
              <span className="flex items-center gap-xxs rounded-full bg-neutral-100 px-sm py-xxs text-caption text-text-secondary">
                <Lock className="size-3" />
                System account
              </span>
            )}
            {!account.isActive && (
              <span className="rounded-full bg-warning-lighter px-sm py-xxs text-caption text-warning">
                Inactive
              </span>
            )}
          </>
        }
        meta={[ACCOUNT_TYPE_SINGULAR[account.type], account.subType || null]}
        actions={
          <>
            {/* Switching an inactive account back on is the way out of that
                state, so it stays in plain sight. */}
            {deactivation.allowed && !account.isActive && (
              <Button variant="secondary" size="sm" onClick={() => setToggleOpen(true)} disabled={toggle.isPending}>
                <Power className="size-4" />
                Switch on
              </Button>
            )}
            <Button asChild variant="secondary" size="sm">
              <Link to={`/accounts/${account.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            {/* Offered only when it can work. A system account or one still
                holding money answers 400, so the control is replaced by the
                reason below; delete needs no history, no children and not a
                system account — anything else is a deactivation. */}
            <MoreActionsMenu
              actions={[
                {
                  label: 'Switch off',
                  icon: Power,
                  destructive: true,
                  hidden: !(deactivation.allowed && account.isActive),
                  disabled: toggle.isPending,
                  onSelect: () => setToggleOpen(true),
                },
                {
                  label: 'Delete account',
                  icon: Trash2,
                  destructive: true,
                  hidden: !(!account.isSystemAccount && children.length === 0 && (ledger?.total ?? 0) === 0),
                  onSelect: () => setDeleteOpen(true),
                },
              ]}
            />
          </>
        }
      />

      {!deactivation.allowed && account.isActive && (
        <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
          <strong className="text-text-primary">This account stays on. </strong>
          {deactivation.reason}
        </p>
      )}

      <div className="grid gap-lg sm:grid-cols-3">
        <Figure
          label="Current balance"
          value={formatMoney(account.balance)}
          hint={`${normal === 'debit' ? 'Debit' : 'Credit'} balance is normal for ${ACCOUNT_TYPE_SINGULAR[
            account.type
          ].toLowerCase()} accounts`}
        />
        <Figure
          label="Opening balance"
          value={formatMoney(account.openingBalance)}
          hint={
            account.openingBalance === 0
              ? 'Started at nothing'
              : 'Posted against Opening Balance Equity (3900)'
          }
        />
        <Figure
          label="Entries"
          value={String(ledger?.total ?? 0)}
          hint="Postings against this account"
        />
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Details</TabsTrigger>
          <TabsTrigger value="transactions">
            Transactions{ledger?.total ? ` (${ledger.total})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card className="p-lg">
            <dl className="grid gap-md sm:grid-cols-2">
              <Detail label="Account number" value={account.accountNumber} />
              <Detail label="Name" value={account.name} />
              <Detail label="Type" value={ACCOUNT_TYPE_SINGULAR[account.type]} />
              <Detail label="Kind" value={account.subType} />
              <Detail
                label="Parent account"
                value={
                  parent ? (
                    <Link
                      to={`/accounts/${parent.id}`}
                      className="text-primary hover:underline"
                    >
                      {parent.accountNumber} · {parent.name}
                    </Link>
                  ) : (
                    'Top-level account'
                  )
                }
              />
              <Detail
                label="Sub-accounts"
                value={
                  children.length === 0 ? (
                    'None'
                  ) : (
                    <span className="flex flex-col gap-xxs">
                      {children.map((child) => (
                        <Link
                          key={child.id}
                          to={`/accounts/${child.id}`}
                          className="text-primary hover:underline"
                        >
                          {child.accountNumber} · {child.name}
                        </Link>
                      ))}
                    </span>
                  )
                }
              />
              <Detail
                label="Status"
                value={account.isActive ? 'Active' : 'Inactive'}
              />
              <Detail
                label="Normal balance"
                value={normal === 'debit' ? 'Debit' : 'Credit'}
              />
              {account.description && (
                <Detail
                  label="Description"
                  value={account.description}
                  className="sm:col-span-2"
                />
              )}
            </dl>
          </Card>
        </TabsContent>

        <TabsContent value="transactions">
          <DataTable
            columns={columns}
            data={ledger?.rows ?? []}
            isLoading={loadingLedger && !ledger}
            empty={
              <div className="py-xl text-center">
                <p className="text-label-lg text-text-primary">
                  Nothing posted yet
                </p>
                <p className="mt-xxs text-body-sm text-text-secondary">
                  Invoices, bills, payments and journal entries all show up here.
                </p>
              </div>
            }
          />
          {/* Real pagination, driven by the server's own block — the app
              hard-codes 50 rows and silently drops the rest. */}
          {ledger && (
            <TablePager
              page={ledger.page}
              totalPages={ledger.totalPages}
              total={ledger.total}
              onPage={setPage}
            />
          )}
          {(ledger?.rows.length ?? 0) > 0 && (
            <p className="mt-sm text-caption text-text-tertiary">
              Newest first. The balance column is the running balance the ledger
              recorded at the time of each posting.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={toggleOpen}
        onOpenChange={setToggleOpen}
        title={account.isActive ? 'Switch this account off?' : 'Switch this account on?'}
        description={
          account.isActive
            ? 'It stops appearing when coding new transactions. Its history stays, and you can switch it back on at any time.'
            : 'It becomes available again when coding new transactions.'
        }
        confirmLabel={account.isActive ? 'Switch off' : 'Switch on'}
        destructive={account.isActive}
        busy={toggle.isPending}
        onConfirm={() => toggle.mutate()}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this account?"
        description="The account is removed permanently. This is only possible because nothing has been posted to it — an account with history has to be switched off instead, so the old entries still have somewhere to point."
        confirmLabel="Delete permanently"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-lg">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-xxs text-h3 tabular text-text-primary">{value}</p>
      {hint && <p className="mt-xxs text-caption text-text-tertiary">{hint}</p>}
    </Card>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="mt-xxs text-body-md text-text-primary">{value}</dd>
    </div>
  );
}
