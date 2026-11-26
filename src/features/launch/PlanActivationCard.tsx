import { CalendarClock, Clock, Gift, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { fill, LAUNCH } from '@/config/launchStrings';
import { planCardState, trialDaysLeft } from '@/models/trial';
import { authMe } from '@/networks/auth/authNetwork';
import { selectCompanyId, selectSubscription, setIdentity } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

import { ActivationRequestDialog } from './ActivationRequestDialog';

const dateFmt = (iso: string): string =>
  new Intl.DateTimeFormat('en-PK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  }).format(new Date(iso));

/**
 * My account → Plan, for the owner: the plan, its end date, and "Request
 * activation" during a trial or after a plan ended. A paid, running plan just
 * shows its terms; a request in review says so instead of offering another.
 */
export function PlanActivationCard() {
  const dispatch = useAppDispatch();
  const subscription = useAppSelector(selectSubscription);
  const companyId = useAppSelector(selectCompanyId);
  const [open, setOpen] = useState(false);

  if (!subscription || !companyId) return null;
  const state = planCardState(subscription);
  if (state === 'none') return null;

  const onTrial = subscription.isTrial && !subscription.trialConvertedAt;
  const title = onTrial ? LAUNCH.planOnTrial : subscription.planLabel;
  const ends = subscription.expiryDate
    ? fill(state === 'ended' ? LAUNCH.planEndedOn : LAUNCH.planEndsOn, {
        date: dateFmt(subscription.expiryDate),
      })
    : LAUNCH.planNoEnd;
  const days = trialDaysLeft(subscription);
  const Icon = state === 'pending' ? Clock : onTrial ? Gift : Sparkles;

  return (
    <Card>
      <div className="flex flex-col gap-sm px-lg py-md" data-testid="plan-card">
        <div className="flex items-start gap-md">
          <Icon className="mt-[2px] size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-label-lg text-text-primary">{title}</p>
            <p className="mt-[2px] text-body-sm text-text-secondary">
              {ends}
              {days !== null &&
                ` · ${
                  days <= 0
                    ? LAUNCH.trialOneDayLeft
                    : days === 1
                      ? LAUNCH.trialDayLeft
                      : fill(LAUNCH.trialDaysLeft, { n: days })
                }`}
            </p>
          </div>
        </div>

        {state === 'pending' && (
          <p role="status" className="rounded-md bg-info-light p-sm text-body-sm text-text-primary">
            {LAUNCH.activationPending}
          </p>
        )}
        {(state === 'trial' || state === 'ended') && (
          <>
            <p className="text-body-sm text-text-secondary">
              {state === 'trial' ? LAUNCH.planTrialHint : LAUNCH.planEndedHint}
            </p>
            <div className="flex flex-wrap items-center gap-sm">
              <Button size="sm" onClick={() => setOpen(true)} data-testid="plan-request-activation">
                {LAUNCH.requestActivation}
              </Button>
              <Link
                to="/book-demo"
                className="inline-flex items-center gap-xxs text-label-md text-primary underline-offset-2 hover:underline"
              >
                <CalendarClock className="size-4" aria-hidden="true" />
                {LAUNCH.bookCall}
              </Link>
            </div>
          </>
        )}
      </div>
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
    </Card>
  );
}

export default PlanActivationCard;
