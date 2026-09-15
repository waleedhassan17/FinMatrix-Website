// ═══════════════════════════════════════════════════════
// FinMatrix Web — Subscription plans
// ═══════════════════════════════════════════════════════
// One Plan type, two server shapes.
//
//   GET /super-admin/plans/public   — 200 with NO token. The landing page's
//     only possible source, and the richer of the two: it carries id, name,
//     description, features[], maxUsers and the money labels.
//   GET /billing/plans              — 401 without a token. Company-scoped, and
//     leaner: `key`/`label` instead of `id`/`name`, and no features at all.
//
// Everything below folds both into `Plan` so <PlanCard> never learns which
// endpoint it is looking at, and so the landing, onboarding and renew screens
// cannot drift apart.
//
// WHY THE MONEY LABELS ARE PASSED THROUGH RATHER THAN FORMATTED
// Both shapes send every figure twice: an integer in minor units and a string
// the server already rendered ("Rs 3,000"). We print the string. Running the
// minor units back through formatMoney would emit "Rs 3,000.00" — two decimals
// the server deliberately dropped for prices — and the mobile app prints the
// labels verbatim. A price that reads differently on web than on the phone is
// the exact drift VERIFY.md treats as a bug. The minor units are for ARITHMETIC
// only: sorting, and computing the longer-term saving.

import { formatMoney } from '@/utils/money';

/** Normalised plan. `id` is also the `?plan=` key for bank-details and submit. */
export interface Plan {
  id: string;
  /** Display name with the term suffix removed — "Warehouse Starter". */
  name: string;
  tagline: string | null;
  /** Billing term. Live catalogue ships 6 and 12. */
  periodMonths: number;
  currency: string;
  monthlyMinorUnits: number;
  totalMinorUnits: number;
  /** Server-rendered. Print this, do not re-format it. */
  monthlyLabel: string;
  totalLabel: string;
  features: string[];
  maxUsers: number | null;
  deliveryPersonnelLimit: number;
  sortOrder: number;
}

/**
 * One product tier across all of its billing terms.
 *
 * The live catalogue is three tiers × two terms = six plans. Rendering six
 * cards would show each tier twice under near-identical names, so the grid
 * renders one card per tier and a term toggle chooses which price it shows.
 */
export interface PlanTier {
  /**
   * The tier's identity. `deliveryPersonnelLimit` is the ONLY field that
   * differs between tiers — features[] and maxUsers are byte-identical across
   * all six live plans — so it is what separates them.
   */
  rung: number;
  name: string;
  /** One per term, ascending by periodMonths. */
  plans: Plan[];
  highlighted: boolean;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/**
 * Strip the billing term from the server's plan name.
 *
 * The catalogue names plans "Warehouse Starter — 6 months". The term is chosen
 * by the toggle, so repeating it in the card title is noise. Split on the
 * em-dash the server uses; anything unexpected falls through as-is rather than
 * being mangled — a wrong-looking title beats a truncated one.
 */
const stripTerm = (name: string): string => {
  const [head] = name.split('—');
  const trimmed = head.trim();
  return trimmed.length > 0 ? trimmed : name.trim();
};

/**
 * Fold either server shape into a Plan.
 *
 * Tolerant by design: `/super-admin/plans/public` and `/billing/plans` disagree
 * on almost every key name, and the app's PlanKey union is already stale
 * against the live catalogue (it predates the Starter/Growth/Scale rungs). Plan
 * ids are opaque strings here and are never switched on.
 */
export const planSerializer = (raw: unknown): Plan => {
  const r = (raw ?? {}) as Raw;

  // `key`/`label` is the authed /billing/plans shape; `id`/`name` the public one.
  const id = str(r.id) || str(r.key);
  const rawName = str(r.name) || str(r.label) || id;
  const periodMonths = num(r.durationMonths) || num(r.periodMonths);

  const monthlyMinorUnits = num(r.monthlyMinorUnits);
  const totalMinorUnits = num(r.totalMinorUnits);

  // priceMonthly arrives as a string of whole rupees on the public endpoint.
  // Only used when the server sent no label at all.
  const monthlyFallback =
    monthlyMinorUnits > 0 ? monthlyMinorUnits / 100 : num(r.priceMonthly);

  return {
    id,
    name: stripTerm(rawName),
    tagline: str(r.description) || null,
    periodMonths,
    currency: str(r.currency) || 'PKR',
    monthlyMinorUnits,
    totalMinorUnits,
    monthlyLabel: str(r.monthlyLabel) || formatMoney(monthlyFallback),
    totalLabel:
      str(r.totalLabel) ||
      (totalMinorUnits > 0 ? formatMoney(totalMinorUnits / 100) : ''),
    features: resolvePlanFeatures(
      Array.isArray(r.features) ? r.features.filter(isNonEmpty) : [],
    ),
    maxUsers: typeof r.maxUsers === 'number' ? r.maxUsers : null,
    deliveryPersonnelLimit: num(r.deliveryPersonnelLimit),
    sortOrder: num(r.sortOrder),
  };
};

const isNonEmpty = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const ACCOUNTING_FEATURE = 'Complete accounting: invoices, bills, payments, tax & reports';
const PEOPLE_FEATURE = 'Payroll, budgets, bank reconciliation & team roles';

/** What an inherited tier stood for, in the words the server now uses. */
const INHERITED_FEATURES: Record<string, string[]> = {
  'small business': [ACCOUNTING_FEATURE],
  'large organization': [ACCOUNTING_FEATURE, PEOPLE_FEATURE],
};

/**
 * A plan's feature list with no line pointing at another plan.
 *
 * The server once listed "Everything in Large Organization" on every warehouse
 * plan — a tier no longer sold or shown — so a buyer was told a plan includes
 * something they could not see. A line like that is replaced with what the
 * tier actually included, or dropped when the tier is unknown. The current
 * server copy has no such line and passes through unchanged.
 */
export const resolvePlanFeatures = (features: string[]): string[] => {
  const out: string[] = [];
  for (const feature of features) {
    const inherited = /^everything in (.+?)\.?$/i.exec(feature.trim());
    const lines = inherited ? (INHERITED_FEATURES[inherited[1].trim().toLowerCase()] ?? []) : [feature];
    for (const line of lines) if (!out.includes(line)) out.push(line);
  }
  return out;
};

export const planListSerializer = (raw: unknown): Plan[] => {
  // /billing/plans answers { companyType, plans: [...] }; the public endpoint
  // answers a bare array once the envelope is off.
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as Raw | null)?.plans)
      ? ((raw as Raw).plans as unknown[])
      : [];

  return list.map(planSerializer).filter((p) => p.id.length > 0);
};

/** Every distinct billing term in the catalogue, ascending. */
export const planTerms = (plans: readonly Plan[]): number[] =>
  [...new Set(plans.map((p) => p.periodMonths))]
    .filter((m) => m > 0)
    .sort((a, b) => a - b);

/**
 * How much cheaper `longer` is per month than `base`, as a whole percent.
 *
 * Computed, never typed: the live catalogue happens to price every 12-month
 * term exactly 25% below its 6-month one, and hardcoding that would quietly
 * lie the day the price list changes. Returns null when there is no saving.
 */
export const savingsPercent = (base: Plan, longer: Plan): number | null => {
  if (base.monthlyMinorUnits <= 0 || longer.monthlyMinorUnits <= 0) return null;
  if (longer.monthlyMinorUnits >= base.monthlyMinorUnits) return null;

  const saved =
    ((base.monthlyMinorUnits - longer.monthlyMinorUnits) /
      base.monthlyMinorUnits) *
    100;
  return Math.round(saved);
};

/**
 * Group the flat plan list into one entry per tier.
 *
 * Highlighting: no server field marks a popular plan, so the middle rung is
 * chosen when there are three or more tiers — the conventional "most people
 * want this" position, and here also genuinely the middle of the price range.
 * With fewer than three, nothing is highlighted rather than something arbitrary.
 */
export const groupPlansByTier = (plans: readonly Plan[]): PlanTier[] => {
  const byRung = new Map<number, Plan[]>();
  for (const plan of plans) {
    const list = byRung.get(plan.deliveryPersonnelLimit) ?? [];
    list.push(plan);
    byRung.set(plan.deliveryPersonnelLimit, list);
  }

  const tiers = [...byRung.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rung, list]) => {
      const sorted = [...list].sort((a, b) => a.periodMonths - b.periodMonths);
      return {
        rung,
        name: sorted[0]?.name ?? '',
        plans: sorted,
        highlighted: false,
      };
    });

  if (tiers.length >= 3) {
    const middle = Math.floor(tiers.length / 2);
    tiers[middle].highlighted = true;
  }

  return tiers;
};

/** The plan for a given term, falling back to the tier's cheapest listing. */
export const planForTerm = (tier: PlanTier, months: number): Plan | null =>
  tier.plans.find((p) => p.periodMonths === months) ?? tier.plans[0] ?? null;

/** "6 months" reads as a count; "1 year" reads as a plan. */
export const formatTerm = (months: number): string => {
  if (months <= 0) return '';
  if (months === 12) return '1 year';
  if (months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
};

/**
 * The bullet list on a plan card.
 *
 * The server sends the SAME four features for every plan in the live
 * catalogue, so printing them alone would render three identical cards and
 * hide the only thing a buyer is actually choosing between: how many delivery
 * riders the plan allows. That row is prepended from the plan's own number —
 * derived from the response, not invented — so each card states it first.
 *
 * No seat count. Access in FinMatrix is by role — the owner, staff and delivery
 * personnel — and the server's `maxUsers` is the same on every plan, so "Up to
 * 25 team members" described nothing a buyer chooses between.
 */
export const planPerks = (plan: Plan): string[] => {
  const perks: string[] = [];

  if (plan.deliveryPersonnelLimit > 0) {
    perks.push(`Up to ${plan.deliveryPersonnelLimit} delivery riders`);
  }

  return [...perks, ...plan.features];
};
