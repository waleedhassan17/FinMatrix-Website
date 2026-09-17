import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { ProofLink } from '@/features/bills/ProofLink';
import { DocumentView } from '@/features/documents/DocumentView';
import {
  useCustomerOptions,
  useInventoryOptions,
  useVendorOptions,
} from '@/features/documents/useDocumentPickers';
import { useRiders } from '@/features/delivery/useRiders';
import { voidTargetLink, type ApprovalRequest } from '@/models/approval';
import { computeBillTotals } from '@/models/bill';
import { computeTotals, type DiscountType } from '@/models/document';
import { formatReportDate } from '@/models/reportPeriod';
import { getDepositAccounts, getPostableAccounts } from '@/networks/accounting/accountNetwork';
import type { DocumentLine } from '@/serializers/documentLines';
import { formatMoney, toDecimal, toNumber } from '@/utils/money';

// ─── Payload helpers ────────────────────────────────────────────────────────

type Raw = Record<string, unknown>;
const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const rows = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(asRaw) : []);
const text = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown): number => toNumber(v as never);
const date = (v: unknown): string => {
  const s = text(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? formatReportDate(s) : '—';
};
const humanize = (v: unknown): string => {
  const s = text(v).replace(/_/g, ' ');
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '—';
};
const discountTypeOf = (v: unknown): DiscountType =>
  v === 'percent' || v === 'amount' ? v : 'none';

/**
 * A read-only preview of what approving will post — for every request type.
 *
 * The app previews three types (invoice, PO, customer payment) by reopening their
 * forms; the other seven are decided on a one-line summary. An owner approving a
 * journal entry or a bill payment without seeing the accounts or the bills it
 * touches is signing off something they have not read. Each type here renders
 * what its payload will actually do, with names resolved — every field the
 * request carries, so there is no raw JSON for anyone to fall back on.
 */
export function ApprovalPreview({ request }: { request: ApprovalRequest }) {
  const action = text(request.payload.action) || 'create';
  switch (request.type) {
    case 'invoice':
      return <SalesDocumentPreview request={request} title="Invoice" />;
    case 'credit_memo':
      if (action === 'apply') return <ApplyPreview request={request} kind="credit_memo" />;
      if (action === 'refund') return <RefundPreview request={request} />;
      return <SalesDocumentPreview request={request} title="Credit memo" />;
    case 'po':
      return <PurchaseOrderPreview request={request} />;
    case 'vendor_credit':
      if (action === 'apply') return <ApplyPreview request={request} kind="vendor_credit" />;
      return <VendorCreditPreview request={request} />;
    case 'invoice_payment':
      return <CustomerPaymentPreview request={request} />;
    case 'bill_payment':
      return <BillPaymentPreview request={request} />;
    case 'journal':
      return <JournalPreview request={request} />;
    case 'void':
      return <VoidPreview request={request} />;
    case 'adjustment':
      return <AdjustmentPreview request={request} />;
    case 'delivery_undo':
      return <DeliveryUndoPreview request={request} />;
    case 'delivery_advance':
      return <DeliveryAdvancePreview request={request} />;
  }
}

// ─── Building blocks ────────────────────────────────────────────────────────

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-lg gap-y-sm sm:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-caption text-text-secondary">{label}</dt>
          <dd className="mt-xxs text-body-md text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex items-center gap-xxs text-primary hover:underline">
      {children}
      <ArrowUpRight className="size-3" />
    </Link>
  );
}

function PreviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-lg">
      <h2 className="mb-md text-label-lg text-text-primary">{title}</h2>
      {children}
    </Card>
  );
}

/** The item or account a line books to — the document table shows only its description. */
function LineName({ name }: { name: string }) {
  return <span className="text-caption text-text-secondary">{name || '—'}</span>;
}

// ─── Per type ───────────────────────────────────────────────────────────────

function SalesDocumentPreview({ request, title }: { request: ApprovalRequest; title: string }) {
  const p = request.payload;
  const { byId: customers } = useCustomerOptions();
  const { items } = useInventoryOptions();
  const raw = rows(p.lines);
  const discountType = discountTypeOf(p.discountType);

  const lines: DocumentLine[] = raw.map((l, i) => ({
    id: `line-${i}`,
    itemId: text(l.itemId),
    itemName: items.find((it) => it.id === text(l.itemId))?.name ?? '',
    description: text(l.description),
    quantity: num(l.quantity),
    unitPrice: num(l.unitPrice),
    taxRate: num(l.taxRate),
    amount: toDecimal(l.quantity as never).times(toDecimal(l.unitPrice as never)).toDecimalPlaces(2).toNumber(),
  }));
  const totals = computeTotals(
    raw.map((l) => ({ quantity: l.quantity as never, unitPrice: l.unitPrice as never, taxRate: (l.taxRate ?? 0) as never })),
    discountType,
    (p.discountValue ?? 0) as never,
  );

  const meta: [string, string][] = [];
  // An invoice sends `invoiceDate`; a credit memo sends plain `date`.
  const docDate = p.invoiceDate ?? p.date ?? p.creditMemoDate;
  if (docDate) meta.push(['Date', date(docDate)]);
  if (p.dueDate) meta.push(['Due', date(p.dueDate)]);
  if (p.status) meta.push(['On approval', p.status === 'draft' ? 'Saved as a draft — posts nothing yet' : 'Posted']);

  return (
    <DocumentView
      title={title}
      counterpartyLabel="Customer"
      counterpartyName={customers.get(text(p.customerId))?.name ?? '—'}
      meta={meta}
      lines={lines}
      subtotal={totals.subtotal}
      discountType={discountType}
      discountValue={num(p.discountValue)}
      discountAmount={totals.discountAmount}
      taxAmount={totals.taxAmount}
      total={totals.total}
      notes={text(p.notes ?? p.reason)}
    />
  );
}

function PurchaseOrderPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { byId: vendors } = useVendorOptions();
  const { items } = useInventoryOptions();
  const raw = rows(p.lines);
  const lines: DocumentLine[] = raw.map((l, i) => ({
    id: `line-${i}`,
    itemId: text(l.itemId),
    itemName: items.find((it) => it.id === text(l.itemId))?.name ?? '',
    description: text(l.description),
    quantity: num(l.orderedQty),
    unitPrice: num(l.unitCost),
    taxRate: num(l.taxRate),
    amount: toDecimal(l.orderedQty as never).times(toDecimal(l.unitCost as never)).toDecimalPlaces(2).toNumber(),
  }));
  const totals = computeTotals(
    raw.map((l) => ({ quantity: l.orderedQty as never, unitPrice: l.unitCost as never, taxRate: (l.taxRate ?? 0) as never })),
    'none',
    0,
  );
  const meta: [string, string][] = [['Order date', date(p.orderDate)]];
  if (p.expectedDate) meta.push(['Expected', date(p.expectedDate)]);

  return (
    <DocumentView
      // A PO request is committed as a draft: a purchase requisition.
      title="Purchase requisition"
      counterpartyLabel="Supplier"
      counterpartyName={vendors.get(text(p.vendorId))?.name ?? '—'}
      meta={meta}
      lines={lines}
      subtotal={totals.subtotal}
      discountType="none"
      discountValue={0}
      discountAmount={0}
      taxAmount={totals.taxAmount}
      total={totals.total}
      quantityHeader="Ordered"
      priceHeader="Unit cost"
      {...(lines.some((l) => l.itemName) && {
        lineExtraHeader: 'Item',
        lineExtra: (line: DocumentLine) => <LineName name={line.itemName} />,
      })}
      notes={text(p.notes)}
    />
  );
}

function VendorCreditPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { byId: vendors } = useVendorOptions();
  const { items } = useInventoryOptions();
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: getPostableAccounts,
  });
  const raw = rows(p.lines);
  const lines: DocumentLine[] = raw.map((l, i) => {
    const account = accounts.find((a) => a.id === text(l.accountId));
    return {
      id: `line-${i}`,
      itemId: text(l.itemId),
      // A line names an item or, failing that, the account it books to.
      itemName:
        items.find((it) => it.id === text(l.itemId))?.name ??
        (account ? `${account.accountNumber} · ${account.name}` : ''),
      description: text(l.description),
      quantity: num(l.quantity),
      unitPrice: 0,
      taxRate: num(l.taxRate),
      amount: num(l.amount),
    };
  });
  const totals = computeBillTotals(
    raw.map((l) => ({ amount: l.amount as never, taxRate: (l.taxRate ?? 0) as never })),
  );

  return (
    <DocumentView
      title="Vendor credit"
      counterpartyLabel="Supplier"
      counterpartyName={vendors.get(text(p.vendorId))?.name ?? '—'}
      meta={[['Date', date(p.date)]]}
      lines={lines}
      subtotal={totals.subtotal}
      discountType="none"
      discountValue={0}
      discountAmount={0}
      taxAmount={totals.taxAmount}
      total={totals.total}
      showQuantity={false}
      {...(lines.some((l) => l.itemName) && {
        lineExtraHeader: 'Item or account',
        lineExtra: (line: DocumentLine) => <LineName name={line.itemName} />,
      })}
      notes={text(p.reason)}
    />
  );
}

function ApplyPreview({
  request,
  kind,
}: {
  request: ApprovalRequest;
  kind: 'credit_memo' | 'vendor_credit';
}) {
  const p = request.payload;
  const isMemo = kind === 'credit_memo';
  const creditId = text(isMemo ? p.creditMemoId : p.vendorCreditId);
  const targetId = text(isMemo ? p.invoiceId : p.billId);

  return (
    <PreviewCard title={isMemo ? 'Apply a credit memo' : 'Apply a vendor credit'}>
      <Facts
        items={[
          [
            isMemo ? 'Credit memo' : 'Vendor credit',
            creditId ? (
              <DocLink key="credit" to={`${isMemo ? '/credit-memos' : '/vendor-credits'}/${creditId}`}>Open credit</DocLink>
            ) : (
              '—'
            ),
          ],
          [
            isMemo ? 'Against invoice' : 'Against bill',
            targetId ? (
              <DocLink key="target" to={`${isMemo ? '/invoices' : '/bills'}/${targetId}`}>
                Open {isMemo ? 'invoice' : 'bill'}
              </DocLink>
            ) : (
              '—'
            ),
          ],
          ['Amount applied', p.amount === undefined ? '—' : formatMoney(num(p.amount))],
        ]}
      />
    </PreviewCard>
  );
}

function RefundPreview({ request }: { request: ApprovalRequest }) {
  const id = text(request.payload.creditMemoId);
  return (
    <PreviewCard title="Refund a credit memo in cash">
      <p className="mb-md text-body-sm text-text-secondary">
        Pays the credit memo’s remaining balance back to the customer. Cash leaves the
        business.
      </p>
      <Facts items={[['Credit memo', id ? <DocLink key="memo" to={`/credit-memos/${id}`}>Open credit memo</DocLink> : '—']]} />
    </PreviewCard>
  );
}

function AllocationTable({
  heading,
  items,
}: {
  heading: string;
  items: { key: string; link: ReactNode; amount: number }[];
}) {
  return (
    <div className="mt-lg overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="px-md py-sm text-left text-overline text-text-secondary">{heading}</th>
            <th className="px-md py-sm text-right text-overline text-text-secondary">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((a) => (
            <tr key={a.key} className="border-b border-border-light last:border-0">
              <td className="px-md py-sm text-body-sm">{a.link}</td>
              <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                {formatMoney(a.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CustomerPaymentPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { byId: customers } = useCustomerOptions();
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'deposit'],
    queryFn: getDepositAccounts,
  });
  const bankAccountId = text(p.bankAccountId);
  const bank = accounts.find((a) => a.id === bankAccountId);
  const apps = rows(p.applications);
  const amount = num(p.amount);
  const allocated = apps.reduce((s, a) => s.plus(toDecimal(a.amount as never)), toDecimal(0));
  const unapplied = toDecimal(amount).minus(allocated);

  return (
    <PreviewCard title="Customer payment">
      <Facts
        items={[
          ['Customer', customers.get(text(p.customerId))?.name ?? '—'],
          ['Received', date(p.paymentDate)],
          ['Method', humanize(p.paymentMethod)],
          [
            'Deposited to',
            // Omitted, the server picks 1000 Cash for a cash payment, else 1010 Business Checking.
            !bankAccountId
              ? 'Automatic — Cash for cash payments, otherwise Business Checking'
              : bank
                ? `${bank.accountNumber} · ${bank.name}`
                : '—',
          ],
          ['Amount', formatMoney(amount)],
          ['Reference', text(p.reference) || '—'],
          ['Memo', text(p.memo) || '—'],
        ]}
      />
      {apps.length === 0 ? (
        <p className="mt-lg text-body-sm text-text-secondary">
          No invoices named — on approval it is applied to the customer’s oldest unpaid
          invoices first.
        </p>
      ) : (
        <>
          <AllocationTable
            heading="Applied to"
            items={apps.map((a, i) => ({
              key: `${text(a.invoiceId)}-${i}`,
              link: <DocLink to={`/invoices/${text(a.invoiceId)}`}>Invoice {i + 1}</DocLink>,
              amount: num(a.amount),
            }))}
          />
          {unapplied.greaterThan(0.005) && (
            <p className="mt-sm text-body-sm text-text-secondary">
              {formatMoney(unapplied.toNumber())} is not applied to an invoice and is held
              as a customer credit.
            </p>
          )}
        </>
      )}
      <p className="mt-md text-caption text-text-tertiary">
        If an invoice has been paid or voided since this was requested, approving fails
        and the reason is recorded on the request.
      </p>
    </PreviewCard>
  );
}

function BillPaymentPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { byId: vendors } = useVendorOptions();
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'deposit'],
    queryFn: getDepositAccounts,
  });
  const bank = accounts.find((a) => a.id === text(p.bankAccountId));
  const apps = rows(p.applications);
  const total = apps.reduce((s, a) => s.plus(toDecimal(a.amount as never)), toDecimal(0));
  const proofId = text(p.proofId);

  return (
    <PreviewCard title="Bill payment">
      <Facts
        items={[
          ['Supplier', vendors.get(text(p.vendorId))?.name ?? '—'],
          ['Paid on', date(p.paymentDate)],
          ['Method', humanize(p.paymentMethod)],
          ['From account', bank ? `${bank.accountNumber} · ${bank.name}` : '—'],
          ['Total paid', formatMoney(total.toNumber())],
          ['Reference', text(p.reference) || '—'],
        ]}
      />
      <AllocationTable
        heading="Bills paid"
        items={apps.map((a, i) => ({
          key: `${text(a.billId)}-${i}`,
          link: <DocLink to={`/bills/${text(a.billId)}`}>Bill {i + 1}</DocLink>,
          amount: num(a.amount),
        }))}
      />
      {proofId && (
        <div className="mt-lg">
          <p className="mb-xs text-caption text-text-secondary">Proof of payment</p>
          <ProofLink proofId={proofId} />
        </div>
      )}
    </PreviewCard>
  );
}

function JournalPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'postable'],
    queryFn: getPostableAccounts,
  });

  const draftId = text(p.draftEntryId);
  if (draftId) {
    return (
      <PreviewCard title="Post a draft journal entry">
        <p className="text-body-sm text-text-secondary">
          Posts an existing draft to the ledger exactly as it stands.{' '}
          <DocLink to={`/journal-entries/${draftId}`}>Open the draft</DocLink>
        </p>
      </PreviewCard>
    );
  }

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const lines = rows(p.lines);
  const debits = lines.reduce((s, l) => s.plus(toDecimal(l.debit as never)), toDecimal(0));
  const credits = lines.reduce((s, l) => s.plus(toDecimal(l.credit as never)), toDecimal(0));

  return (
    <PreviewCard title="Journal entry">
      <Facts
        items={[
          ['Date', date(p.date)],
          ['Memo', text(p.memo) || '—'],
          ['On approval', p.status === 'draft' ? 'Saved as a draft — posts nothing yet' : 'Posted to the ledger'],
          ...(p.isOpeningBalance ? ([['Kind', 'Opening balances']] as [string, string][]) : []),
        ]}
      />
      <div className="mt-lg overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              <th className="px-md py-sm text-left text-overline text-text-secondary">Account</th>
              <th className="px-md py-sm text-left text-overline text-text-secondary">Description</th>
              <th className="px-md py-sm text-right text-overline text-text-secondary">Debit</th>
              <th className="px-md py-sm text-right text-overline text-text-secondary">Credit</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const a = byId.get(text(l.accountId));
              return (
                <tr key={i} className="border-b border-border-light">
                  <td className="px-md py-sm text-body-sm text-text-primary">
                    {a ? `${a.accountNumber} · ${a.name}` : 'Account not found or inactive'}
                  </td>
                  <td className="px-md py-sm text-body-sm text-text-secondary">{text(l.description) || '—'}</td>
                  <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                    {num(l.debit) > 0 ? formatMoney(num(l.debit)) : '—'}
                  </td>
                  <td className="px-md py-sm text-right text-body-sm tabular text-text-primary">
                    {num(l.credit) > 0 ? formatMoney(num(l.credit)) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-text-primary">
              <td colSpan={2} className="px-md py-sm text-label-lg text-text-primary">Total</td>
              <td className="px-md py-sm text-right text-label-lg tabular text-text-primary">
                {formatMoney(debits.toNumber())}
              </td>
              <td className="px-md py-sm text-right text-label-lg tabular text-text-primary">
                {formatMoney(credits.toNumber())}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {!debits.equals(credits) && (
        <p className="mt-sm text-body-sm text-danger">
          Debits and credits do not match — the server will refuse to post this.
        </p>
      )}
    </PreviewCard>
  );
}

const VOID_ENTITY_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  journal: 'Journal entry',
  credit_memo: 'Credit memo',
  vendor_credit: 'Vendor credit',
  adjustment: 'Inventory adjustment',
};

function VoidPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const link = voidTargetLink(p);
  const entity = VOID_ENTITY_LABELS[text(p.entity)] ?? humanize(p.entity);
  return (
    <PreviewCard title={`Void a ${entity.toLowerCase()}`}>
      <p className="mb-md text-body-sm text-text-secondary">
        Nothing is deleted. A balancing entry is posted that reverses the original, and
        both stay in the ledger.
      </p>
      <Facts
        items={[
          ['Document', link ? <DocLink key="doc" to={link}>Open the {entity.toLowerCase()}</DocLink> : entity],
          ['Reason given', text(p.reason) || '—'],
        ]}
      />
    </PreviewCard>
  );
}

const ADJUSTMENT_REASONS: Record<string, string> = {
  physical_count: 'Physical count',
  damage: 'Damage',
  theft: 'Theft',
  correction: 'Correction',
  obsolescence: 'Obsolescence',
  other: 'Other',
};

function AdjustmentPreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { items } = useInventoryOptions();
  const item = items.find((i) => i.id === text(p.itemId));
  const observed = p.observedQty === undefined ? null : num(p.observedQty);
  const target = p.newQty === undefined ? null : num(p.newQty);

  return (
    <PreviewCard title="Inventory adjustment">
      <Facts
        items={[
          ['Item', item?.name ?? '—'],
          ...(p.date ? ([['Date', date(p.date)]] as [string, string][]) : []),
          ['Reason', ADJUSTMENT_REASONS[text(p.reason)] ?? humanize(p.reason)],
          ['On hand when requested', observed === null ? '—' : String(observed)],
          ['Set to', target === null ? '—' : String(target)],
          ['Change', observed === null || target === null ? '—' : `${target - observed > 0 ? '+' : ''}${target - observed}`],
          ['Notes', text(p.notes) || '—'],
        ]}
      />
      <p className="mt-md text-caption text-text-tertiary">
        If the stock has moved since this was requested, the server refuses a stale
        physical count and re-bases a write-off onto today’s quantity.
      </p>
    </PreviewCard>
  );
}

function DeliveryUndoPreview({ request }: { request: ApprovalRequest }) {
  const completionId =
    typeof request.payload?.requestId === 'string' ? request.payload.requestId : '';
  return (
    <PreviewCard title="Undo an approved delivery">
      <p className="text-body-sm text-text-secondary">
        Reverses the delivery’s recognised revenue with an entry dated today, and returns
        it to its pre-approval state.
      </p>
      {completionId && (
        <p className="mt-sm text-body-sm">
          <DocLink to={`/deliveries/completions?focus=${completionId}`}>
            Open the completion it undoes
          </DocLink>
        </p>
      )}
      {request.reason && (
        <p className="mt-md text-body-sm text-text-primary">
          <span className="text-text-secondary">Why: </span>
          {request.reason}
        </p>
      )}
    </PreviewCard>
  );
}

/**
 * A staff member's delivery that the customer has paid for in advance. The
 * owner sees the whole delivery, because approving creates all of it: the
 * receipt now, and — when a rider is named — the dispatch too.
 */
function DeliveryAdvancePreview({ request }: { request: ApprovalRequest }) {
  const p = request.payload;
  const { byId: customers } = useCustomerOptions();
  const { items } = useInventoryOptions();
  const { riders } = useRiders();
  const raw = rows(p.items);

  const lines: DocumentLine[] = raw.map((l, i) => ({
    id: `line-${i}`,
    itemId: text(l.itemId),
    itemName: items.find((it) => it.id === text(l.itemId))?.name ?? text(l.itemName),
    description: text(l.itemName) || items.find((it) => it.id === text(l.itemId))?.name || '',
    quantity: num(l.orderedQty),
    unitPrice: num(l.unitPrice),
    taxRate: num(l.taxRate),
    amount: toDecimal(l.orderedQty as never).times(toDecimal((l.unitPrice ?? 0) as never)).toDecimalPlaces(2).toNumber(),
  }));
  const totals = computeTotals(
    raw.map((l) => ({ quantity: l.orderedQty as never, unitPrice: (l.unitPrice ?? 0) as never, taxRate: (l.taxRate ?? 0) as never })),
    'none',
    0,
  );
  const advance =
    text(p.advanceAmount) !== '' ? num(p.advanceAmount) : p.prePaid === true ? totals.total : 0;
  const rest = Math.max(toDecimal(totals.total).minus(advance).toNumber(), 0);
  const riderId = text(p.personnelId);
  const rider = riders.find((r) => r.userId === riderId);

  return (
    <div className="flex flex-col gap-md">
      <PreviewCard title="Paid in advance">
        <Facts
          items={[
            ['Customer', customers.get(text(p.customerId))?.name ?? (text(p.customerName) || '—')],
            ['Order total', formatMoney(totals.total)],
            ['Paid in advance', formatMoney(advance)],
            ['The rider collects', rest > 0 ? formatMoney(rest) : 'Nothing — paid in full'],
            ['Rider', riderId ? rider?.name || rider?.username || 'Assigned rider' : 'Not assigned yet'],
            ['Wanted on', date(p.preferredDate ?? p.scheduledDate)],
          ]}
        />
        <p className="mt-md text-body-sm text-text-secondary">
          Approving creates the delivery and records {formatMoney(advance)} as a cash receipt (Dr Cash /
          Cr Customer Advances). No sale is recorded yet — that happens when the completed delivery is
          approved.{riderId ? ' The stock is dispatched to the rider at the same time.' : ''} Stock and
          the credit limit are checked again when you approve.
        </p>
      </PreviewCard>
      <DocumentView
        title="Delivery"
        counterpartyLabel="Customer"
        counterpartyName={customers.get(text(p.customerId))?.name ?? (text(p.customerName) || '—')}
        meta={text(p.notes) ? [['Notes for the rider', text(p.notes)]] : []}
        lines={lines}
        subtotal={totals.subtotal}
        discountType="none"
        discountValue={0}
        discountAmount={totals.discountAmount}
        taxAmount={totals.taxAmount}
        total={totals.total}
        notes=""
      />
    </div>
  );
}

export default ApprovalPreview;
