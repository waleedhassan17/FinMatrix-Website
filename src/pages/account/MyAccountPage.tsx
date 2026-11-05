import { useQuery } from '@tanstack/react-query';
import {
  // BILLING-DISABLED BUILD: only the Subscription shortcut + Renew button.
  // CreditCard,
  Inbox,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  MonitorSmartphone,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AccountHero } from '@/features/account/AccountHero';
import {
  CopyButton,
  InfoRow,
  QuietPill,
  SettingRow,
  ShortcutLink,
  StaffAccess,
  VerifiedBadge,
} from '@/features/account/AccountParts';
import { AccountSection } from '@/features/account/AccountSection';
import { ChangePasswordPanel } from '@/features/account/ChangePasswordPanel';
import { EditProfilePanel } from '@/features/account/EditProfilePanel';
import { useSignOut } from '@/features/auth/useSignOut';
import { useFeature, useIsOwner } from '@/hooks/useCapability';
// BILLING-DISABLED BUILD: subscriptionSummary and SubscriptionTone were
// only used by the commented-out PlanDetails block.
// import { subscriptionSummary, type SubscriptionTone } from '@/models/accountAccess';
import { fetchPendingApprovalCount } from '@/networks/approvals/approvalsNetwork';
// BILLING-DISABLED BUILD: un-comment with the billing query below.
// import { getBillingStatus, type BillingStatus } from '@/networks/billing/billingNetwork';
import {
  selectCompany,
  selectCompanyStatus,
  selectFeatures,
  selectUser,
} from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { initialsOf } from '@/utils/initials';
import { formatPkPhoneForDisplay } from '@/utils/phone';

const pendingLine = (count: number, suffix: string): string =>
  count === 0 ? 'Nothing pending' : `${count} ${count === 1 ? 'request' : 'requests'} ${suffix}`;

/**
 * Who is signed in, how they sign in, and the company they work in — for
 * both roles, laid out as settings: one identity card, then sections with
 * their label on the left and the card on the right.
 *
 * Name and phone are edited in a side panel (PATCH /auth/me). The owner
 * changes their password in a panel too, through the emailed-code flow; a
 * team member's password is reset by the owner, and the page says so rather
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
  // BILLING-DISABLED BUILD: only fed PlanDetails' rider allowance row.
  // const delivery = useFeature('delivery');
  const { signOut, signingOut } = useSignOut();

  // BILLING-DISABLED BUILD: nothing on this page reads the billing status
  // any more, so the request goes too.
  // const billing = useQuery({
  //   queryKey: ['billing', 'status'],
  //   queryFn: getBillingStatus,
  //   enabled: isOwner,
  //   staleTime: 60_000,
  // });

  const pending = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: fetchPendingApprovalCount,
  });
  const pendingCount = pending.data ?? 0;

  // Each opening mounts a fresh panel (new key), so it starts from the saved
  // profile / step one; closing keeps it mounted for the slide-out.
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const openEdit = () => {
    setEditKey((k) => k + 1);
    setEditOpen(true);
  };
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordKey, setPasswordKey] = useState(0);
  const openPassword = () => {
    setPasswordKey((k) => k + 1);
    setPasswordOpen(true);
  };

  const name = user?.displayName || user?.username || 'Your account';
  const phone = user?.phone ? formatPkPhoneForDisplay(user.phone) || user.phone : '';
  // Riders never reach this console; the server refuses their edits anyway.
  const canEdit = !!user && (user.role === 'admin' || user.role === 'staff');
  const canChangePassword = isOwner && !!user?.email;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-xl">
      <PageHeader
        title="My account"
        description={
          isOwner
            ? 'Your profile, how you sign in, and the company you run.'
            : 'Your profile, how you sign in, and what your role lets you do.'
        }
      />

      <AccountHero
        user={user}
        name={name}
        isOwner={isOwner}
        company={company}
        onEdit={canEdit ? openEdit : undefined}
      />

      {/* ── Profile ── */}
      <AccountSection
        title="Profile"
        description="Your name and phone, as your team sees them and on the records you create."
      >
        <Card>
          <dl className="divide-y divide-border-light px-lg">
            <InfoRow label="Full name">
              <span className="min-w-0 break-words">{name}</span>
            </InfoRow>
            {isOwner ? (
              user?.email && (
                <InfoRow label="Email">
                  <span className="min-w-0 break-all">{user.email}</span>
                  <VerifiedBadge verified={user.isEmailVerified} />
                </InfoRow>
              )
            ) : (
              user?.username && (
                <InfoRow label="Username">
                  <span className="min-w-0 break-all">{user.username}</span>
                  <CopyButton label="Username" value={user.username} />
                </InfoRow>
              )
            )}
            <InfoRow
              label="Phone"
              action={
                !phone && canEdit ? (
                  <Button variant="text" size="sm" onClick={openEdit}>
                    Add phone
                  </Button>
                ) : undefined
              }
            >
              {phone ? (
                <span className="tabular">{phone}</span>
              ) : (
                <span className="text-text-tertiary">Not added</span>
              )}
            </InfoRow>
          </dl>
        </Card>
      </AccountSection>

      {/* ── Sign-in & security ── */}
      <AccountSection
        title="Sign-in & security"
        description={
          isOwner
            ? 'How you sign in to FinMatrix on the web and on the Android app.'
            : 'The sign-in your company owner set up for you.'
        }
      >
        <Card>
          <ul className="divide-y divide-border-light">
            {isOwner ? (
              <SettingRow
                icon={KeyRound}
                title="Password"
                description={
                  <>
                    Reset with a 6-digit code sent to{' '}
                    <span className="break-all text-text-primary">{user?.email || 'your email'}</span>.
                  </>
                }
                action={
                  canChangePassword && (
                    <Button variant="secondary" size="sm" onClick={openPassword}>
                      Change password
                    </Button>
                  )
                }
              />
            ) : (
              <SettingRow
                icon={Lock}
                title="Password"
                description={
                  <>
                    Only your company owner can reset it, from{' '}
                    <span className="text-text-primary">Settings → Team</span>. They’ll give you the
                    new one to sign in with.
                  </>
                }
                action={<QuietPill icon={ShieldCheck}>Managed by owner</QuietPill>}
              />
            )}
            <SettingRow
              icon={LogIn}
              title="Sign-in method"
              description={
                isOwner
                  ? 'Email and password, on the web and the Android app.'
                  : 'Team member sign-in, with your username and password.'
              }
            />
          </ul>
        </Card>
      </AccountSection>

      {/* ── Company & access ── */}
      <AccountSection
        title={isOwner ? 'Company' : 'Company & access'}
        description={
          isOwner
            ? 'The business you run in FinMatrix, and where to manage it.'
            : 'Where you work, and what your role covers.'
        }
      >
        <Card>
          <div className="flex items-center gap-md px-lg py-md">
            <span
              aria-hidden="true"
              className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary text-h4 text-text-inverse"
            >
              {initialsOf(company?.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-words text-label-lg text-text-primary">
                {company?.name || 'No company'}
              </p>
              <p className="mt-[2px] text-body-sm text-text-secondary">
                {isOwner
                  ? 'You own this company · full access, approves requests'
                  : 'You work here as a team member. The owner manages its settings.'}
              </p>
            </div>
            {companyStatus && <StatusBadge status={companyStatus} className="shrink-0" />}
          </div>

          {/* BILLING-DISABLED BUILD: the owner's plan block sat under the
              company row. Restore with PlanDetails at the bottom of this file.
          {isOwner && (
            <div className="border-t border-border-light px-lg py-md">
              <PlanDetails
                data={billing.data}
                isLoading={billing.isLoading}
                isError={billing.isError}
                showRiders={delivery}
              />
            </div>
          )} */}

          {!isOwner && (
            <div className="border-t border-border-light px-lg py-md">
              <StaffAccess features={features} />
            </div>
          )}

          <nav aria-label="Company shortcuts" className="flex flex-col border-t border-border-light p-xxs">
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
                  description={pending.isLoading ? 'Checking…' : pendingLine(pendingCount, 'waiting for you')}
                  count={pendingCount}
                />
                {/* BILLING-DISABLED BUILD: /account/renew is deregistered. */}
                {/* <ShortcutLink
                  to="/account/renew"
                  icon={CreditCard}
                  title="Subscription"
                  description="Plan, payment and renewal"
                /> */}
              </>
            ) : (
              <ShortcutLink
                to="/my-requests"
                icon={Inbox}
                title="My requests"
                description={
                  pending.isLoading ? 'Checking…' : pendingLine(pendingCount, 'waiting for the owner')
                }
                count={pendingCount}
              />
            )}
          </nav>
        </Card>
      </AccountSection>

      {/* ── Session ── */}
      <AccountSection title="Session" description="This browser’s sign-in.">
        <Card>
          <ul>
            <SettingRow
              icon={MonitorSmartphone}
              title="Signed in on this browser"
              description={
                <>
                  As{' '}
                  <span className="break-all text-text-primary">
                    {(isOwner ? user?.email : user?.username) || name}
                  </span>
                  . Sign out when you’re done on a shared computer.
                </>
              }
              action={
                <Button variant="secondary" size="sm" onClick={signOut} disabled={signingOut}>
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              }
            />
          </ul>
        </Card>
      </AccountSection>

      {user && canEdit && (
        <EditProfilePanel
          key={`edit-${editKey}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          user={user}
          isOwner={isOwner}
        />
      )}
      {canChangePassword && user?.email && (
        <ChangePasswordPanel
          key={`password-${passwordKey}`}
          open={passwordOpen}
          onOpenChange={setPasswordOpen}
          email={user.email}
        />
      )}
    </div>
  );
}

// ── BILLING-DISABLED BUILD ──────────────────────────────────────────────
// The owner's plan block: plan name, renewal line, rider allowance and the
// Renew/Subscribe button. All three helpers go together — TONE_TEXT and
// PlanRow have no other caller, and `tsc -b` runs with noUnusedLocals, so
// leaving any of them behind fails the build. Restoring it also needs
// ReactNode, Link and CreditCard imported again.
/*
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
            {summary.trialing ? 'Subscribe to a plan' : 'Renew subscription'}
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
*/
