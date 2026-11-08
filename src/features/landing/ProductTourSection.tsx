// ═══════════════════════════════════════════════════════
// FinMatrix Web — Product tour (pages of the platform, as a card deck)
// ═══════════════════════════════════════════════════════
// Pages of the actual product, grouped by business area, shown one at a time
// on the front of a stacked card deck inside a dark panel: category chips above
// it, previous / next and dots under it. One page in view keeps the section
// calm; the stack behind it says there are more.
//
// WORDING: "product tour" and "pages", never "screens" — this is a product
// website, and the visitor is being shown the platform, not a gallery.
//
// THE DATA IN THEM IS FICTIONAL. They were captured from a throwaway local
// database seeded with the backend's demo company ("Ali Traders",
// src/database/seeds/demo-data.seed.ts), a few months of sample documents made
// through the API, and contact details on the reserved example.com domain.
// Never recapture these from a real company's account.
//
// ── MOVING BETWEEN PAGES MUST NEVER BLINK ──
// The first version rebuilt the card on every step (a `key` on the figure) and
// faded the new one in from opacity 0, around a screenshot that had not been
// fetched yet. Visitors saw the card vanish, come back empty, then the picture
// pop in. So, three rules:
//   1. The card frame stays mounted. Only its text changes, in place.
//   2. Every screenshot stays mounted, stacked in one box. All six are fetched
//      (lazily, as the section nears the viewport) and stay decoded, so changing
//      page or category never creates an image.
//   3. The incoming screenshot fades in OVER the outgoing one, which stays fully
//      opaque underneath until the fade is over, and the swap waits until the
//      incoming one has decoded. No frame shows an empty box or the panel behind.
// Do not bring back a `key` on the figure or an entrance from opacity 0.

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { Reveal } from '@/components/motion/Reveal';
import { SectionIntro } from '@/features/landing/SectionIntro';
import { cn } from '@/lib/cn';

type CategoryKey = 'overview' | 'sales' | 'purchases' | 'inventory' | 'reports';
type Filter = CategoryKey | 'all';

const CATEGORIES: { key: CategoryKey; label: string; dot: string }[] = [
  { key: 'overview', label: 'Overview', dot: 'bg-primary-300' },
  { key: 'sales', label: 'Sales', dot: 'bg-accent-teal' },
  { key: 'purchases', label: 'Purchases', dot: 'bg-warning' },
  { key: 'inventory', label: 'Inventory', dot: 'bg-success-bright' },
  { key: 'reports', label: 'Reports', dot: 'bg-info' },
];

interface TourPage {
  key: string;
  category: CategoryKey;
  title: string;
  src: string;
  alt: string;
  caption: string;
}

const PAGES: TourPage[] = [
  {
    key: 'dashboard',
    category: 'overview',
    title: 'Dashboard',
    src: '/screenshots/dashboard.webp',
    alt: 'The FinMatrix dashboard for a sample company, with this month’s revenue, expenses, receivables and payables',
    caption: 'The day at a glance: this month’s revenue and expenses, what customers owe and what you owe suppliers.',
  },
  {
    key: 'invoices',
    category: 'sales',
    title: 'Invoices',
    src: '/screenshots/invoices.webp',
    alt: 'The FinMatrix invoice list for a sample company, with each invoice’s customer, dates, total, balance and status',
    caption: 'Every sales invoice with its balance and status: sent, part-paid, paid or overdue.',
  },
  {
    key: 'customers',
    category: 'sales',
    title: 'Customers',
    src: '/screenshots/customers.webp',
    alt: 'The FinMatrix customer list for a sample company, with customer IDs, contacts, payment terms and balances',
    caption: 'Customers with their own IDs, contact details, terms and the balance each one owes.',
  },
  {
    key: 'bills',
    category: 'purchases',
    title: 'Bills',
    src: '/screenshots/bills.webp',
    alt: 'The FinMatrix supplier bill list for a sample company, with amounts owing and paid, open and overdue bills',
    caption: 'Supplier bills and what is still owing, with the overdue ones flagged.',
  },
  {
    key: 'inventory-valuation',
    category: 'inventory',
    title: 'Inventory valuation',
    src: '/screenshots/inventory-valuation.webp',
    alt: 'The FinMatrix inventory valuation report for a sample company, with stock value by category and a donut chart',
    caption: 'Stock at today’s cost by category, checked against the ledger, with how each item sold.',
  },
  {
    key: 'analytics',
    category: 'reports',
    title: 'Analytics',
    src: '/screenshots/analytics.webp',
    alt: 'The FinMatrix analytics page for a sample company, with revenue and profit by month, operating expenses and cash',
    caption: 'Revenue and profit by month, where the money went, cash, and the customers who buy most.',
  },
];

const categoryOf = (key: CategoryKey) => CATEGORIES.find((c) => c.key === key)!;

/** Every screenshot is captured at this size (1440 × 900 viewport). */
const WIDTH = 1440;
const HEIGHT = 900;

const sticker =
  'pointer-events-none absolute z-20 rounded-md bg-surface px-sm py-xxs text-overline text-primary-900 shadow-md';

/** The screenshot dissolve. The outgoing image's hide is delayed by the same
 *  duration, so it stays opaque under the incoming one for the whole fade. */
const SHOWN =
  'z-10 opacity-100 transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,0.8,0.28,1)] motion-reduce:transition-none';
const HIDDEN = 'z-0 opacity-0 transition-opacity duration-0 delay-[400ms] motion-reduce:transition-none';

export function ProductTourSection() {
  const [filter, setFilter] = useState<Filter>('all');
  const [index, setIndex] = useState(0);
  const swipeFrom = useRef<number | null>(null);

  const pages = filter === 'all' ? PAGES : PAGES.filter((p) => p.category === filter);
  const current = pages[Math.min(index, pages.length - 1)];
  const category = categoryOf(current.category);
  const many = pages.length > 1;

  // Screenshots that have loaded and decoded (or failed, so a broken file can
  // never hold the deck). The text follows `current` at once; the screenshot
  // keeps the last ready page until the new one is ready, then dissolves to it.
  const [ready, setReady] = useState<ReadonlySet<string>>(() => new Set());
  const [shownKey, setShownKey] = useState(PAGES[0].key);
  const targetKey = ready.has(current.key) || !ready.has(shownKey) ? current.key : shownKey;
  if (targetKey !== shownKey) setShownKey(targetKey);

  const markReady = (key: string, img: HTMLImageElement) => {
    const decoded = typeof img.decode === 'function' ? img.decode() : Promise.resolve();
    void decoded
      .catch(() => undefined)
      .then(() => setReady((prev) => (prev.has(key) ? prev : new Set(prev).add(key))));
  };

  const go = (step: number) => setIndex((i) => (i + step + pages.length) % pages.length);
  const choose = (next: Filter) => {
    setFilter(next);
    setIndex(0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!many) return;
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onPointerDown = (e: PointerEvent) => {
    swipeFrom.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipeFrom.current === null || !many) return;
    const dx = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  };

  const count = (key: Filter) => (key === 'all' ? PAGES.length : PAGES.filter((s) => s.category === key).length);

  return (
    <section
      id="product-tour"
      aria-labelledby="tour-heading"
      className="scroll-mt-20 bg-background py-section lg:py-section-lg"
    >
      <div className="mx-auto max-w-[1280px] px-xl">
        <SectionIntro
          id="tour-heading"
          overline="Product tour"
          title="Explore the FinMatrix platform"
          body="A guided look at the FinMatrix web console, organised by business area and shown with sample company data."
        />

        {/* Categories */}
        <Reveal>
          <div role="group" aria-label="Filter by business area" className="mt-xxl flex flex-wrap gap-xs">
            {([{ key: 'all', label: 'All', dot: '' }, ...CATEGORIES] as { key: Filter; label: string; dot: string }[]).map(
              (c) => {
                const active = filter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(c.key)}
                    className={cn(
                      'inline-flex items-center gap-xs rounded-full border px-md py-xs text-label-sm uppercase tracking-wide transition-colors',
                      active
                        ? 'border-primary-900 bg-primary-900 text-text-inverse'
                        : 'border-border bg-surface text-text-secondary hover:border-primary-200 hover:text-primary',
                    )}
                  >
                    {c.dot && <span aria-hidden="true" className={cn('size-2 rounded-full', c.dot)} />}
                    {c.label}
                    <span className={cn('tabular', active ? 'text-white/60' : 'text-text-tertiary')}>{count(c.key)}</span>
                  </button>
                );
              },
            )}
          </div>
        </Reveal>

        {/* The deck */}
        <Reveal className="mt-lg">
          <div
            role="group"
            aria-roledescription="carousel"
            aria-label="FinMatrix product tour"
            onKeyDown={onKeyDown}
            className="relative isolate overflow-hidden rounded-3xl surface-mesh-navy px-md pt-xxxxl pb-xl sm:px-xxl md:pt-xxl lg:px-section lg:pt-xxxl"
          >
            {/* Texture, as the ground the cards sit on. Decoration only.
                (Oversized rotated brand marks were tried here and dropped:
                software-rendered browsers stalled painting them on scroll.) */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial" />

            {/* Stickers */}
            <span aria-hidden="true" className={cn(sticker, 'top-lg right-lg hidden rotate-[8deg] md:block')}>
              #web console
            </span>
            <span aria-hidden="true" className={cn(sticker, 'bottom-xxl left-lg hidden -rotate-[7deg] md:block')}>
              #sample data
            </span>
            <span aria-hidden="true" className={cn(sticker, 'top-md left-md rotate-[-4deg] md:hidden')}>
              #{category.label}
            </span>

            <div className="relative mx-auto max-w-[980px]" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
              {/* The stack behind the front card. */}
              {many && (
                <>
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-xl -top-sm bottom-sm rotate-[2.5deg] rounded-2xl bg-white/15"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-lg top-xs -bottom-xs -rotate-[2deg] rounded-2xl bg-white/25"
                  />
                </>
              )}

              {/* Front card: a slight tilt on wide screens, flat on phones where
                  the screenshot needs every pixel. */}
              <div className="relative md:rotate-[-0.8deg]">
                <figure
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`${pages.indexOf(current) + 1} of ${pages.length}: ${current.title}`}
                  className="rounded-2xl bg-surface p-sm shadow-xl sm:p-md"
                >
                  <div className="flex items-center justify-between gap-md px-xxs pb-sm">
                    <div className="flex min-w-0 items-center gap-sm">
                      <span className="inline-flex shrink-0 items-center gap-xs rounded-full border border-border-light bg-surface-2 px-sm py-xxs text-label-sm uppercase tracking-wide text-text-secondary">
                        <span aria-hidden="true" className={cn('size-2 rounded-full', category.dot)} />
                        {category.label}
                      </span>
                      <h3 className="truncate text-h4 text-text-primary">{current.title}</h3>
                    </div>
                    <span className="shrink-0 text-label-sm tabular text-text-tertiary">
                      {pages.indexOf(current) + 1} / {pages.length}
                    </span>
                  </div>
                  {/* Every page's screenshot, stacked. Only the front page's is in
                      the accessibility tree; the rest are decoration until shown. */}
                  <div className="relative aspect-[1440/900] overflow-hidden rounded-lg border border-border-light bg-surface-2">
                    {PAGES.map((p) => {
                      const shown = p.key === shownKey;
                      const front = p.key === current.key;
                      return (
                        <img
                          key={p.key}
                          ref={(el) => {
                            // Loaded before React attached onLoad (cache, prerendered HTML).
                            if (el?.complete && el.naturalWidth > 0 && !ready.has(p.key)) markReady(p.key, el);
                          }}
                          src={p.src}
                          alt={front ? p.alt : ''}
                          aria-hidden={front ? undefined : true}
                          data-state={shown ? 'shown' : 'hidden'}
                          width={WIDTH}
                          height={HEIGHT}
                          loading="lazy"
                          decoding="async"
                          fetchPriority={shown ? 'auto' : 'low'}
                          draggable={false}
                          onLoad={(e) => markReady(p.key, e.currentTarget)}
                          onError={(e) => markReady(p.key, e.currentTarget)}
                          className={cn('absolute inset-0 size-full select-none', shown ? SHOWN : HIDDEN)}
                        />
                      );
                    })}
                  </div>
                  {/* One grid cell: the caption, plus every caption as an invisible
                      sizer, so the block is always as tall as the longest one and
                      the controls below never move between pages. */}
                  <figcaption className="grid px-xxs pt-sm text-body-sm text-text-secondary">
                    <span aria-live="polite" className="[grid-area:1/1]">
                      {current.caption}
                    </span>
                    {PAGES.map((p) => (
                      <span key={p.key} aria-hidden="true" className="invisible [grid-area:1/1]">
                        {p.caption}
                      </span>
                    ))}
                  </figcaption>
                </figure>
              </div>
            </div>

            {/* Previous · dots · next */}
            {many && (
              <div className="relative mt-xl flex items-center justify-center gap-md">
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Previous page"
                  className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-text-inverse transition-colors hover:bg-white/20"
                >
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <div className="flex items-center gap-xs">
                  {pages.map((s, i) => {
                    const on = s.key === current.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setIndex(i)}
                        aria-label={`Show ${s.title}`}
                        aria-current={on ? 'true' : undefined}
                        className={cn(
                          'h-2 rounded-full transition-[width,background-color] duration-300',
                          on ? 'w-6 bg-success-bright' : 'w-2 bg-white/35 hover:bg-white/60',
                        )}
                      />
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Next page"
                  className="flex size-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-text-inverse transition-colors hover:bg-white/20"
                >
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export default ProductTourSection;
