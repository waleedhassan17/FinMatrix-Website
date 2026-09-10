// ═══════════════════════════════════════════════════════
// FinMatrix Web — What the product does
// ═══════════════════════════════════════════════════════
// A bento grid rather than six identical boxes. The two modules that most
// distinguish FinMatrix — stock that posts to the ledger, and approvals before
// anything posts — get wide cards with a picture of the behaviour itself, built
// from real atoms. The rest sit between them.
//
// Every claim maps to a module that exists in this repo or the Android app.
// Nothing aspirational: a feature grid that oversells is a support queue later.

import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  ShieldCheck,
  Truck,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SectionIntro } from '@/features/landing/SectionIntro';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/utils/money';

interface Module {
  icon: LucideIcon;
  title: string;
  body: string;
}

const INVENTORY: Module = {
  icon: Package,
  title: 'Inventory that ties to the ledger',
  body: 'Item-level stock with weighted-average cost. Every movement posts its own journal entry, so the stock figure on your balance sheet is the stock figure in the warehouse.',
};

const PURCHASING: Module = {
  icon: ClipboardList,
  title: 'Purchase orders and receipting',
  body: 'Raise a PO, receive against it partially or in full, and match the supplier bill three ways. Goods received but not invoiced sit in their own account instead of going missing.',
};

const DELIVERIES: Module = {
  icon: Truck,
  title: 'Deliveries and riders',
  body: 'Assign loads to delivery staff, track what left and what came back, and require an approval before a return adjusts stock.',
};

const INVOICING: Module = {
  icon: FileText,
  title: 'Invoicing and receivables',
  body: 'Quotes to sales orders to invoices, with part-payments, credit notes and an ageing report that tells you who to chase this week.',
};

const ACCOUNTING: Module = {
  icon: BookOpen,
  title: 'Real accounting underneath',
  body: 'A full chart of accounts, manual journals, bank reconciliation and period close. Profit & loss, balance sheet and trial balance come out of the same entries.',
};

const APPROVALS: Module = {
  icon: ShieldCheck,
  title: 'Approvals before it posts',
  body: 'Staff submit; an owner approves. Maker-checker on the documents that move money or stock, with who-did-what kept on the record.',
};

function FeatureCard({
  module,
  visual,
  split = false,
}: {
  module: Module;
  visual?: ReactNode;
  /** Text beside the picture on wide screens, instead of above it. */
  split?: boolean;
}) {
  const Icon = module.icon;

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border border-border-light bg-surface p-xl shadow-card',
        'transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-primary-200 hover:shadow-lg',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        split && 'lg:flex-row lg:items-center lg:gap-xxxl',
      )}
    >
      {/* A brand rule that lights along the top edge on hover. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-linear-to-r from-primary via-primary-600 to-accent-teal opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <div className={cn(split && 'lg:w-[42%] lg:shrink-0')}>
        <span className="flex size-12 items-center justify-center rounded-xl bg-linear-to-br from-primary-50 to-primary-100 ring-1 ring-inset ring-primary-200">
          <Icon className="size-6 text-primary" aria-hidden="true" />
        </span>
        <h3 className="mt-lg text-h3 text-text-primary">{module.title}</h3>
        <p className="mt-sm text-body-md text-text-secondary">{module.body}</p>
      </div>

      {visual && (
        <div className={cn('mt-xl min-w-0', split && 'lg:mt-0 lg:flex-1')}>
          {visual}
        </div>
      )}
    </div>
  );
}

/** Stock rows with a posting confirmation — "ties to the ledger", shown. */
function StockLedgerVisual() {
  const rows = [
    { sku: 'CEM-50', name: 'Cement 50kg', qty: 1240, value: 1488000 },
    { sku: 'STL-12', name: 'Steel rebar 12mm', qty: 86, value: 2193000 },
    { sku: 'PNT-20', name: 'Emulsion 20L', qty: 412, value: 1136000 },
  ];

  return (
    <div
      aria-hidden="true"
      className="overflow-hidden rounded-lg border border-border-light bg-surface-2"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-md border-b border-border-light px-md py-xs text-overline text-neutral-500">
        <span>Item</span>
        <span className="text-right">On hand</span>
        <span className="text-right">Value</span>
      </div>
      {rows.map((row) => (
        <div
          key={row.sku}
          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-md border-b border-border-light bg-surface px-md py-sm last:border-b-0"
        >
          <div className="min-w-0">
            <p className="truncate text-label-md text-text-primary">{row.name}</p>
            <p className="text-caption text-text-secondary">{row.sku}</p>
          </div>
          <span className="text-right text-label-md tabular text-text-primary">
            {row.qty.toLocaleString('en-US')}
          </span>
          <span className="text-right text-label-md tabular text-text-primary">
            {formatMoney(row.value)}
          </span>
        </div>
      ))}
      <div className="flex items-center gap-xs bg-success-lighter px-md py-xs text-caption text-success-hover">
        <CheckCircle2 className="size-4 shrink-0" />
        Journal entry posted with the goods receipt
      </div>
    </div>
  );
}

/** Submit → review → post, with the product's own status badges. */
function ApprovalFlowVisual() {
  const steps = [
    { label: 'Staff submits', detail: `Bill · ${formatMoney(86400)}`, status: 'submitted', statusLabel: 'Submitted' },
    { label: 'Owner reviews', detail: 'Checks every line', status: 'pending', statusLabel: 'In review' },
    { label: 'Posts to the ledger', detail: 'Stock and payables move', status: 'posted', statusLabel: 'Posted' },
  ];

  return (
    <ol aria-hidden="true" className="grid gap-sm sm:grid-cols-3">
      {steps.map((step, i) => (
        <li
          key={step.label}
          className="relative flex flex-col gap-xs rounded-lg border border-border-light bg-surface-2 p-md"
        >
          <div className="flex items-center justify-between gap-xs">
            <span className="text-overline text-neutral-500">Step {i + 1}</span>
            <StatusBadge status={step.status} label={step.statusLabel} />
          </div>
          <p className="text-label-md text-text-primary">{step.label}</p>
          <p className="text-caption text-text-secondary">{step.detail}</p>

          {i < steps.length - 1 && (
            <span className="absolute top-1/2 -right-[18px] z-10 hidden size-6 -translate-y-1/2 items-center justify-center rounded-full border border-border-light bg-surface shadow-xs sm:flex">
              <ChevronRight className="size-4 text-primary" />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function ModulesSection() {
  return (
    <section
      id="modules"
      aria-labelledby="modules-heading"
      className="relative isolate scroll-mt-20 overflow-hidden bg-surface py-section lg:py-section-lg"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[480px] pattern-dots fade-mask-b"
      />

      <div className="mx-auto max-w-[1200px] px-lg">
        <SectionIntro
          id="modules-heading"
          overline="The system"
          title="One place for stock, suppliers, customers and cash"
          body="Most small distributors run a stock sheet, a separate invoice book and an accountant who reconciles them monthly. FinMatrix replaces all three with one set of records."
        />

        <ul className="mt-xxxxl grid gap-lg md:grid-cols-2 lg:grid-cols-3">
          <Reveal as="li" className="md:col-span-2">
            <FeatureCard module={INVENTORY} visual={<StockLedgerVisual />} split />
          </Reveal>
          <Reveal as="li" delay={70}>
            <FeatureCard module={PURCHASING} />
          </Reveal>
          <Reveal as="li" delay={70}>
            <FeatureCard module={DELIVERIES} />
          </Reveal>
          <Reveal as="li" delay={140}>
            <FeatureCard module={INVOICING} />
          </Reveal>
          <Reveal as="li" delay={210}>
            <FeatureCard module={ACCOUNTING} />
          </Reveal>
          <Reveal as="li" className="md:col-span-2 lg:col-span-3">
            <FeatureCard module={APPROVALS} visual={<ApprovalFlowVisual />} split />
          </Reveal>
        </ul>
      </div>
    </section>
  );
}

export default ModulesSection;
