import {
  BarChart3,
  BookOpen,
  ChevronRight,
  Coins,
  FileText,
  Landmark,
  Package,
  Scale,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { useFeature } from '@/hooks/useCapability';

interface ReportLink {
  title: string;
  description: string;
  path: string;
  icon: ReactNode;
  /** Hidden unless this tier feature is on. */
  feature?: 'inventory';
}

interface ReportCategory {
  title: string;
  icon: ReactNode;
  items: ReportLink[];
}

/**
 * Every report, grouped by the question it answers.
 *
 * Descriptions say what each statement tells you rather than restating its name —
 * "Trial Balance" means nothing to somebody running a warehouse, and a hub whose
 * rows are nine accounting terms is a hub nobody uses twice.
 */
const CATEGORIES: ReportCategory[] = [
  {
    title: 'Financial statements',
    icon: <FileText className="size-4" />,
    items: [
      {
        title: 'Profit & Loss',
        description: 'What you earned and what it cost, over a period.',
        path: '/reports/profit-loss',
        icon: <TrendingUp className="size-4" />,
      },
      {
        title: 'Balance Sheet',
        description: 'What the business owns and owes on a given day.',
        path: '/reports/balance-sheet',
        icon: <Landmark className="size-4" />,
      },
      {
        title: 'Cash Flow',
        description: 'Where the money actually came from and went.',
        path: '/reports/cash-flow',
        icon: <Wallet className="size-4" />,
      },
      {
        title: 'Trial Balance',
        description: 'Every account’s movement, debits against credits.',
        path: '/reports/trial-balance',
        icon: <Scale className="size-4" />,
      },
      {
        title: 'General Ledger',
        description: 'Every posting, in order, with a running balance.',
        path: '/reports/general-ledger',
        icon: <BookOpen className="size-4" />,
      },
    ],
  },
  {
    title: 'Receivables & payables',
    icon: <Coins className="size-4" />,
    items: [
      {
        title: 'AR Aging',
        description: 'Who owes you, and how overdue each amount is.',
        path: '/reports/ar-aging',
        icon: <Users className="size-4" />,
      },
      {
        title: 'AP Aging',
        description: 'Who you owe, and how late you are.',
        path: '/reports/ap-aging',
        icon: <Users className="size-4" />,
      },
    ],
  },
  {
    title: 'Stock & analytics',
    icon: <BarChart3 className="size-4" />,
    items: [
      {
        title: 'Inventory Valuation',
        description: 'Stock on hand at what the books carry it at.',
        path: '/reports/inventory-valuation',
        icon: <Package className="size-4" />,
        feature: 'inventory',
      },
      {
        title: 'Analytics',
        description: 'Revenue and cash trends, top customers, spend.',
        path: '/reports/analytics',
        icon: <BarChart3 className="size-4" />,
      },
    ],
  },
];

export default function ReportsHubPage() {
  // Matches the nav's own gate on inventory-valuation, so the hub and the sidebar
  // never disagree about whether the report exists.
  const inventoryEnabled = useFeature('inventory');

  const visible = CATEGORIES.map((category) => ({
    ...category,
    items: category.items.filter(
      (item) => !item.feature || (item.feature === 'inventory' && inventoryEnabled),
    ),
  })).filter((category) => category.items.length > 0);

  return (
    <div className="flex flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">Reports</h1>
        <p className="text-body-sm text-text-secondary">
          Everything the books add up to. Each report reads from posted entries, so
          the figures match what the ledger holds.
        </p>
      </div>

      {visible.map((category) => (
        <section key={category.title} className="flex flex-col gap-sm">
          <h2 className="flex items-center gap-xs text-overline text-text-secondary">
            {category.icon}
            {category.title}
          </h2>

          <div className="grid gap-md sm:grid-cols-2 lg:grid-cols-3">
            {category.items.map((item) => (
              <Card key={item.path} className="p-0">
                <Link
                  to={item.path}
                  className="flex h-full items-start gap-sm p-lg transition-colors hover:bg-surface-2"
                >
                  <span className="mt-[2px] flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-tint text-primary">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-label-lg text-text-primary">
                      {item.title}
                    </span>
                    <span className="mt-xxs block text-body-sm text-text-secondary">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight className="mt-xxs size-4 shrink-0 text-text-tertiary" />
                </Link>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <p className="text-caption text-text-tertiary">
        Every statement is prepared on an accrual basis from posted journal entries.
        Drafts and voided entries are excluded.
      </p>
    </div>
  );
}
