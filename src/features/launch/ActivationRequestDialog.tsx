import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { dirProps, pick, useLang } from '@/i18n/lang';
import { LAUNCH, LAUNCH_ERRORS } from '@/i18n/launchStrings';
import { requestActivation } from '@/networks/launch/launchNetwork';
import { ApiError } from '@/networks/network/apiHelpers';

import { PlanPicker, UNSURE_PLAN } from './PlanPicker';

/**
 * "Request activation" — no online payment: the owner names the plan they
 * want and the FinMatrix team switches it on. Used on the trial-ended page,
 * the trial banner and Settings.
 */
export function ActivationRequestDialog({
  companyId,
  open,
  onOpenChange,
  onDone,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
}) {
  const lang = useLang();
  const [plan, setPlan] = useState(UNSURE_PLAN);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await requestActivation(companyId, {
        requestedPlan: plan,
        note: note.trim() || undefined,
      });
      toast.success(pick(LAUNCH.activationSent, lang));
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const known = code ? LAUNCH_ERRORS[code] : undefined;
      toast.error(known ? pick(known, lang) : e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={pick(LAUNCH.activationTitle, lang)}
      description={<span {...dirProps(lang)}>{pick(LAUNCH.activationBody, lang)}</span>}
      confirmLabel={busy ? pick(LAUNCH.sending, lang) : pick(LAUNCH.requestActivation, lang)}
      busy={busy}
      onConfirm={submit}
    >
      <div className="flex flex-col gap-md">
        <PlanPicker value={plan} onChange={setPlan} />
        <Textarea
          label={pick(LAUNCH.noteLabel, lang)}
          value={note}
          maxLength={1000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}

export default ActivationRequestDialog;
