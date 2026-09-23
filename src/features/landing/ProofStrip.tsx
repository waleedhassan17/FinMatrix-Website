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

import { Boxes, Factory, ShoppingBasket, Store, Truck, Warehouse } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';

// Warehousing and distribution are where FinMatrix started and they stay first,
// because that is what it is proven on. What changed is that the list no longer
// STOPS there: every row above was a synonym for the same single vertical, which
// told a manufacturer or an importer reading the page that it was not for them.
const SECTORS = [
  { icon: Warehouse, label: 'Warehousing' },
  { icon: Truck, label: 'Distribution' },
  { icon: Boxes, label: 'Wholesale' },
  { icon: Factory, label: 'Manufacturing' },
  { icon: ShoppingBasket, label: 'FMCG' },
  { icon: Store, label: 'Retail supply' },
];

export function ProofStrip() {
  return (
    <section
      aria-labelledby="built-for-heading"
      className="bg-primary-950 py-xxl text-text-inverse"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-lg px-xl lg:flex-row lg:justify-between">
        <Reveal>
          <p id="built-for-heading" className="text-overline text-white/55">
            Built for teams that move stock
          </p>
        </Reveal>

        {/* One Reveal wrapped the whole list, so six pills arrived as one block.
            Each is its own now, 60ms apart, which reads as a row assembling
            rather than a row appearing. The hover styles go on the <li> inside
            each Reveal, never on the Reveal itself — that wrapper owns its own
            transition and a second one would silently replace it. */}
        <ul className="flex flex-wrap items-center justify-center gap-sm">
          {SECTORS.map(({ icon: Icon, label }, i) => (
            <Reveal as="li" key={label} delay={80 + i * 60}>
              <span className="flex items-center gap-xs rounded-full border border-white/10 bg-white/5 px-md py-xs text-label-md text-white/85 transition-[transform,background-color,border-color] duration-300 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                <Icon className="size-4 text-primary-300" aria-hidden="true" />
                {label}
              </span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default ProofStrip;
