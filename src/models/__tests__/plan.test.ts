import { describe, expect, it } from 'vitest';

import {
  formatTerm,
  groupPlansByTier,
  planForTerm,
  planListSerializer,
  planPerks,
  planSerializer,
  planTerms,
  resolvePlanFeatures,
  savingsPercent,
} from '@/models/plan';

/**
 * PUBLIC_PLANS is the real body of GET /super-admin/plans/public, captured
 * verbatim. It is the only plan source the landing page can read (the authed
 * /billing/plans answers 401 without a token), so the shape that endpoint
 * actually sends is what these assertions pin — not a shape we wished for.
 *
 * The `features` array and `maxUsers` are IDENTICAL across all six live plans.
 * That is not a copy-paste slip in the fixture; it is why planPerks exists.
 */
const FEATURES = [
  'Everything in Large Organization',
  'Full inventory + purchase orders (GRNI 3-way match)',
  'Deliveries with rider app & admin approval',
  'Goods-in-Transit accounting built in',
];

/**
 * What a card shows for that capture. "Large Organization" is not on sale, so a
 * line naming it becomes what it included — a card never points at a plan the
 * reader cannot see.
 */
const RESOLVED_FEATURES = [
  'Complete accounting: invoices, bills, payments, tax & reports',
  'Payroll, budgets, bank reconciliation & team roles',
  'Full inventory + purchase orders (GRNI 3-way match)',
  'Deliveries with rider app & admin approval',
  'Goods-in-Transit accounting built in',
];

/** The server's copy since it stopped naming another tier. */
const CURRENT_FEATURES = [
  'Complete accounting: invoices, bills, payments, tax & reports',
  'Payroll, budgets, bank reconciliation & team roles',
  'Full inventory + purchase orders (GRNI 3-way match)',
  'Deliveries with rider app, admin approval & Goods-in-Transit accounting',
];

const plan = (
  id: string,
  name: string,
  durationMonths: number,
  monthlyMinorUnits: number,
  totalMinorUnits: number,
  monthlyLabel: string,
  totalLabel: string,
  deliveryPersonnelLimit: number,
  sortOrder: number,
) => ({
  id,
  name,
  description: `Warehouse · ${durationMonths} months, billed once`,
  priceMonthly: String(monthlyMinorUnits / 100),
  priceYearly: String(totalMinorUnits / 100),
  maxUsers: 25,
  maxInvoices: null,
  features: FEATURES,
  isActive: true,
  sortOrder,
  companyType: 'warehouse',
  durationMonths,
  monthlyMinorUnits,
  totalMinorUnits,
  monthlyLabel,
  totalLabel,
  currency: 'PKR',
  deliveryPersonnelLimit,
});

const PUBLIC_PLANS = [
  plan('warehouse_starter_6mo', 'Warehouse Starter — 6 months', 6, 300000, 1800000, 'Rs 3,000', 'Rs 18,000', 3, 0),
  plan('warehouse_starter_1yr', 'Warehouse Starter — 1 year', 12, 225000, 2700000, 'Rs 2,250', 'Rs 27,000', 3, 1),
  plan('warehouse_growth_6mo', 'Warehouse Growth — 6 months', 6, 400000, 2400000, 'Rs 4,000', 'Rs 24,000', 5, 2),
  plan('warehouse_growth_1yr', 'Warehouse Growth — 1 year', 12, 300000, 3600000, 'Rs 3,000', 'Rs 36,000', 5, 3),
  plan('warehouse_scale_6mo', 'Warehouse Scale — 6 months', 6, 600000, 3600000, 'Rs 6,000', 'Rs 36,000', 10, 4),
  plan('warehouse_scale_1yr', 'Warehouse Scale — 1 year', 12, 450000, 5400000, 'Rs 4,500', 'Rs 54,000', 10, 5),
];

/**
 * The authed GET /billing/plans shape, from the app's TierPlanCard. Different
 * key names for the same facts, and no features at all — the reason the
 * serializer reads both `id`/`key` and `name`/`label`.
 */
const TIER_PLAN = {
  key: 'warehouse_growth_6mo',
  label: 'Warehouse Growth — 6 months',
  durationMonths: 6,
  monthlyMinorUnits: 400000,
  monthlyLabel: 'Rs 4,000',
  totalMinorUnits: 2400000,
  totalLabel: 'Rs 24,000',
  currency: 'PKR',
  deliveryPersonnelLimit: 5,
  monthlySavingsMinorUnits: 0,
  monthlySavingsLabel: null,
};

describe('planSerializer', () => {
  it('normalises the public shape', () => {
    const p = planSerializer(PUBLIC_PLANS[0]);

    expect(p.id).toBe('warehouse_starter_6mo');
    expect(p.periodMonths).toBe(6);
    expect(p.currency).toBe('PKR');
    expect(p.monthlyMinorUnits).toBe(300000);
    expect(p.totalMinorUnits).toBe(1800000);
    expect(p.maxUsers).toBe(25);
    expect(p.deliveryPersonnelLimit).toBe(3);
    expect(p.features).toEqual(RESOLVED_FEATURES);
    expect(p.tagline).toBe('Warehouse · 6 months, billed once');
  });

  it('folds the authed /billing/plans shape onto the same type', () => {
    const p = planSerializer(TIER_PLAN);

    // key -> id, label -> name: the two endpoints disagree on every name.
    expect(p.id).toBe('warehouse_growth_6mo');
    expect(p.name).toBe('Warehouse Growth');
    expect(p.periodMonths).toBe(6);
    expect(p.monthlyLabel).toBe('Rs 4,000');
    expect(p.deliveryPersonnelLimit).toBe(5);
    // That shape carries no features, and must not crash for want of them.
    expect(p.features).toEqual([]);
    expect(p.maxUsers).toBeNull();
  });

  it('prints the server money labels verbatim', () => {
    // The whole point: formatMoney would render "Rs 3,000.00" and the phone
    // shows "Rs 3,000". A price may not read differently on the two clients.
    const p = planSerializer(PUBLIC_PLANS[0]);
    expect(p.monthlyLabel).toBe('Rs 3,000');
    expect(p.totalLabel).toBe('Rs 18,000');
    expect(p.monthlyLabel).not.toContain('.00');
  });

  it('falls back to formatMoney only when the server sent no label', () => {
    const p = planSerializer({
      id: 'legacy_plan',
      name: 'Legacy',
      priceMonthly: '1500',
      durationMonths: 6,
    });
    expect(p.monthlyLabel).toBe('Rs 1,500.00');
  });

  it('strips the billing term from the display name', () => {
    // The term is chosen by the toggle; repeating it in the title is noise.
    expect(planSerializer(PUBLIC_PLANS[0]).name).toBe('Warehouse Starter');
    expect(planSerializer(PUBLIC_PLANS[5]).name).toBe('Warehouse Scale');
  });

  it('leaves a name with no term suffix alone', () => {
    expect(planSerializer({ id: 'x', name: 'Starter' }).name).toBe('Starter');
  });

  it('survives junk without throwing', () => {
    const p = planSerializer({});
    expect(p.id).toBe('');
    expect(p.periodMonths).toBe(0);
    expect(p.features).toEqual([]);
  });
});

describe('planListSerializer', () => {
  it('reads a bare array (public endpoint)', () => {
    expect(planListSerializer(PUBLIC_PLANS)).toHaveLength(6);
  });

  it('reads { companyType, plans } (authed endpoint)', () => {
    const list = planListSerializer({
      companyType: 'warehouse',
      plans: [TIER_PLAN],
    });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('warehouse_growth_6mo');
  });

  it('drops entries with no usable id rather than rendering a dead card', () => {
    expect(planListSerializer([{ name: 'Nameless' }, PUBLIC_PLANS[0]])).toHaveLength(1);
  });

  it('returns an empty list for a shape it does not recognise', () => {
    expect(planListSerializer(null)).toEqual([]);
    expect(planListSerializer({ oops: true })).toEqual([]);
  });
});

describe('planTerms', () => {
  it('finds the live catalogue terms, ascending', () => {
    expect(planTerms(planListSerializer(PUBLIC_PLANS))).toEqual([6, 12]);
  });

  it('ignores a zero term', () => {
    expect(planTerms(planListSerializer([{ id: 'a' }, PUBLIC_PLANS[0]]))).toEqual([6]);
  });
});

describe('groupPlansByTier', () => {
  const tiers = groupPlansByTier(planListSerializer(PUBLIC_PLANS));

  it('collapses six plans into three tiers', () => {
    // Six cards would show each tier twice under near-identical names.
    expect(tiers).toHaveLength(3);
    expect(tiers.map((t) => t.rung)).toEqual([3, 5, 10]);
    expect(tiers.map((t) => t.name)).toEqual([
      'Warehouse Starter',
      'Warehouse Growth',
      'Warehouse Scale',
    ]);
  });

  it('keeps both terms inside each tier, ascending', () => {
    for (const tier of tiers) {
      expect(tier.plans.map((p) => p.periodMonths)).toEqual([6, 12]);
    }
  });

  it('highlights the middle tier', () => {
    expect(tiers.map((t) => t.highlighted)).toEqual([false, true, false]);
  });

  it('highlights nothing when there are fewer than three tiers', () => {
    const two = groupPlansByTier(planListSerializer(PUBLIC_PLANS.slice(0, 4)));
    expect(two).toHaveLength(2);
    expect(two.some((t) => t.highlighted)).toBe(false);
  });
});

describe('savingsPercent', () => {
  const tiers = groupPlansByTier(planListSerializer(PUBLIC_PLANS));

  it('computes 25% for every live tier rather than hardcoding it', () => {
    for (const tier of tiers) {
      const [sixMonth, oneYear] = tier.plans;
      expect(savingsPercent(sixMonth, oneYear)).toBe(25);
    }
  });

  it('returns null when the longer term is not cheaper', () => {
    const [sixMonth, oneYear] = tiers[0].plans;
    expect(savingsPercent(oneYear, sixMonth)).toBeNull();
    expect(savingsPercent(sixMonth, sixMonth)).toBeNull();
  });

  it('returns null when a price is missing', () => {
    const free = planSerializer({ id: 'free', durationMonths: 6 });
    expect(savingsPercent(free, tiers[0].plans[1])).toBeNull();
  });
});

describe('planForTerm', () => {
  const tier = groupPlansByTier(planListSerializer(PUBLIC_PLANS))[1];

  it('picks the plan for the chosen term', () => {
    expect(planForTerm(tier, 12)?.id).toBe('warehouse_growth_1yr');
    expect(planForTerm(tier, 6)?.id).toBe('warehouse_growth_6mo');
  });

  it('falls back to the first listing for a term this tier does not sell', () => {
    expect(planForTerm(tier, 3)?.id).toBe('warehouse_growth_6mo');
  });
});

describe('formatTerm', () => {
  it.each([
    [6, '6 months'],
    [12, '1 year'],
    [24, '2 years'],
    [0, ''],
  ])('renders %i as %s', (months, expected) => {
    expect(formatTerm(months)).toBe(expected);
  });
});

describe('planPerks', () => {
  it('leads with the limits, which are the only real difference', () => {
    const starter = planSerializer(PUBLIC_PLANS[0]);
    const scale = planSerializer(PUBLIC_PLANS[4]);

    expect(planPerks(starter)[0]).toBe('Up to 3 delivery riders');
    expect(planPerks(scale)[0]).toBe('Up to 10 delivery riders');
    // Without the derived rows the three cards would be byte-identical.
    expect(starter.features).toEqual(scale.features);
  });

  it('follows the rider limit with the features, and never a seat count', () => {
    // Access is by role — owner, staff, delivery personnel — and maxUsers is
    // the same on every plan, so a "team members" row would say nothing.
    for (const p of PUBLIC_PLANS) {
      expect(planPerks(planSerializer(p)).some((perk) => /team member|users?\b/i.test(perk))).toBe(false);
    }
    expect(planPerks(planSerializer(PUBLIC_PLANS[0]))).toEqual([
      'Up to 3 delivery riders',
      ...RESOLVED_FEATURES,
    ]);
  });

  it('omits a limit the plan does not state', () => {
    const perks = planPerks(planSerializer(TIER_PLAN));
    expect(perks).toEqual(['Up to 5 delivery riders']);
  });
});

describe('resolvePlanFeatures', () => {
  it('never shows a line naming a plan the reader cannot see', () => {
    for (const p of PUBLIC_PLANS) {
      expect(planPerks(planSerializer(p)).some((f) => /everything in/i.test(f))).toBe(false);
    }
  });

  it('passes the current server copy through unchanged', () => {
    expect(resolvePlanFeatures(CURRENT_FEATURES)).toEqual(CURRENT_FEATURES);
    expect(planSerializer({ ...PUBLIC_PLANS[2], features: CURRENT_FEATURES }).features).toEqual(CURRENT_FEATURES);
  });

  it('spells out Small Business, drops an unknown tier, and keeps each line once', () => {
    expect(
      resolvePlanFeatures([
        'everything in small business.',
        'Everything in Standard',
        'Complete accounting: invoices, bills, payments, tax & reports',
        'Payroll, employees & payslips',
      ]),
    ).toEqual(['Complete accounting: invoices, bills, payments, tax & reports', 'Payroll, employees & payslips']);
  });
});
