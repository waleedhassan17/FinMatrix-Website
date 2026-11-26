import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { LAUNCH, LAUNCH_ERRORS } from '@/config/launchStrings';
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
      toast.success(LAUNCH.activationSent);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const known = code ? LAUNCH_ERRORS[code] : undefined;
      toast.error(known ? known : e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={LAUNCH.activationTitle}
      description={<span>{LAUNCH.activationBody}</span>}
      confirmLabel={busy ? LAUNCH.sending : LAUNCH.requestActivation}
      busy={busy}
      onConfirm={submit}
    >
      <div className="flex flex-col gap-md">
        <PlanPicker value={plan} onChange={setPlan} />
        <Textarea
          label={LAUNCH.noteLabel}
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
