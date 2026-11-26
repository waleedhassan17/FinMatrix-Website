// ═══════════════════════════════════════════════════════
// FinMatrix Web — Free trial countdown (app chrome)
// ═══════════════════════════════════════════════════════
// A slim strip above the top bar while a free trial is RUNNING: days left
// (Asia/Karachi calendar days, as the server's reminders count them), warning
// styling in the last 3 days, "Request activation" (no online payment — the
// team switches the plan on) and "Book onboarding call".
//
// No billing request of its own: it reads the summary sign-in and /auth/me
// already return, and re-reads /auth/me on focus at most once a minute so a
// conversion done elsewhere takes the strip away without a reload.
//
// Owners only: activation is an owner action.

import { CalendarClock, Clock, Gift } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ActivationRequestDialog } from '@/features/launch/ActivationRequestDialog';
import { dirProps, pick, useLang } from '@/i18n/lang';
import { fill, LAUNCH } from '@/i18n/launchStrings';
import { cn } from '@/lib/cn';
import { trialDaysLeft } from '@/models/trial';
import { authMe } from '@/networks/auth/authNetwork';
import {
  selectCompanyId,
  selectIsOwner,
  selectSubscription,
  setIdentity,
} from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

const REFRESH_MIN_INTERVAL_MS = 60_000;
/** The last days of a trial get the warning colour. */
export const TRIAL_URGENT_DAYS = 3;

export function TrialStrip() {
  const dispatch = useAppDispatch();
  const lang = useLang();
  const subscription = useAppSelector(selectSubscription);
  const isOwner = useAppSelector(selectIsOwner);
  const companyId = useAppSelector(selectCompanyId);
  const [now, setNow] = useState(() => new Date());
  const [open, setOpen] = useState(false);
  const lastRefresh = useRef<number | null>(null);

  const days = trialDaysLeft(subscription, now);
  const visible = isOwner && days !== null;

  useEffect(() => {
    if (!visible) return undefined;
    lastRefresh.current ??= Date.now();
    const onFocus = () => {
      setNow(new Date());
      if (Date.now() - (lastRefresh.current ?? 0) < REFRESH_MIN_INTERVAL_MS) return;
      lastRefresh.current = Date.now();
      authMe()
        .then((me) => dispatch(setIdentity(me)))
        .catch(() => {
          /* the session bridges handle a dead token */
        });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [visible, dispatch]);

  if (!visible || days === null) return null;

  const activationInReview = subscription?.paymentStatus === 'submitted';
  const urgent = days <= TRIAL_URGENT_DAYS;
  const Icon = activationInReview ? Clock : Gift;
  const label =
    days <= 0
      ? pick(LAUNCH.trialOneDayLeft, lang)
      : days === 1
        ? pick(LAUNCH.trialDayLeft, lang)
        : fill(pick(LAUNCH.trialDaysLeft, lang), { n: days });

  return (
    <div
      role="status"
      data-urgent={urgent ? 'true' : 'false'}
      className={cn(
        'flex flex-wrap items-center gap-x-sm gap-y-xxs px-md py-xs text-body-sm lg:px-lg',
        urgent ? 'bg-warning-lighter text-text-primary' : 'bg-info-light text-text-primary',
      )}
      {...dirProps(lang)}
    >
      <Icon
        className={cn('size-4 shrink-0', urgent ? 'text-warning' : 'text-info')}
        aria-hidden="true"
      />
      <span className="text-label-md">
        {activationInReview ? `${label} · ${pick(LAUNCH.activationPending, lang)}` : label}
      </span>
      {!activationInReview && companyId && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-label-md text-primary underline-offset-2 hover:underline"
        >
          {pick(LAUNCH.requestActivation, lang)}
        </button>
      )}
      <Link
        to="/book-demo"
        className="inline-flex items-center gap-xxs text-label-md text-primary underline-offset-2 hover:underline"
      >
        <CalendarClock className="size-3.5" aria-hidden="true" />
        {pick(LAUNCH.bookOnboarding, lang)}
      </Link>
      {companyId && (
        <ActivationRequestDialog
          companyId={companyId}
          open={open}
          onOpenChange={setOpen}
          onDone={() => {
            authMe()
              .then((me) => dispatch(setIdentity(me)))
              .catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

export default TrialStrip;
