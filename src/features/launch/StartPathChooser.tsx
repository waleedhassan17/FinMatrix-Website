// ═══════════════════════════════════════════════════════
// FinMatrix Web — the last step of company setup: how to start
// ═══════════════════════════════════════════════════════
//   A. "Start my free trial" — instant when eligible (server decides).
//   B. "Request account approval" — a plan agreed with FinMatrix, or "not sure".
// Path A is shown disabled WITH the reason when the server says the account
// is not eligible, so a button that will fail is never offered. In
// SIGNUP_MODE=approval only path B is shown.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CalendarClock, Gift, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Field';
import { usePublicConfig } from '@/hooks/usePublicConfig';
import { dirProps, pick, useLang } from '@/i18n/lang';
import { fill, LAUNCH, LAUNCH_ERRORS } from '@/i18n/launchStrings';
import { authMe, authRefreshSession } from '@/networks/auth/authNetwork';
import {
  getTrialEligibility,
  requestApproval,
  startFreeTrial,
} from '@/networks/launch/launchNetwork';
import { setIdentity } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';

import { LangToggle } from './LangToggle';
import { PlanPicker, UNSURE_PLAN } from './PlanPicker';
import { reasonOf } from './reasonOf';

export function StartPathChooser({ companyId }: { companyId: string }) {
  const lang = useLang();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const config = usePublicConfig();
  const trialMode = config.signupMode === 'trial';

  const eligibility = useQuery({
    queryKey: ['trial-eligibility', companyId],
    queryFn: () => getTrialEligibility(companyId),
    enabled: trialMode,
    retry: false,
  });
  const [plan, setPlan] = useState(UNSURE_PLAN);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'trial' | 'approval' | null>(null);
  const [error, setError] = useState('');

  const eligible = eligibility.data?.eligible === true;
  const ineligibleReason = eligibility.data && !eligibility.data.eligible ? eligibility.data.reason : null;
  const ineligibleText = ineligibleReason
    ? LAUNCH_ERRORS[ineligibleReason]
      ? pick(LAUNCH_ERRORS[ineligibleReason], lang)
      : (lang === 'ur' ? eligibility.data?.messageUr : eligibility.data?.message) ?? ''
    : '';

  const refreshIdentity = async () => {
    await authRefreshSession();
    try {
      dispatch(setIdentity(await authMe()));
    } catch {
      /* the next screen re-reads it */
    }
    queryClient.removeQueries({ queryKey: ['trial-eligibility'] });
  };

  const explain = (e: unknown) => {
    const code = reasonOf(e);
    const known = code ? LAUNCH_ERRORS[code] : undefined;
    setError(known ? pick(known, lang) : e instanceof Error ? e.message : 'Something went wrong.');
  };

  const onTrial = async () => {
    setBusy('trial');
    setError('');
    try {
      const r = await startFreeTrial(companyId);
      await refreshIdentity();
      if (r.status === 'active') {
        toast.success(pick(LAUNCH.welcomeTrial, lang));
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/account-status', { replace: true });
      }
    } catch (e) {
      explain(e);
      void eligibility.refetch();
    } finally {
      setBusy(null);
    }
  };

  const onApproval = async () => {
    setBusy('approval');
    setError('');
    try {
      await requestApproval(companyId, {
        requestedPlan: plan,
        note: note.trim() || undefined,
      });
      await refreshIdentity();
      navigate('/account-status', { replace: true });
    } catch (e) {
      explain(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-lg" {...dirProps(lang)}>
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h2 className="text-display-sm text-text-primary">{pick(LAUNCH.chooseTitle, lang)}</h2>
          <p className="mt-xxs text-body-md text-text-secondary">{pick(LAUNCH.chooseSubtitle, lang)}</p>
        </div>
        <LangToggle />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm">
          <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
          <span className="text-body-sm text-danger">{error}</span>
        </div>
      )}

      <div className={`grid gap-md ${trialMode ? 'md:grid-cols-2' : ''}`}>
        {trialMode && (
          <article
            data-testid="path-trial"
            aria-disabled={!eligible}
            className={`flex flex-col gap-sm rounded-xl border p-lg ${
              eligible ? 'border-primary bg-primary-tint' : 'border-border-light bg-background-alt'
            }`}
          >
            <Gift className={`size-6 ${eligible ? 'text-primary' : 'text-text-tertiary'}`} />
            <h3 className="text-label-lg text-text-primary">
              {fill(pick(LAUNCH.trialCardTitle, lang), { days: config.trialDays })}
            </h3>
            <p className="text-body-sm text-text-secondary">{pick(LAUNCH.trialCardBody, lang)}</p>
            {!eligible && ineligibleText && (
              <p role="status" data-testid="trial-reason" className="rounded-md bg-warning-lighter p-sm text-body-sm text-text-primary">
                <span className="text-label-md">{pick(LAUNCH.trialUnavailable, lang)}: </span>
                {ineligibleText}
              </p>
            )}
            <p className="text-caption text-text-tertiary">{pick(LAUNCH.trialCardNote, lang)}</p>
            <Button
              className="mt-auto"
              onClick={onTrial}
              disabled={!eligible || busy !== null}
            >
              {busy === 'trial' ? pick(LAUNCH.starting, lang) : pick(LAUNCH.startTrial, lang)}
            </Button>
          </article>
        )}

        <article
          data-testid="path-approval"
          className="flex flex-col gap-sm rounded-xl border border-border-light bg-surface p-lg"
        >
          <ShieldCheck className="size-6 text-primary" />
          <h3 className="text-label-lg text-text-primary">{pick(LAUNCH.approvalCardTitle, lang)}</h3>
          <p className="text-body-sm text-text-secondary">{pick(LAUNCH.approvalCardBody, lang)}</p>
          <PlanPicker value={plan} onChange={setPlan} />
          <Textarea
            label={pick(LAUNCH.noteLabel, lang)}
            value={note}
            maxLength={1000}
            rows={2}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            className="mt-auto"
            variant={trialMode && eligible ? 'secondary' : 'primary'}
            onClick={onApproval}
            disabled={busy !== null}
          >
            {busy === 'approval' ? pick(LAUNCH.sending, lang) : pick(LAUNCH.requestApproval, lang)}
          </Button>
        </article>
      </div>

      <Link to="/book-demo" className="inline-flex items-center gap-xs text-label-md text-primary">
        <CalendarClock className="size-4" />
        {pick(LAUNCH.orBookDemo, lang)}
      </Link>
    </section>
  );
}

export default StartPathChooser;
