// ═══════════════════════════════════════════════════════
// FinMatrix Web — Who signs in
// ═══════════════════════════════════════════════════════
// Doubles as documentation for the account model the role picker enforces: an
// owner signs up, staff are created by the owner, and riders use the Android app
// because this console has no delivery view.
//
// Each card carries its portal's colour — navy for the owner, teal for staff —
// so the teal door a staff member meets at sign-in is one they have already seen.

import { Building2, Check, Truck, Users, type LucideIcon } from 'lucide-react';

import { Reveal } from '@/components/motion/Reveal';
import { SectionIntro } from '@/features/landing/SectionIntro';
import { cn } from '@/lib/cn';

type Tone = 'navy' | 'teal' | 'neutral';

interface Role {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  access: string;
  body: string;
  points: string[];
}

const ROLES: Role[] = [
  {
    icon: Building2,
    tone: 'navy',
    title: 'Business owner',
    access: 'Full access',
    body: 'Creates the company and controls accounting, inventory, purchasing, payroll and reports.',
    points: [
      'Adds and deactivates team members',
      'Approves what staff submit',
      'Resets staff passwords',
    ],
  },
  {
    icon: Users,
    tone: 'teal',
    title: 'Team member',
    access: 'Staff access',
    body: 'Signs in with a username the owner issues — no email needed — and handles day-to-day sales and warehouse work.',
    points: [
      'Sales, stock and purchasing',
      'Money movements go for approval',
      'Sees only what the role allows',
    ],
  },
  {
    icon: Truck,
    tone: 'neutral',
    title: 'Delivery rider',
    access: 'Android app',
    body: 'Works from the FinMatrix mobile app, not this console — built for a vehicle, not a desk.',
    points: [
      'Assigned loads on the phone',
      'Delivery confirmations',
      'Returns go to the owner first',
    ],
  },
];

const BAND: Record<Tone, string> = {
  navy: 'surface-mesh-navy',
  teal: 'surface-mesh-teal',
  neutral: 'bg-linear-to-br from-neutral-700 to-neutral-900',
};

const ACCENT: Record<Tone, string> = {
  navy: 'text-primary',
  teal: 'text-accent-teal',
  neutral: 'text-neutral-600',
};

export function RolesSection() {
  return (
    <section
      aria-labelledby="roles-heading"
      className="bg-surface py-section lg:py-section-lg"
    >
      <div className="mx-auto max-w-[1200px] px-lg">
        <SectionIntro
          id="roles-heading"
          overline="Your team"
          title="Everyone sees only their own work"
          body="Permissions are enforced on the server, not hidden in the interface. A staff member who goes looking for the chart of accounts does not find it."
        />

        <ul className="mt-xxxxl grid gap-lg md:grid-cols-3">
          {ROLES.map((role, i) => {
            const Icon = role.icon;
            return (
              <Reveal as="li" key={role.title} delay={i * 80}>
                <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border-light bg-surface shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <div className={cn('relative isolate h-28', BAND[role.tone])}>
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 -z-10 pattern-grid-dark fade-mask-radial"
                    />
                    <span className="absolute -bottom-lg left-xl flex size-14 items-center justify-center rounded-xl bg-surface shadow-lg ring-1 ring-border-light">
                      <Icon className={cn('size-6', ACCENT[role.tone])} aria-hidden="true" />
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col px-xl pt-xxxl pb-xl">
                    <p className={cn('text-overline', ACCENT[role.tone])}>{role.access}</p>
                    <h3 className="mt-xxs text-h3 text-text-primary">{role.title}</h3>
                    <p className="mt-sm text-body-md text-text-secondary">{role.body}</p>

                    <ul className="mt-lg flex flex-col gap-xs border-t border-border-light pt-lg">
                      {role.points.map((point) => (
                        <li
                          key={point}
                          className="flex items-start gap-xs text-body-sm text-text-secondary"
                        >
                          <Check
                            className={cn('mt-[3px] size-4 shrink-0', ACCENT[role.tone])}
                            aria-hidden="true"
                          />
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default RolesSection;
