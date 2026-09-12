import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  Building2,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  CreditCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  MailWarning,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useSignOut } from '@/features/auth/useSignOut';
import { useFeature, useIsOwner } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  staffAccessSummary,
  subscriptionSummary,
  type SubscriptionTone,
} from '@/models/accountAccess';
import { fetchPendingApprovalCount } from '@/networks/approvals/approvalsNetwork';
import { getBillingStatus, type BillingStatus } from '@/networks/billing/billingNetwork';
import {
  selectCompany,
  selectCompanyStatus,
  selectFeatures,
  selectUser,
} from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { initialsOf } from '@/utils/initials';

/**
 * Who is signed in, how they sign in, how to change the password, and the
 * company they are working in — for both roles.
 *
 * Nothing here is edited in place: the server has no self-service profile
 * endpoint. The owner changes their password through the emailed-code flow;
 * a team member's password is reset by the owner, and the page says so rather
 * than leaving them to find out. Team members also see what their role lets
 * them do, read from the same capability map the buttons use.
 */
export default function MyAccountPage() {
  const user = useAppSelector(selectUser);
  const company = useAppSelector(selectCompany);
  const companyStatus = useAppSelector(selectCompanyStatus);
  const features = useAppSelector(selectFeatures);
  const isOwner = useIsOwner();
  const multiUser = useFeature('multiUser');
  const delivery = useFeature('delivery');
  const { signOut } = useSignOut();

  const billing = useQuery({
    queryKey: ['billing', 'status'],
    queryFn: getBillingStatus,
    enabled: isOwner,
    staleTime: 60_000,
  });

  const pending = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: fetchPendingApprovalCount,
  });
  const pendingCount = pending.data ?? 0;

  const name = user?.displayName || user?.username || 'Your account';

  return (
    <div className="flex max-w-5xl flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">My account</h1>
        <p className="text-body-sm text-text-secondary">
          {isOwner
            ? 'Your sign-in, your password and your company’s plan.'
            : 'Your sign-in, what your role lets you do, and who to ask for help.'}
        </p>
      </div>

      <div className="grid gap-lg lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-lg">
          {/* ── Who ── */}
          <Card className="p-lg">
            <div className="flex flex-col gap-md sm:flex-row sm:items-start">
              <span
                aria-hidden="true"
                className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary-tint text-h3 text-primary"
              >
                {initialsOf(name)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-xs">
                  <h2 className="min-w-0 break-words text-h3 text-text-primary">{name}</h2>
                  <RolePill owner={isOwner} />
                </div>

                <p className="mt-xxs flex flex-wrap items-center gap-xs text-body-sm text-text-secondary">
                  {isOwner ? (
                    <>
                      <span className="break-words">{user?.email}</span>
                      {user?.email && <VerifiedBadge verified={user.isEmailVerified} />}
                    </>
                  ) : (
                    user?.username && <span className="break-words">@{user.username}</span>
                  )}
                </p>

                {/* The Company card sits beside this on wide screens; on a phone
                    it is far below, so the company is named here too. */}
                {company?.name && (
                  <p className="mt-sm flex flex-wrap items-center gap-xs lg:hidden">
                    <Building2 className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                    <span className="text-label-md text-text-primary">{company.name}</span>
                    {companyStatus && <StatusBadge status={companyStatus} />}
                  </p>
                )}
              </div>

              <Button variant="secondary" onClick={signOut} className="w-full shrink-0 sm:w-auto">
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </Card>

          {/* ── Staff: what the role allows ── */}
          {!isOwner && (
            <StaffAccessCard
              features={features}
              pendingCount={pendingCount}
              pendingLoading={pending.isLoading}
            />
          )}

          {/* ── How they sign in ── */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Sign-in details</CardTitle>
                <CardDescription>
                  {isOwner
                    ? 'How you sign in to FinMatrix on the web and on the Android app.'
                    : 'The sign-in your company owner set up for you.'}
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="py-xs">
              <dl className="divide-y divide-border-light">
                {isOwner ? (
                  <>
                    {user?.email && <DetailRow label="Email" value={user.email} />}
                    <DetailRow label="Signs in with" value="Email and password" />
                  </>
                ) : (
                  <>
                    {user?.username && <DetailRow label="Username" value={user.username} copyable />}
                    <DetailRow label="Signs in at" value="Team member sign-in · username and password" />
                  </>
                )}
                {user?.phone && <DetailRow label="Phone" value={user.phone} />}
                <DetailRow
                  label="Role"
                  value={isOwner ? 'Owner · full access, approves requests' : 'Team member'}
                />
              </dl>
            </CardContent>
          </Card>

          {/* ── Password ── */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Password</CardTitle>
                <CardDescription>
                  {isOwner
                    ? 'Change it any time with a code sent to your email.'
                    : 'Team member passwords are managed by the company owner.'}
                </CardDescription>
              </div>
            </CardHeader>
            {isOwner ? (
              <CardContent className="flex flex-col gap-md sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-sm">
                  <IconTile icon={KeyRound} />
                  <p className="text-body-sm text-text-secondary">
                    We email a 6-digit code to{' '}
                    <span className="break-words text-text-primary">{user?.email || 'your email'}</span>.
                    Enter it, choose a new password, then sign in again.
                  </p>
                </div>
                <Button asChild variant="secondary" className="w-full shrink-0 sm:w-auto">
                  <Link
                    to={
                      user?.email
                        ? `/forgot-password?email=${encodeURIComponent(user.email)}`
                        : '/forgot-password'
                    }
                  >
                    <KeyRound className="size-4" />
                    Change password
                  </Link>
                </Button>
              </CardContent>
            ) : (
              <CardContent>
                <div className="flex items-start gap-sm rounded-md bg-primary-50 p-md">
                  <Lock className="mt-[2px] size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-body-sm text-text-secondary">
                    Only the company owner can reset your password. If you forget it or want a new
                    one, ask them to reset it from{' '}
                    <span className="text-text-primary">Settings → Team</span> — they will give you
                    the new password to sign in with.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-lg">
          {/* ── Company ── */}
          <Card>
            <CardHeader>
              <CardTitle>Company</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-md">
              <div className="flex items-center gap-sm">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-label-lg text-text-inverse"
                >
                  {initialsOf(company?.name)}
                </span>
                <div className="min-w-0">
                  <p className="break-words text-label-lg text-text-primary">
                    {company?.name || 'No company'}
                  </p>
                  {companyStatus && <StatusBadge status={companyStatus} className="mt-xxs" />}
                </div>
              </div>

              {isOwner ? (
                <PlanDetails
                  data={billing.data}
                  isLoading={billing.isLoading}
                  isError={billing.isError}
                  showRiders={delivery}
                />
              ) : (
                <p className="text-body-sm text-text-secondary">
                  You work here as a team member. The owner manages the company’s plan and settings.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── Shortcuts ── */}
          <Card>
            <CardHeader>
              <CardTitle>Shortcuts</CardTitle>
            </CardHeader>
            <nav aria-label="Account shortcuts" className="flex flex-col p-xxs">
              {isOwner ? (
                <>
                  <ShortcutLink
                    to="/settings/company"
                    icon={Settings}
                    title="Company profile"
                    description="Name, address and tax details"
                  />
                  {multiUser && (
                    <ShortcutLink
                      to="/settings/users"
                      icon={Users}
                      title="Team"
                      description="Add staff and reset their passwords"
                    />
                  )}
                  <ShortcutLink
                    to="/approvals"
                    icon={Inbox}
                    title="Approvals"
                    description={pendingLine(pendingCount, 'waiting for you')}
                    count={pendingCount}
                  />
                  <ShortcutLink
                    to="/account/renew"
                    icon={CreditCard}
                    title="Subscription"
                    description="Plan, payment and renewal"
                  />
                </>
              ) : (
                <>
                  <ShortcutLink
                    to="/my-requests"
                    icon={Inbox}
                    title="My requests"
                    description={pendingLine(pendingCount, 'waiting for the owner')}
                    count={pendingCount}
                  />
                  <ShortcutLink
                    to="/dashboard"
                    icon={LayoutDashboard}
                    title="Dashboard"
                    description="Back to today’s numbers"
                  />
                </>
              )}
            </nav>
          </Card>
        </div>
      </div>
    </div>
  );
}

const pendingLine = (count: number, suffix: string): string =>
  count === 0 ? 'Nothing pending' : `${count} ${count === 1 ? 'request' : 'requests'} ${suffix}`;

function RolePill({ owner }: { owner: boolean }) {
  const Icon = owner ? ShieldCheck : Users;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xxs rounded-full px-sm py-[2px] text-label-sm',
        owner ? 'bg-primary-tint text-primary' : 'bg-neutral-100 text-text-secondary',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {owner ? 'Owner' : 'Team member'}
    </span>
  );
}

function VerifiedBadge({ verified }: { verified: boolean }) {
  const Icon = verified ? BadgeCheck : MailWarning;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xxs rounded-full px-xs py-[2px] text-label-sm',
        verified ? 'bg-success-lighter text-success' : 'bg-warning-lighter text-warning',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {verified ? 'Verified' : 'Not verified'}
    </span>
  );
}

function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  return (
    <div className="flex flex-col gap-xxs py-sm sm:flex-row sm:items-center sm:justify-between sm:gap-md">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="flex min-w-0 items-center gap-xs text-body-sm text-text-primary sm:justify-end sm:text-right">
        <span className="break-words">{value}</span>
        {copyable && <CopyButton label={label} value={value} />}
      </dd>
    </div>
  );
}

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be refused; the value is on screen to copy by hand.
      toast.error('Could not copy', { description: 'Select the text and copy it instead.' });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-hover hover:text-text-secondary"
    >
      {copied ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

function StaffAccessCard({
  features,
  pendingCount,
  pendingLoading,
}: {
  features: Parameters<typeof staffAccessSummary>[0];
  pendingCount: number;
  pendingLoading: boolean;
}) {
  const access = staffAccessSummary(features);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>What you can do</CardTitle>
          <CardDescription>
            Set by your role. Anything that moves money waits for the owner’s approval.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-lg md:grid-cols-3">
        <AccessGroup icon={CircleCheck} tone="success" title="Do directly" items={access.direct} />
        <AccessGroup
          icon={Clock3}
          tone="warning"
          title="Sent for approval"
          items={access.request}
        />
        <AccessGroup icon={Lock} tone="neutral" title="Owner only" items={access.ownerOnly} />
      </CardContent>
      <CardFooter className="flex-wrap justify-between">
        <p className="text-body-sm text-text-secondary">
          {pendingLoading ? 'Checking your requests…' : pendingLine(pendingCount, 'waiting for the owner') + '.'}
        </p>
        <Button asChild variant="text" size="sm">
          <Link to="/my-requests">
            My requests
            <ChevronRight className="size-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

const GROUP_TONE = {
  success: 'bg-success-lighter text-success',
  warning: 'bg-warning-lighter text-warning',
  neutral: 'bg-neutral-100 text-text-secondary',
} as const;

function AccessGroup({
  icon: Icon,
  tone,
  title,
  items,
}: {
  icon: LucideIcon;
  tone: keyof typeof GROUP_TONE;
  title: string;
  items: string[];
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className="flex items-center gap-xs text-label-md text-text-primary">
        <span className={cn('flex size-6 items-center justify-center rounded-full', GROUP_TONE[tone])}>
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        {title}
      </h3>
      <ul className="mt-sm flex flex-col gap-xs">
        {items.map((item) => (
          <li key={item} className="flex gap-xs text-body-sm text-text-secondary">
            <span aria-hidden="true" className="mt-[8px] size-1 shrink-0 rounded-full bg-border-strong" />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE_TEXT: Record<SubscriptionTone, string> = {
  normal: 'text-text-primary',
  warning: 'text-warning',
  danger: 'text-danger',
};

function PlanDetails({
  data,
  isLoading,
  isError,
  showRiders,
}: {
  data: BillingStatus | undefined;
  isLoading: boolean;
  isError: boolean;
  showRiders: boolean;
}) {
  if (isLoading) {
    return <div className="h-24 animate-pulse rounded-md bg-neutral-100" aria-label="Loading plan" />;
  }
  if (isError || !data) {
    return <p className="text-body-sm text-text-tertiary">Plan details are unavailable right now.</p>;
  }

  const summary = subscriptionSummary(data);

  return (
    <div className="flex flex-col gap-sm">
      <dl className="divide-y divide-border-light rounded-md border border-border-light">
        <PlanRow label="Plan" value={summary.planLabel} />
        <PlanRow
          label="Subscription"
          value={<span className={TONE_TEXT[summary.tone]}>{summary.renewalLine}</span>}
          sub={summary.daysLeftLabel}
        />
        {showRiders && data.deliveryPersonnelLimit !== null && (
          <PlanRow label="Delivery riders" value={`Up to ${data.deliveryPersonnelLimit}`} />
        )}
      </dl>
      {summary.pendingReview && (
        <p className="text-caption text-text-secondary">
          Your payment proof is being reviewed. We will switch the new term on once it is approved.
        </p>
      )}
      {summary.shouldRenew && (
        <Button asChild full size="sm">
          <Link to="/account/renew">
            <CreditCard className="size-4" />
            Renew subscription
          </Link>
        </Button>
      )}
    </div>
  );
}

function PlanRow({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-sm px-sm py-xs">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-right text-label-md text-text-primary">
        {value}
        {sub && <span className="block text-caption text-text-tertiary">{sub}</span>}
      </dd>
    </div>
  );
}

function ShortcutLink({
  to,
  icon,
  title,
  description,
  count = 0,
}: {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  count?: number;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-sm rounded-md px-sm py-sm transition-colors outline-none hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary"
    >
      <IconTile icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="block text-label-md text-text-primary">{title}</span>
        <span className="block truncate text-caption text-text-secondary">{description}</span>
      </span>
      {count > 0 && (
        <span className="min-w-5 rounded-full bg-danger px-xxs text-center text-label-sm text-text-inverse tabular">
          {count > 99 ? '99+' : count}
        </span>
      )}
      <ChevronRight
        className="size-4 shrink-0 text-text-tertiary transition-colors group-hover:text-text-secondary"
        aria-hidden="true"
      />
    </Link>
  );
}
