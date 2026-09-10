// ═══════════════════════════════════════════════════════
// FinMatrix Web — "Built for" strip
// ═══════════════════════════════════════════════════════
// The dark tail of the hero, so the page changes surface once, cleanly, rather
// than dropping to white under the fold and back again.
//
// This is where a marketing page normally puts a logo wall and a user count.
// Both would be fabricated — FinMatrix has no public customer list and no
// audited usage figure — so it states WHO THE PRODUCT IS FOR, which is positioning
// the vendor may assert, instead of who already bought it.

import { Boxes, ShoppingBasket, Store, Truck, Warehouse } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';

const SECTORS = [
  { icon: Truck, label: 'Distribution' },
  { icon: Boxes, label: 'Wholesale' },
  { icon: Warehouse, label: 'Warehousing' },
  { icon: ShoppingBasket, label: 'FMCG supply' },
  { icon: Store, label: 'Retail supply' },
];

export function ProofStrip() {
  return (
    <section
      aria-labelledby="built-for-heading"
      className="bg-primary-950 py-xxl text-text-inverse"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-lg px-lg lg:flex-row lg:justify-between">
        <Reveal>
          <p id="built-for-heading" className="text-overline text-white/55">
            Built for teams that move stock
          </p>
        </Reveal>

        <Reveal delay={80}>
          <ul className="flex flex-wrap items-center justify-center gap-sm">
            {SECTORS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-xs rounded-full border border-white/10 bg-white/5 px-md py-xs text-label-md text-white/85"
              >
                <Icon className="size-4 text-primary-300" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export default ProofStrip;
