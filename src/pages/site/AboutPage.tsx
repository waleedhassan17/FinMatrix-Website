// ═══════════════════════════════════════════════════════
// FinMatrix — /about
// ═══════════════════════════════════════════════════════
// What FinMatrix is, who it is for, what it is not, and the plain business
// facts, in the same words as the homepage and the metadata (siteMeta.ts).
//
// No team photos, headcount, founding story, customer logos or awards: none of
// them has been given, and an About page is the first place a reviewer checks
// for invented ones.

import {
  BarChart3,
  BookOpen,
  ClipboardList,
  FileText,
  Package,
  ShieldCheck,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { BUSINESS } from '@/features/site/siteMeta';
import { PublicLayout } from '@/features/site/PublicLayout';

const MODULES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Package,
    title: 'Inventory',
    body: 'Items, stock on hand, weighted-average cost, adjustments and stock valuation.',
  },
  {
    icon: FileText,
    title: 'Sales',
    body: 'Quotes, sales orders, invoices, payments received, credit notes and receivables.',
  },
  {
    icon: ClipboardList,
    title: 'Purchases',
    body: 'Purchase orders, goods received, supplier bills and payables.',
  },
  {
    icon: BookOpen,
    title: 'Accounting and ledger',
    body: 'Double-entry general ledger, chart of accounts, journals, bank reconciliation and period close.',
  },
  {
    icon: Truck,
    title: 'Deliveries',
    body: 'Loads assigned to delivery staff on the Android app, with returns approved before stock changes.',
  },
  {
    icon: Users,
    title: 'Customers and vendors',
    body: 'Customer and supplier records with their own IDs, balances, statements and ledgers.',
  },
  {
    icon: BarChart3,
    title: 'Reports',
    body: 'Profit & loss, balance sheet, trial balance, cash flow, ageing, inventory valuation, analytics and a dashboard.',
  },
  {
    icon: ShieldCheck,
    title: 'Roles and approvals',
    body: 'Owners, team members and delivery riders each see only what their role allows; staff work can wait for approval.',
  },
];

const FACTS: [string, string][] = [
  ['Business name', BUSINESS.name],
  ['Business type', BUSINESS.type],
  ['Industry', BUSINESS.industry],
  ['Business model', BUSINESS.model],
  ['Country', BUSINESS.country],
  ['Website', BUSINESS.website],
  ['Platforms', 'Web console and Android app'],
];

export default function AboutPage() {
  return (
    <PublicLayout>
      {/* Lead */}
      <section className="border-b border-border-light bg-surface">
        <div className="mx-auto max-w-[1080px] px-xl py-xxxl lg:py-section">
          <p className="text-overline text-primary">About FinMatrix</p>
          <h1 className="mt-sm max-w-[760px] text-balance text-h1 text-text-primary">
            ERP software for running a business from one system
          </h1>
          <p className="mt-lg max-w-[720px] text-pretty text-body-lg text-text-secondary">
            FinMatrix is enterprise resource planning (ERP) software, provided online as a service. It brings a
            company&apos;s inventory, sales, purchases, accounting, deliveries and business reporting into one
            integrated system, so the stock in the warehouse and the figures in the books come from the same records.
          </p>
        </div>
      </section>

      <div className="mx-auto flex max-w-[1080px] flex-col gap-xxxl px-xl py-xxxl lg:py-section">
        {/* What it does */}
        <section aria-labelledby="about-does">
          <h2 id="about-does" className="text-h2 text-text-primary">
            What FinMatrix does
          </h2>
          <ul className="mt-xl grid gap-md sm:grid-cols-2 lg:grid-cols-4">
            {MODULES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl border border-border-light bg-surface p-lg shadow-card">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 ring-1 ring-inset ring-primary-200">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </span>
                <h3 className="mt-md text-h4 text-text-primary">{title}</h3>
                <p className="mt-xs text-body-sm text-text-secondary">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Who it is for + what it is not */}
        <div className="grid gap-xl lg:grid-cols-2">
          <section aria-labelledby="about-for" className="flex flex-col gap-sm">
            <h2 id="about-for" className="text-h2 text-text-primary">
              Who it is for
            </h2>
            <p className="text-body-md text-text-secondary">
              Businesses that buy, stock, sell and deliver physical goods, such as distributors, wholesalers, traders
              and warehouses, and the accountants who work with them. The owner sets the company up and creates
              sign-ins for the team; delivery staff use the Android app.
            </p>
            <p className="text-body-md text-text-secondary">
              FinMatrix is currently in a testing phase with a small number of businesses. Every feature is free during
              this phase, and each new company is reviewed by a person before its account is switched on.
            </p>
          </section>

          <section
            aria-labelledby="about-not"
            className="flex flex-col gap-sm rounded-xl border border-primary-100 bg-primary-50 p-xl"
          >
            <h2 id="about-not" className="text-h2 text-text-primary">
              What FinMatrix is not
            </h2>
            <p className="text-body-md text-text-secondary">{BUSINESS.notAFinancialService}</p>
            <p className="text-body-md text-text-secondary">
              Payments a business records in FinMatrix are made outside it, in cash, by bank transfer or however that
              business is paid. FinMatrix does not give accounting, tax or legal advice.
            </p>
          </section>
        </div>

        {/* Facts */}
        <section aria-labelledby="about-facts">
          <h2 id="about-facts" className="text-h2 text-text-primary">
            Business facts
          </h2>
          <dl className="mt-lg divide-y divide-border-light overflow-hidden rounded-xl border border-border-light bg-surface">
            {FACTS.map(([label, value]) => (
              <div key={label} className="grid gap-xxs px-lg py-md sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-lg">
                <dt className="text-label-md text-text-tertiary">{label}</dt>
                <dd className="break-words text-body-md text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* WhatsApp */}
        <section aria-labelledby="about-whatsapp" className="flex flex-col gap-sm">
          <h2 id="about-whatsapp" className="text-h2 text-text-primary">
            WhatsApp
          </h2>
          <p className="text-body-md text-text-secondary">
            Businesses already share invoices and other documents from FinMatrix through their own WhatsApp. FinMatrix
            is also setting up its own WhatsApp Business number to send those documents on a business&apos;s behalf;
            that is not yet available. When it is, it will carry only transactional messages, such as invoices,
            receipts, statements and payment reminders, to people who agreed to receive them, and anyone can reply STOP
            to opt out.{' '}
            <Link className="text-primary underline" to="/acceptable-use-policy#whatsapp">
              Read the WhatsApp messaging policy
            </Link>
            .
          </p>
        </section>

        {/* Contact */}
        <section className="flex flex-col items-start gap-md rounded-xl border border-border-light bg-surface p-xl shadow-card sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-h3 text-text-primary">Talk to us</h2>
            <p className="mt-xs text-body-md text-text-secondary">
              Questions about FinMatrix, your account or your data.
            </p>
          </div>
          <div className="flex flex-wrap gap-sm">
            <Button asChild>
              <Link to="/contact">Contact FinMatrix</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/get-started">Sign in</Link>
            </Button>
          </div>
        </section>
      </div>
    </PublicLayout>
  );
}
