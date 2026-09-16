import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, FilePlus2, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { DateField, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { customerStatementDocument } from '@/features/documents/statementBuilders';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { PAYMENT_TERMS_LABELS, type Customer, type CustomerAddress } from '@/models/customer';
import {
  getCustomerById,
  getCustomerInvoices,
  getCustomerPayments,
  getCustomerStatement,
  toggleCustomerActive,
} from '@/networks/sales/customerNetwork';
import { colors } from '@/theme/tokens';
import { formatMoney } from '@/utils/money';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

export default function CustomerDetailPage() {
  const { customerId = '' } = useParams<{ customerId: string }>();
  const queryClient = useQueryClient();
  const canToggle = useAdminOnly('customer.toggleActive');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['customers', customerId],
    queryFn: () => getCustomerById(customerId),
  });

  const toggle = useMutation({
    mutationFn: () => toggleCustomerActive(customerId),
    onSuccess: (c) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(c.isActive ? 'Customer activated' : 'Customer deactivated');
    },
    onError: (e: Error) =>
      toast.error('Could not update customer', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton rail={false} />;

  if (isError || !data) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This customer could not be loaded' : 'Customer not found'}
        description={error instanceof Error ? error.message : 'It may have been removed.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/customers"
        backLabel="Back to customers"
      />
    );
  }

  const { customer, credit } = data;
  const usagePercent =
    credit.limit > 0 ? Math.min((credit.used / credit.limit) * 100, 100) : 0;
  const usageColor =
    usagePercent >= 80
      ? colors.danger
      : usagePercent >= 50
        ? colors.warning
        : colors.success;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
        title={customer.name}
        status={<StatusBadge status={customer.isActive ? 'active' : 'inactive'} />}
        meta={[
          customer.company && customer.company !== customer.name ? customer.company : null,
          customer.email ? (
            <a key="email" href={`mailto:${customer.email}`} className="hover:text-primary hover:underline">
              {customer.email}
            </a>
          ) : null,
          customer.phone || null,
        ]}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/customers/${customer.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/payments/new?customerId=${customer.id}`}>
                <Banknote className="size-4" />
                Receive payment
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to={`/invoices/new?customerId=${customer.id}`}>
                <FilePlus2 className="size-4" />
                New invoice
              </Link>
            </Button>
          </>
        }
      />

      <Card className="p-lg">
        <div className="grid gap-md sm:grid-cols-3">
          {/* Open invoices less open credit memos. Advances are shown on their
              own, never netted in, so money held for the customer does not
              read as a negative receivable. */}
          <Figure label="Receivable (invoices − credits)" value={formatMoney(customer.balance)} />
          <Figure
            label="Total purchases"
            value={formatMoney(customer.totalPurchases)}
          />
          <Figure label="Credit limit" value={credit.limit > 0 ? formatMoney(credit.limit) : 'No limit'} />
          {credit.advances > 0 && <Figure label="Advances held" value={formatMoney(credit.advances)} />}
        </div>

        {/* Hidden entirely when there is no limit — a usage bar against zero
            is meaningless, and the app hides it for the same reason. */}
        {credit.limit > 0 && (
          <div className="mt-md">
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${usagePercent}%`, backgroundColor: usageColor }}
              />
            </div>
            <p className="mt-xxs text-caption text-text-secondary tabular">
              {formatMoney(credit.used)} of {formatMoney(credit.limit)} used ·{' '}
              {formatMoney(Math.max(credit.available, 0))} available
            </p>
            <p className="mt-xxs text-caption text-text-tertiary">
              Used = unpaid invoices and goods shipped on credit, less advances and credits.
            </p>
          </div>
        )}
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            customer={customer}
            canToggle={canToggle}
            toggling={toggle.isPending}
            onToggle={() => toggle.mutate()}
          />
        </TabsContent>

        <TabsContent value="invoices">
          <InvoicesTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab customerId={customerId} />
        </TabsContent>

        <TabsContent value="statement">
          <StatementTab customer={customer} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-caption text-text-secondary">{label}</p>
      <p className="mt-xxs text-h3 text-text-primary tabular">{value}</p>
    </div>
  );
}

function formatAddress(a: CustomerAddress): string {
  const lines = [
    a.street,
    [a.city, a.state, a.zipCode].filter(Boolean).join(', '),
    a.country,
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : 'Not provided';
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-border-light py-xs last:border-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="whitespace-pre-line text-right text-body-sm text-text-primary">
        {value}
      </span>
    </div>
  );
}

function OverviewTab({
  customer,
  canToggle,
  toggling,
  onToggle,
}: {
  customer: Customer;
  canToggle: boolean;
  toggling: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-lg lg:grid-cols-2">
      <Card className="p-lg">
        <SectionHeader title="Contact" />
        <div className="mt-md">
          <Row label="Email" value={customer.email || '—'} />
          <Row label="Phone" value={customer.phone || '—'} />
          <Row label="Contact person" value={customer.contactPerson || '—'} />
          <Row label="Tax ID" value={customer.taxId || '—'} />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Terms" />
        <div className="mt-md">
          <Row
            label="Payment terms"
            value={PAYMENT_TERMS_LABELS[customer.paymentTerms] ?? customer.paymentTerms}
          />
          <Row label="Credit limit" value={formatMoney(customer.creditLimit)} />
          <Row label="Customer since" value={customer.createdAt.slice(0, 10) || '—'} />
          <Row label="Last updated" value={customer.updatedAt.slice(0, 10) || '—'} />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Billing address" />
        <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
          {formatAddress(customer.billingAddress)}
        </p>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Shipping address" />
        <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
          {formatAddress(customer.shippingAddress)}
        </p>
      </Card>

      {customer.notes && (
        <Card className="p-lg lg:col-span-2">
          <SectionHeader title="Notes" />
          <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
            {customer.notes}
          </p>
        </Card>
      )}

      {/* Admin only: PATCH /customers/:id/toggle-active is @Roles('admin').
          The app renders this for staff too, who collect a 403. */}
      {canToggle && (
        <Card className="p-lg lg:col-span-2">
          <SectionHeader title="Danger zone" />
          <p className="mt-md text-body-sm text-text-secondary">
            {customer.isActive
              ? 'Deactivating hides this customer from pickers. Their history is kept.'
              : 'Reactivating makes this customer selectable again.'}
          </p>
          <Button
            variant={customer.isActive ? 'danger' : 'primary'}
            className="mt-md"
            disabled={toggling}
            onClick={onToggle}
          >
            {toggling
              ? 'Updating…'
              : customer.isActive
                ? 'Deactivate customer'
                : 'Activate customer'}
          </Button>
        </Card>
      )}
    </div>
  );
}

function InvoicesTab({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customers', customerId, 'invoices'],
    queryFn: () => getCustomerInvoices(customerId, { limit: 50 }),
  });

  if (isLoading) return <Loading />;
  if (!data?.rows.length) return <Empty text="No invoices for this customer yet." />;

  return (
    <Card className="divide-y divide-border-light p-lg">
      {data.rows.map((r) => (
        <Link
          key={r.id}
          to={`/invoices/${r.id}`}
          className="flex items-center gap-md py-sm first:pt-0 last:pb-0 hover:bg-surface-hover"
        >
          <div className="min-w-0 flex-1">
            <p className="text-label-lg text-text-primary">{r.invoiceNumber}</p>
            <p className="text-caption text-text-secondary">
              {r.date} · due {r.dueDate || '—'}
            </p>
          </div>
          <StatusBadge status={r.status} />
          <div className="w-32 shrink-0 text-right">
            <p className="text-label-lg text-text-primary tabular">
              {formatMoney(r.amount)}
            </p>
            {r.balance > 0 && (
              <p className="text-caption text-danger tabular">
                {formatMoney(r.balance)} due
              </p>
            )}
          </div>
        </Link>
      ))}
    </Card>
  );
}

function PaymentsTab({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customers', customerId, 'payments'],
    queryFn: () => getCustomerPayments(customerId, { limit: 50 }),
  });

  if (isLoading) return <Loading />;
  if (!data?.rows.length)
    return <Empty text="No payments recorded for this customer yet." />;

  return (
    <Card className="divide-y divide-border-light p-lg">
      {data.rows.map((r) => (
        <div key={r.id} className="flex items-center gap-md py-sm first:pt-0 last:pb-0">
          <div className="min-w-0 flex-1">
            <p className="text-label-lg text-text-primary">{r.reference}</p>
            <p className="text-caption text-text-secondary">
              {r.date} · {r.method}
            </p>
          </div>
          <span className="text-label-lg text-success tabular">
            {formatMoney(r.amount)}
          </span>
        </div>
      ))}
    </Card>
  );
}

function StatementTab({ customer }: { customer: Customer }) {
  // Both dates are required by the server (@IsDateString), so there is no
  // "unbounded" option to offer. Year-to-date matches the app's hardcoded
  // range; unlike the app, it can be changed.
  const now = new Date();
  const [startDate, setStartDate] = useState(iso(new Date(now.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(iso(now));
  const company = useDocumentCompany();

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['customers', customer.id, 'statement', startDate, endDate],
    queryFn: () => getCustomerStatement(customer.id, { startDate, endDate }),
    enabled: Boolean(startDate && endDate),
  });

  const statement = useMemo(
    () => (data ? customerStatementDocument(data, company, customer, { startDate, endDate }) : null),
    [data, company, customer, startDate, endDate],
  );

  return (
    <div className="flex flex-col gap-lg">
      <Card className="flex flex-wrap items-end justify-between gap-md p-lg">
        <div className="flex flex-wrap items-end gap-md">
          <DateField
            label="From"
            value={startDate}
            onChange={setStartDate}
            containerClassName="w-44"
          />
          <DateField
            label="To"
            value={endDate}
            onChange={setEndDate}
            containerClassName="w-44"
          />
        </div>
        {statement && (
          <DocumentActions
            document={statement.share}
            getPdf={() => reportPdfBlob(statement.pdf)}
            cacheKey={[customer.id, startDate, endDate, dataUpdatedAt, company.name, company.logo].join('|')}
          />
        )}
      </Card>

      {isLoading ? (
        <Loading />
      ) : isError ? (
        <Empty
          text={error instanceof Error ? error.message : 'Could not load statement.'}
        />
      ) : !data ? (
        <Empty text="No statement for this period." />
      ) : (
        <Card className="p-lg">
          <div className="flex justify-between border-b border-border py-xs">
            <span className="text-label-md text-text-secondary">Opening balance</span>
            <span className="text-label-md text-text-primary tabular">
              {formatMoney(data.openingBalance)}
            </span>
          </div>

          {data.lines.length === 0 ? (
            <p className="py-lg text-center text-body-sm text-text-tertiary">
              No activity in this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border-light">
                    <th className="py-sm text-left text-overline text-text-secondary">
                      Date
                    </th>
                    <th className="py-sm text-left text-overline text-text-secondary">
                      Reference
                    </th>
                    <th className="py-sm text-right text-overline text-text-secondary">
                      Amount
                    </th>
                    <th className="py-sm text-right text-overline text-text-secondary">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.lines.map((l) => (
                    <tr key={`${l.kind}-${l.id}`} className="border-b border-border-light">
                      <td className="py-sm text-body-sm text-text-primary">{l.date}</td>
                      <td className="py-sm text-body-sm text-text-primary">
                        {l.reference}
                        <span className="ml-xs text-caption text-text-tertiary">
                          {l.kind === 'invoice' ? 'Invoice' : 'Payment'}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'py-sm text-right text-body-sm tabular',
                          l.amount < 0 ? 'text-success' : 'text-text-primary',
                        )}
                      >
                        {formatMoney(l.amount)}
                      </td>
                      <td className="py-sm text-right text-body-sm text-text-primary tabular">
                        {formatMoney(l.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-md flex flex-col gap-xxs border-t border-border pt-md">
            <SummaryLine label="Invoiced" value={formatMoney(data.totals.invoiced)} />
            <SummaryLine label="Received" value={formatMoney(data.totals.received)} />
            <SummaryLine
              label="Closing balance"
              value={formatMoney(data.closingBalance)}
              strong
            />
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryLine({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span
        className={cn(
          strong ? 'text-h4 text-text-primary' : 'text-body-sm text-text-secondary',
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          'tabular',
          strong ? 'text-h4 text-text-primary' : 'text-body-sm text-text-primary',
        )}
      >
        {value}
      </span>
    </div>
  );
}

const Loading = () => (
  <Card className="p-lg">
    <div className="space-y-xs">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100" />
      ))}
    </div>
  </Card>
);

const Empty = ({ text }: { text: string }) => (
  <Card className="p-xxl text-center">
    <p className="text-body-sm text-text-tertiary">{text}</p>
  </Card>
);
