import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, FilePlus2, Pencil } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layout/PageHeader';
import { DetailPageSkeleton, PageMessage } from '@/components/layout/PageState';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DateField, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Field';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { reportPdfBlob } from '@/features/documents/documentPdf';
import { vendorStatementDocument } from '@/features/documents/statementBuilders';
import { useDocumentCompany } from '@/features/documents/useDocumentContext';
import { DocumentActions } from '@/features/share/DocumentActions';
import { useAdminOnly } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { PAYMENT_TERMS_LABELS } from '@/models/customer';
import { vendorBalanceTone, type Vendor, type VendorAddress } from '@/models/vendor';
import {
  deleteVendor,
  getVendorBills,
  getVendorById,
  getVendorPayments,
  getVendorStatement,
  toggleVendorActive,
} from '@/networks/purchases/vendorNetwork';
import { formatMoney } from '@/utils/money';

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

export default function VendorDetailPage() {
  const { vendorId = '' } = useParams<{ vendorId: string }>();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const canToggle = useAdminOnly('vendor.toggleActive');
  const canDelete = useAdminOnly('vendor.delete');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: vendor, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['vendors', vendorId],
    queryFn: () => getVendorById(vendorId),
  });

  const toggle = useMutation({
    mutationFn: () => toggleVendorActive(vendorId),
    onSuccess: (v) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(v.isActive ? 'Vendor activated' : 'Vendor deactivated');
    },
    onError: (e: Error) =>
      toast.error('Could not update vendor', { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: () => deleteVendor(vendorId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success('Vendor deleted');
      navigate('/vendors', { replace: true });
    },
    // VENDOR_HAS_ACTIVITY comes back with a message telling you to deactivate
    // instead. Surfacing it verbatim is more useful than a generic failure.
    onError: (e: Error) =>
      toast.error('Could not delete vendor', { description: e.message }),
  });

  if (isLoading) return <DetailPageSkeleton rail={false} />;

  if (isError || !vendor) {
    return (
      <PageMessage
        tone={isError ? 'error' : 'notFound'}
        title={isError ? 'This vendor could not be loaded' : 'Vendor not found'}
        description={error instanceof Error ? error.message : 'It may have been removed.'}
        onRetry={isError ? () => refetch() : undefined}
        backTo="/vendors"
        backLabel="Back to vendors"
      />
    );
  }

  const owes = vendor.balance > 0;

  return (
    <div className="flex flex-col gap-lg">
      <PageHeader
        back={{ to: '/vendors', label: 'Vendors' }}
        title={vendor.name}
        status={<StatusBadge status={vendor.isActive ? 'active' : 'inactive'} />}
        meta={[
          vendor.contactPerson || null,
          vendor.email ? (
            <a key="email" href={`mailto:${vendor.email}`} className="hover:text-primary hover:underline">
              {vendor.email}
            </a>
          ) : null,
          vendor.phone || null,
        ]}
        actions={
          <>
            <Button asChild variant="secondary" size="sm">
              <Link to={`/vendors/${vendor.id}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            {owes && (
              <Button asChild variant="secondary" size="sm">
                <Link to={`/bills/pay?vendorId=${vendor.id}`}>
                  <Banknote className="size-4" />
                  Pay bills
                </Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link to={`/bills/new?vendorId=${vendor.id}`}>
                <FilePlus2 className="size-4" />
                New bill
              </Link>
            </Button>
          </>
        }
      />

      <Card className="p-lg">
        <div className="grid gap-md sm:grid-cols-3">
          {/* Framed as what you owe, not as a neutral "balance" — the number
              means the opposite of the identically-named customer figure. */}
          <div>
            <p className="text-caption text-text-secondary">You owe</p>
            <p
              className={cn(
                'mt-xxs text-h3 tabular',
                vendorBalanceTone(vendor.balance) === 'danger'
                  ? 'text-danger'
                  : 'text-success',
              )}
            >
              {formatMoney(vendor.balance)}
            </p>
            <p className="mt-xxs text-caption text-text-tertiary">
              {owes ? 'Outstanding accounts payable' : 'Account is settled'}
            </p>
          </div>
          <Figure
            label="Payment terms"
            value={PAYMENT_TERMS_LABELS[vendor.paymentTerms] ?? vendor.paymentTerms}
          />
          <Figure label="Tax ID" value={vendor.taxId || '—'} />
        </div>
      </Card>

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
          <TabsTrigger value="statement">Statement</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            vendor={vendor}
            canToggle={canToggle}
            canDelete={canDelete}
            toggling={toggle.isPending}
            onToggle={() => toggle.mutate()}
            onDelete={() => setConfirmDelete(true)}
          />
        </TabsContent>

        <TabsContent value="bills">
          <BillsTab vendorId={vendorId} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsTab vendorId={vendorId} />
        </TabsContent>

        <TabsContent value="statement">
          <StatementTab vendor={vendor} />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this vendor?"
        description="This cannot be undone. If the vendor has any bills, payments or a balance, the server will refuse — deactivate them instead."
        confirmLabel="Delete vendor"
        destructive
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
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

function formatAddress(a: VendorAddress): string {
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
  vendor,
  canToggle,
  canDelete,
  toggling,
  onToggle,
  onDelete,
}: {
  vendor: Vendor;
  canToggle: boolean;
  canDelete: boolean;
  toggling: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="grid gap-lg lg:grid-cols-2">
      <Card className="p-lg">
        <SectionHeader title="Contact" />
        <div className="mt-md">
          <Row label="Contact person" value={vendor.contactPerson || '—'} />
          <Row label="Email" value={vendor.email || '—'} />
          <Row label="Phone" value={vendor.phone || '—'} />
          <Row label="Tax ID" value={vendor.taxId || '—'} />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Terms & accounting" />
        <div className="mt-md">
          <Row
            label="Payment terms"
            value={PAYMENT_TERMS_LABELS[vendor.paymentTerms] ?? vendor.paymentTerms}
          />
          {/* Vendors have this; customers have nothing equivalent. */}
          <Row
            label="Default expense account"
            value={vendor.defaultExpenseAccountId ? 'Set' : 'Not set'}
          />
          <Row label="Vendor since" value={vendor.createdAt.slice(0, 10) || '—'} />
          <Row label="Last updated" value={vendor.updatedAt.slice(0, 10) || '—'} />
        </div>
      </Card>

      {/* One address, flat — there is no billing/shipping pair on a vendor. */}
      <Card className="p-lg">
        <SectionHeader title="Address" />
        <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
          {formatAddress(vendor.address)}
        </p>
      </Card>

      {vendor.notes && (
        <Card className="p-lg">
          <SectionHeader title="Notes" />
          <p className="mt-md whitespace-pre-line text-body-sm text-text-primary">
            {vendor.notes}
          </p>
        </Card>
      )}

      {(canToggle || canDelete) && (
        <Card className="p-lg lg:col-span-2">
          <SectionHeader title="Danger zone" />
          <p className="mt-md text-body-sm text-text-secondary">
            {vendor.isActive
              ? 'Deactivating hides this vendor from the bill and purchase-order pickers. Their history is kept.'
              : 'Reactivating makes this vendor selectable again.'}
          </p>
          <div className="mt-md flex flex-wrap gap-xs">
            {canToggle && (
              <Button
                variant={vendor.isActive ? 'danger' : 'primary'}
                disabled={toggling}
                onClick={onToggle}
              >
                {toggling
                  ? 'Updating…'
                  : vendor.isActive
                    ? 'Deactivate vendor'
                    : 'Activate vendor'}
              </Button>
            )}
            {/* Deletion is refused once there is any history at all, so it is
                offered second and quietly — deactivating is the usual path. */}
            {canDelete && (
              <Button variant="text" onClick={onDelete}>
                Delete permanently
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function BillsTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vendors', vendorId, 'bills'],
    queryFn: () => getVendorBills(vendorId, { limit: 50 }),
  });

  if (isLoading) return <Loading />;
  if (!data?.rows.length) return <Empty text="No bills from this vendor yet." />;

  return (
    <Card className="divide-y divide-border-light p-lg">
      {data.rows.map((r) => (
        <Link
          key={r.id}
          to={`/bills/${r.id}`}
          className="flex items-center gap-md py-sm first:pt-0 last:pb-0 hover:bg-surface-hover"
        >
          <div className="min-w-0 flex-1">
            <p className="text-label-lg text-text-primary">{r.billNumber}</p>
            <p className="text-caption text-text-secondary">
              {r.date} · due {r.dueDate || '—'}
            </p>
          </div>
          {/* Status is re-derived in the serializer: this route does not apply
              the overdue rule that GET /bills does. */}
          <StatusBadge status={r.status} />
          <div className="w-32 shrink-0 text-right">
            <p className="text-label-lg text-text-primary tabular">
              {formatMoney(r.amount)}
            </p>
            {r.balance > 0 && (
              <p className="text-caption text-danger tabular">
                {formatMoney(r.balance)} owing
              </p>
            )}
          </div>
        </Link>
      ))}
    </Card>
  );
}

function PaymentsTab({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['vendors', vendorId, 'payments'],
    queryFn: () => getVendorPayments(vendorId, { limit: 50 }),
  });

  if (isLoading) return <Loading />;
  if (!data?.rows.length) return <Empty text="No payments to this vendor yet." />;

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
          {/* Money out — not the success colour the customer side uses. */}
          <span className="text-label-lg text-text-primary tabular">
            {formatMoney(r.amount)}
          </span>
        </div>
      ))}
    </Card>
  );
}

function StatementTab({ vendor }: { vendor: Vendor }) {
  const now = new Date();
  const [startDate, setStartDate] = useState(iso(new Date(now.getFullYear(), 0, 1)));
  const [endDate, setEndDate] = useState(iso(now));
  const company = useDocumentCompany();

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['vendors', vendor.id, 'statement', startDate, endDate],
    queryFn: () => getVendorStatement(vendor.id, { startDate, endDate }),
    enabled: Boolean(startDate && endDate),
  });

  const statement = useMemo(
    () => (data ? vendorStatementDocument(data, company, vendor, { startDate, endDate }) : null),
    [data, company, vendor, startDate, endDate],
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
            cacheKey={[vendor.id, startDate, endDate, dataUpdatedAt, company.name, company.logo].join('|')}
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
                          {l.kind === 'bill' ? 'Bill' : 'Payment'}
                        </span>
                      </td>
                      {/* A payment reduces what we owe, so it is the good
                          direction here — the sign convention matches the
                          customer statement even though the meaning flips. */}
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
            <SummaryLine label="Billed" value={formatMoney(data.totals.billed)} />
            <SummaryLine label="Paid" value={formatMoney(data.totals.paid)} />
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
