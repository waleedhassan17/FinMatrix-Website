// ═══════════════════════════════════════════════════════
// FinMatrix Web — Free trial countdown (app chrome)
// ═══════════════════════════════════════════════════════
// A slim strip above the top bar while a free trial is RUNNING: approved, not
// converted to a paid plan, not over. Hidden in every other state — a pending
// request has nothing to count, a paid company has nothing to be reminded of.
//
// No billing request of its own: it reads the plan summary signin and /auth/me
// already return. When the tab regains focus it re-reads /auth/me at most once
// a minute, so an approval or conversion that happened elsewhere (the phone,
// the admin console) takes the strip away without a reload.
//
// Owners only. Subscribing is an owner action, and a staff member cannot act on
// "subscribe".

import { Clock, Gift } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { pluralDays, trialDaysLeft } from '@/models/trial';
import { authMe } from '@/networks/auth/authNetwork';
import { selectIsOwner, selectSubscription, setIdentity } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

const REFRESH_MIN_INTERVAL_MS = 60_000;

export function TrialStrip() {
  const dispatch = useAppDispatch();
  const subscription = useAppSelector(selectSubscription);
  const isOwner = useAppSelector(selectIsOwner);
  const [now, setNow] = useState(() => new Date());
  // Set when the strip first shows (the identity was just fetched), not at render.
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
          /* the session bridges handle a dead token; keep the strip as is */
        });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [visible, dispatch]);

  if (!visible || days === null) return null;

  const paymentInReview = subscription?.paymentStatus === 'submitted';
  const urgent = days <= 7;
  const Icon = paymentInReview ? Clock : Gift;

  return (
    <div
      role="status"
      className={cn(
        'flex flex-wrap items-center gap-x-sm gap-y-xxs px-md py-xs text-body-sm lg:px-lg',
        urgent ? 'bg-warning-lighter text-text-primary' : 'bg-info-light text-text-primary',
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', urgent ? 'text-warning' : 'text-info')}
        aria-hidden="true"
      />
      <span className="text-label-md">
        {paymentInReview
          ? `Payment under review · ${pluralDays(days)} of your free trial left`
          : `${pluralDays(days)} left in your free trial`}
      </span>
      {!paymentInReview && (
        <Link
          to="/account/renew"
          className="text-label-md text-primary underline-offset-2 hover:underline"
        >
          Subscribe
        </Link>
      )}
    </div>
  );
}

export default TrialStrip;
