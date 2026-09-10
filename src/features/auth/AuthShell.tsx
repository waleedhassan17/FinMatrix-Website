// ═══════════════════════════════════════════════════════
// FinMatrix Web — Auth frame
// ═══════════════════════════════════════════════════════
// Every unauthenticated screen sits in this: sign-in (both doors), signup,
// password reset, email verification, account status and the role picker.
//
// TWO LAYOUTS, chosen by `width`:
//
//   'sm'  SPLIT SCREEN. A dark brand panel (~44%) beside the form. Below `lg` the
//         panel is hidden and its weight moves into a dark band behind the card,
//         so a phone gets the same brand presence without a second column.
//   'lg'  CENTRED on a full-bleed dark ground. The role picker lays two large
//         cards side by side and needs its full 880px; halving the viewport for a
//         panel would crush them.
//
// `accent` picks the door: navy for the owner, teal for staff. It colours the
// whole brand panel, so the two portals are unmistakable before a field is read.
// The submit button stays navy — the product has one action colour.
//
// THE BRAND PANEL IS BOUND BY TWO TESTS, and neither is obvious:
//
//   - It contains NO links. roleSelect.test.tsx asserts its page has exactly one;
//     loginPortals.test.tsx asserts the staff door has none at all.
//   - jsdom applies no CSS, so the `hidden lg:flex` panel is still in the DOM and
//     its text is still in `textContent`. The staff door bans /forgot/, /sign ?up/,
//     /create … account/, /invite/, /join/, /new to finmatrix/ and
//     /start a business/ — and `getByText(/team member portal/i)` throws on a
//     second match, so the teal panel must not repeat the eyebrow's phrase.

import { BarChart3, Check, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { compactMoney } from '@/utils/money';

type Accent = 'navy' | 'teal';

const PANEL: Record<Accent, { overline: string; title: string; points: string[] }> = {
  navy: {
    overline: 'Warehouse & distribution',
    title: 'Your stock and your books, finally the same number.',
    points: [
      'Inventory tied to the ledger',
      'Maker-checker approvals before anything posts',
      'Web console and Android app, one set of records',
    ],
  },
  teal: {
    overline: 'Staff workspace',
    title: 'Everything your role needs, and nothing it doesn’t.',
    points: [
      'Sales, stock and deliveries in one place',
      'Anything that moves money goes to your owner',
      'Your owner manages your account and password',
    ],
  },
};

/** Grid + grain for any dark surface in this frame. Inert. */
function DarkTexture() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 texture-grain opacity-[0.07]"
      />
    </>
  );
}

/** Always drawn on a dark ground in this frame. Deliberately not a link. */
function Wordmark() {
  return (
    <div className="flex items-center gap-sm">
      <span className="flex size-10 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
        <BarChart3 className="size-5 text-text-inverse" aria-hidden="true" />
      </span>
      <span className="text-h2 text-text-inverse">FinMatrix</span>
    </div>
  );
}

/** A small, honest picture of the product — not a claim about anyone's usage. */
function ProofCard({ teal }: { teal: boolean }) {
  const rows = teal
    ? [
        { label: 'Orders to fulfil', value: '18' },
        { label: 'Awaiting approval', value: '3' },
      ]
    : [
        { label: 'Stock on hand', value: compactMoney(4820000) },
        { label: 'Receivables', value: compactMoney(1264500) },
      ];

  return (
    <div className="rounded-xl border glass-dark p-lg">
      <div className="flex items-center justify-between">
        <p className="text-overline text-white/60">{teal ? 'Your queue' : 'Today'}</p>
        <span className="flex items-center gap-xxs text-caption text-success-bright">
          <span className="size-1.5 rounded-full bg-success-bright" aria-hidden="true" />
          In sync
        </span>
      </div>
      <dl className="mt-md grid grid-cols-2 gap-md">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-caption text-white/60">{row.label}</dt>
            <dd className="mt-xxs text-h2 tabular text-text-inverse">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BrandPanel({ accent }: { accent: Accent }) {
  const teal = accent === 'teal';
  const copy = PANEL[accent];

  return (
    <aside
      className={cn(
        'relative isolate hidden overflow-hidden text-text-inverse',
        'lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:gap-xxl lg:p-xxxxl',
        teal ? 'surface-mesh-teal' : 'surface-mesh-navy',
      )}
    >
      <DarkTexture />
      <Wordmark />

      <div className="max-w-[460px]">
        <p className={cn('text-overline', teal ? 'text-accent-teal-tint' : 'text-primary-200')}>
          {copy.overline}
        </p>
        {/* A <p>, not a heading: the page's <h1> is the form's title. */}
        <p className="mt-md text-display-sm text-text-inverse xl:text-display-md">
          {copy.title}
        </p>

        <ul className="mt-xl flex flex-col gap-md">
          {copy.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-sm text-body-md text-white/80"
            >
              <span className="mt-[1px] flex size-5 shrink-0 items-center justify-center rounded-full bg-white/10">
                <Check className="size-3 text-success-bright" aria-hidden="true" />
              </span>
              {point}
            </li>
          ))}
        </ul>

        <div className="mt-xxl">
          <ProofCard teal={teal} />
        </div>
      </div>

      <p className="flex items-center gap-xs text-caption text-white/60">
        <ShieldCheck className="size-4 shrink-0 text-white/70" aria-hidden="true" />
        Permissions are enforced on the server, not just hidden in the interface.
      </p>
    </aside>
  );
}

function CardHeading({
  eyebrow,
  teal,
  title,
  subtitle,
}: {
  eyebrow?: ReactNode;
  teal: boolean;
  title: string;
  subtitle?: ReactNode;
}) {
  return (
    <>
      {eyebrow && (
        <p className={cn('mb-xs text-overline', teal ? 'text-accent-teal' : 'text-primary')}>
          {eyebrow}
        </p>
      )}
      <h1 className="text-display-sm text-text-primary">{title}</h1>
      {subtitle && (
        <p className="mt-xs text-body-md text-text-secondary">{subtitle}</p>
      )}
    </>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  eyebrow,
  accent = 'navy',
  width = 'sm',
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Small label above the title — names the portal on the staff door. */
  eyebrow?: ReactNode;
  accent?: Accent;
  width?: 'sm' | 'lg';
}) {
  const teal = accent === 'teal';

  if (width === 'lg') {
    return (
      <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden surface-mesh-navy px-lg py-xxxxl">
        <DarkTexture />

        <main className="w-full max-w-[880px]">
          <div className="mb-xl flex justify-center">
            <Wordmark />
          </div>

          <div className="rounded-2xl border border-white/10 bg-surface p-xl shadow-xl sm:p-xxl">
            <CardHeading eyebrow={eyebrow} teal={teal} title={title} subtitle={subtitle} />
            <div className="mt-xl">{children}</div>
          </div>

          {footer && (
            <div className="mt-lg text-center text-body-sm text-white/65">{footer}</div>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,11fr)_minmax(0,14fr)]">
      <BrandPanel accent={accent} />

      <main className="relative isolate flex min-h-screen flex-col lg:items-center lg:justify-center lg:px-xxxxl lg:py-xxxl">
        {/* Phones and tablets: the panel is hidden, so its weight moves into a
            band behind the top of the card. */}
        <div
          className={cn(
            'relative isolate overflow-hidden px-lg pt-xl pb-[104px] lg:hidden',
            teal ? 'surface-mesh-teal' : 'surface-mesh-navy',
          )}
        >
          <DarkTexture />
          <Wordmark />
        </div>

        {/* Desktop: a faint dot field, so the form side is a surface too. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 hidden pattern-dots fade-mask-radial lg:block"
        />

        <div className="relative -mt-[72px] w-full px-lg pb-xxl sm:mx-auto sm:max-w-[488px] lg:mt-0 lg:max-w-[440px] lg:px-0 lg:pb-0">
          <div
            className={cn(
              'rounded-2xl border border-border-light bg-surface p-xl shadow-xl sm:p-xxl lg:shadow-lg',
              teal && 'border-t-4 border-t-accent-teal',
            )}
          >
            <CardHeading eyebrow={eyebrow} teal={teal} title={title} subtitle={subtitle} />
            <div className="mt-xl">{children}</div>
          </div>

          {footer && (
            <div className="mt-lg text-center text-body-sm text-text-secondary">
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default AuthShell;
