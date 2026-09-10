// ═══════════════════════════════════════════════════════
// FinMatrix Web — Role selection (/get-started)
// ═══════════════════════════════════════════════════════
// Ports the LOGIC of the app's RoleSelectionScreen — dispatch the chosen role,
// then route to a sign-in form shaped for it — and redesigns the layout for a
// browser. The app stacks touch cards in a phone-width column; this is a wide
// two-up on a dark ground.
//
// Only two portals, because only two roles can sign in here. The rider tile is
// deliberately NOT a control: the server accepts role 'delivery' at signup, but
// this console has no delivery view, so a rider who registered here would get an
// account they cannot use. Saying that plainly costs one tile.

import { Building2, ChevronRight, Truck, Users } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthShell } from '@/features/auth/AuthShell';
import { cn } from '@/lib/cn';
import { setSelectedRole } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';
import type { PortalRole } from '@/utils/storage';

function RoleCard({
  icon: Icon,
  title,
  eyebrow,
  body,
  accent,
  onSelect,
  className,
}: {
  icon: typeof Building2;
  title: string;
  eyebrow: string;
  body: string;
  accent: 'navy' | 'teal';
  onSelect: () => void;
  className?: string;
}) {
  const teal = accent === 'teal';

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      className={cn(
        'group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border border-border-light bg-surface p-xl pl-xxl text-left shadow-card',
        'transition-[box-shadow,transform,border-color] duration-300 hover:-translate-y-1 hover:shadow-lg',
        'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        teal
          ? 'hover:border-accent-teal focus-visible:border-accent-teal'
          : 'hover:border-primary focus-visible:border-primary',
        className,
      )}
    >
      {/* The accent bar is the wayfinding: the staff door is teal everywhere it
          appears, including the sign-in screen it leads to. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-[6px]',
          teal ? 'bg-accent-teal' : 'bg-primary',
        )}
      />

      <span
        className={cn(
          'flex size-12 items-center justify-center rounded-xl ring-1 ring-inset',
          teal
            ? 'bg-accent-teal-tint ring-accent-teal/15'
            : 'bg-linear-to-br from-primary-50 to-primary-100 ring-primary-200',
        )}
      >
        <Icon
          className={cn('size-6', teal ? 'text-accent-teal' : 'text-primary')}
          aria-hidden="true"
        />
      </span>

      <p
        className={cn(
          'mt-lg text-overline',
          teal ? 'text-accent-teal' : 'text-primary',
        )}
      >
        {eyebrow}
      </p>
      <h2 className="mt-xxs text-h2 text-text-primary">{title}</h2>
      <p className="mt-sm flex-1 text-body-md text-text-secondary">{body}</p>

      <span className="mt-lg flex items-center gap-xxs text-label-md text-text-primary">
        Continue
        <ChevronRight
          className="size-4 transition-transform group-hover:translate-x-1"
          aria-hidden="true"
        />
      </span>
    </div>
  );
}

export default function RoleSelectPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const choose = (role: PortalRole) => {
    dispatch(setSelectedRole(role));
    navigate(`/login?role=${role}`);
  };

  return (
    <AuthShell
      width="lg"
      title="How will you use FinMatrix?"
      subtitle="Choose your access."
      footer={
        // Inherits the frame's footer colour — this page sits on a dark ground.
        <span className="text-caption">Powered by FinMatrix Cloud</span>
      }
    >
      {/* Placed on an explicit grid so the two cards share row 1 — and so share a
          height — while the signup link takes row 2 under the owner card only.
          In DOM order the link follows the owner card, so on a phone, where the
          grid collapses to one column, it still sits under the card it belongs
          to rather than after both. */}
      <div className="grid gap-x-xl gap-y-xs md:grid-cols-2">
        <RoleCard
          icon={Building2}
          accent="navy"
          eyebrow="Full access"
          title="Business owner"
          body="Set up your company and control accounting, inventory, purchases, payroll, reports and your team."
          onSelect={() => choose('admin')}
          className="md:col-start-1 md:row-start-1"
        />

        {/* Only the owner card offers a way in from nothing — an owner is the
            only account type that can create itself. */}
        <Link
          to="/register"
          className="justify-self-start rounded-sm px-xxs pb-md text-label-md text-primary hover:underline md:col-start-1 md:row-start-2 md:pb-0"
        >
          New here? Start a business →
        </Link>

        {/* No secondary link under the staff card, and not as a design choice:
            /auth/signup refuses role 'staff', and only an owner can reset a
            staff password. There is nothing for a staff member to self-serve. */}
        <RoleCard
          icon={Users}
          accent="teal"
          eyebrow="Staff access"
          title="Team member"
          body="Sign in with the username and password your company gave you."
          onSelect={() => choose('staff')}
          className="md:col-start-2 md:row-start-1"
        />
      </div>

      <div className="mt-xxl flex items-start gap-sm rounded-lg border border-border-light bg-surface-2 p-md">
        <Truck className="mt-xxs size-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <p className="text-body-sm text-text-secondary">
          <span className="text-label-md text-text-primary">Delivery rider?</span>{' '}
          Use the FinMatrix Android app — deliveries are not managed from this
          console.
        </p>
      </div>
    </AuthShell>
  );
}
