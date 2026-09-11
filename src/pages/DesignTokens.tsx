import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  SummaryDivider,
  SummaryPanel,
  SummaryRow,
} from '@/components/ui/SummaryPanel';
import { colors, form, typography, type TypeRoleName } from '@/theme/tokens';

/**
 * A proof sheet for the ported design system. Not part of the product — it is
 * the page you open beside the phone to confirm the two clients agree before
 * trusting the tokens in real screens.
 */

const TYPE_ROLES = Object.keys(typography) as TypeRoleName[];

const TYPE_CLASS: Record<TypeRoleName, string> = {
  displayXl: 'text-display-xl',
  displayLg: 'text-display-lg',
  displayMd: 'text-display-md',
  displaySm: 'text-display-sm',
  h1: 'text-h1',
  h2: 'text-h2',
  h3: 'text-h3',
  h4: 'text-h4',
  h5: 'text-h5',
  bodyLg: 'text-body-lg',
  bodyMd: 'text-body-md',
  bodySm: 'text-body-sm',
  labelLg: 'text-label-lg',
  labelMd: 'text-label-md',
  labelSm: 'text-label-sm',
  caption: 'text-caption',
  overline: 'text-overline',
};

const STATUSES = [
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'void',
  'pending_approval',
  'approved',
  'rejected',
  'converted',
  'invoiced',
  'received',
];

const SWATCHES: Array<[string, string]> = [
  ['primary', colors.primary],
  ['primaryDark', colors.primaryDark],
  ['primaryTint', colors.primaryTint],
  // The navy ramp the public and auth surfaces are built from.
  ['primary50', colors.primary50],
  ['primary100', colors.primary100],
  ['primary200', colors.primary200],
  ['primary300', colors.primary300],
  ['primary600', colors.primary600],
  ['primary800', colors.primary800],
  ['primary900', colors.primary900],
  ['primary950', colors.primary950],
  ['accentTeal', colors.accentTeal],
  ['successBright', colors.successBright],
  ['secondary', colors.secondary],
  ['success', colors.success],
  ['warning', colors.warning],
  ['danger', colors.danger],
  ['info', colors.info],
  ['background', colors.background],
  ['surface', colors.surface],
  ['border', colors.border],
  ['textPrimary', colors.textPrimary],
  ['textSecondary', colors.textSecondary],
  ['textTertiary', colors.textTertiary],
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-xxl">
      <div className="mb-md flex items-center gap-xs">
        <span
          className="rounded-full"
          style={{
            width: form.sectionDot.size,
            height: form.sectionDot.size,
            backgroundColor: form.sectionDot.color,
          }}
        />
        <h2 className="text-overline text-neutral-500">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function DesignTokens() {
  return (
    <div className="min-h-screen bg-background p-xxl">
      <header className="mb-xxl">
        <h1 className="text-h1 text-text-primary">Design tokens</h1>
        <p className="text-body-sm text-text-secondary">
          Ported from the mobile app&rsquo;s <code>src/theme/theme.ts</code>. Open this
          beside the phone — anything that differs is a bug.
        </p>
      </header>

      <Section title="Colour">
        <div className="grid grid-cols-2 gap-md sm:grid-cols-4 lg:grid-cols-7">
          {SWATCHES.map(([name, value]) => (
            <div
              key={name}
              className="overflow-hidden rounded-md bg-surface shadow-card"
            >
              <div className="h-16" style={{ backgroundColor: value }} />
              <div className="p-xs">
                <div className="text-label-md text-text-primary">{name}</div>
                <div className="text-caption text-text-tertiary tabular">{value}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type scale">
        <div className="rounded-lg bg-surface p-lg shadow-card">
          {TYPE_ROLES.map((role) => {
            const spec = typography[role];
            return (
              <div
                key={role}
                className="flex items-baseline gap-lg border-b border-border-light py-sm last:border-0"
              >
                <code className="w-28 shrink-0 text-caption text-text-tertiary">
                  {role}
                </code>
                <span className={`${TYPE_CLASS[role]} flex-1 text-text-primary`}>
                  The quick brown fox
                </span>
                <span className="shrink-0 text-caption text-text-tertiary tabular">
                  {spec.fontSize}/{spec.lineHeight} · {spec.fontWeight}
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Status badges">
        <div className="flex flex-wrap gap-xs rounded-lg bg-surface p-lg shadow-card">
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-sm rounded-lg bg-surface p-lg shadow-card">
          <Button>Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="text">Text</Button>
          <Button size="sm">Small</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="grid max-w-[36rem] gap-md rounded-lg bg-surface p-lg shadow-card">
          <Input label="Customer" placeholder="Search customers…" />
          <Input
            label="Invoice number"
            defaultValue="INV-1042"
            hint="Generated from the last invoice in this company."
          />
          <Input
            label="Due date"
            defaultValue="not-a-date"
            error="Enter a date in the future."
          />
          <Input label="Reference" placeholder="Locked" disabled />
        </div>
      </Section>

      <Section title="Summary panel">
        <SummaryPanel
          className="max-w-[28rem]"
          total={{ label: 'Grand total', value: 135400 }}
        >
          <SummaryRow label="Subtotal" value={120000} />
          <SummaryRow label="Tax (17%)" value={20400} />
          <SummaryRow label="Discount" value={5000} tone="positive" negate />
          <SummaryDivider />
          <SummaryRow label="Unapplied" value={2500} tone="caution" />
          <SummaryRow label="Overpayment" value={800} tone="negative" />
        </SummaryPanel>
      </Section>
    </div>
  );
}
