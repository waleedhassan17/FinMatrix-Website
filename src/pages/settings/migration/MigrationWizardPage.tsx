import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { sourceById, supportReference } from '@/config/migrationSources';
import { AskForHelpButton } from '@/features/migration/AskForHelpButton';
import { ReadinessScore } from '@/features/migration/ReadinessScore';
import { CheckStep } from '@/features/migration/steps/CheckStep';
import { FixStep } from '@/features/migration/steps/FixStep';
import { ImportStep } from '@/features/migration/steps/ImportStep';
import { MatchStep } from '@/features/migration/steps/MatchStep';
import { ReviewStep } from '@/features/migration/steps/ReviewStep';
import { StartStep } from '@/features/migration/steps/StartStep';
import { UploadStep } from '@/features/migration/steps/UploadStep';
import { useMigrationBatch } from '@/features/migration/useMigration';
import { WizardStepper } from '@/features/migration/WizardStepper';
import { maxReachableStep, MIGRATION_STATUS_LABEL } from '@/models/migration';
import type { ApiError } from '@/networks/network/apiHelpers';

/**
 * The seven-step Migration Center wizard. Progress lives on the server: the
 * page opens on the step the batch's status says, so leaving and coming back
 * resumes where the owner was.
 */
export default function MigrationWizardPage() {
  const { id = '' } = useParams();
  const batch = useMigrationBatch(id);
  // The owner's chosen step holds only while the batch stays where it was:
  // when the server moves it on (or back after a fix) the wizard follows.
  const [chosen, setChosen] = useState<{ key: string; step: number } | null>(null);
  const reachable = batch.data ? maxReachableStep(batch.data) : 1;
  const stateKey = batch.data ? `${batch.data.status}:${batch.data.issues.blocking}` : '';
  const step = chosen && chosen.key === stateKey ? chosen.step : null;
  const setStep = (s: number) => setChosen({ key: stateKey, step: s });

  if (batch.isLoading) return <Card className="p-lg"><div className="h-40 animate-pulse rounded-md bg-neutral-100" /></Card>;
  if (batch.error || !batch.data) {
    return (
      <Card className="p-lg">
        <p className="text-body-sm text-danger">{migrationErrorMessage((batch.error as ApiError | null)?.code, batch.error?.message)}</p>
      </Card>
    );
  }
  const b = batch.data;
  const current = Math.min(step ?? b.step, Math.max(reachable, 1));
  const go = (s: number) => setStep(Math.min(s, Math.max(reachable, s === current + 1 ? current + 1 : reachable)));

  return (
    <div className="flex flex-col gap-lg">
      <div className="flex flex-col gap-md md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <Link to="/settings/migration" className="flex items-center gap-xs text-caption text-text-secondary hover:text-text-primary">
            <ArrowLeft className="h-3 w-3" aria-hidden /> All migrations
          </Link>
          <h1 className="text-h2 text-text-primary">Move to FinMatrix</h1>
          <p className="flex flex-wrap items-center gap-sm text-body-sm text-text-secondary">
            {sourceById(b.sourceSystem)?.label ?? b.sourceSystem} · cutover {b.cutoverDate} · {supportReference(b.id)}
            <StatusBadge status={b.status} label={MIGRATION_STATUS_LABEL[b.status]} />
          </p>
        </div>
        <div className="flex items-center gap-md">
          <ReadinessScore value={b.readiness} />
          <AskForHelpButton batchId={b.id} />
        </div>
      </div>
      <WizardStepper current={current} reachable={reachable} onSelect={setStep} />
      {b.lastError && <Card className="p-md"><p className="text-body-sm text-danger">{b.lastError}</p></Card>}
      {current === 1 && <StartStep batch={b} onNext={() => go(2)} />}
      {current === 2 && <UploadStep batch={b} onNext={() => go(3)} />}
      {current === 3 && <MatchStep batch={b} onNext={() => go(b.issues.blocking > 0 ? 4 : 5)} />}
      {current === 4 && <FixStep batch={b} onNext={() => go(5)} />}
      {current === 5 && <CheckStep batch={b} onNext={() => go(6)} />}
      {current === 6 && <ReviewStep batch={b} onNext={() => go(7)} />}
      {current === 7 && <ImportStep batch={b} />}
    </div>
  );
}
