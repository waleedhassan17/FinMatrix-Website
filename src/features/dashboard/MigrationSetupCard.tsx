// ═══════════════════════════════════════════════════════
// FinMatrix Web — "Bring your data from your old system"
// ═══════════════════════════════════════════════════════
// The first card on a new company's dashboard (after its trial starts): the
// Migration Center. Hidden once a migration is closed or the owner dismisses
// it — the server remembers the dismissal, so it stays gone on every device.

import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, DatabaseZap, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { LAUNCH } from '@/config/launchStrings';
import { dismissMigrationPrompt } from '@/networks/launch/launchNetwork';
import { selectCompanyId, selectIsOwner } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

export function MigrationSetupCard({ visible }: { visible: boolean }) {
  const isOwner = useAppSelector(selectIsOwner);
  const companyId = useAppSelector(selectCompanyId);
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(false);

  if (!visible || !isOwner || hidden) return null;

  const dismiss = async () => {
    setHidden(true);
    if (!companyId) return;
    try {
      await dismissMigrationPrompt(companyId);
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      setHidden(false);
    }
  };

  return (
    <section
      data-testid="migration-card"
      className="relative flex flex-col gap-sm rounded-xl border border-primary bg-primary-tint p-lg sm:flex-row sm:items-center sm:gap-lg"
     
    >
      <DatabaseZap className="size-8 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-label-lg text-text-primary">{LAUNCH.migrationCardTitle}</h2>
        <p className="mt-xxs text-body-sm text-text-secondary">{LAUNCH.migrationCardBody}</p>
      </div>
      <div className="flex flex-wrap gap-xs">
        <Button asChild>
          <Link to="/settings/migration">
            {LAUNCH.migrationCardCta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button variant="text" asChild>
          <Link to="/settings/migration/guide">
            <BookOpen className="size-4" aria-hidden="true" />
            {LAUNCH.migrationCardGuide}
          </Link>
        </Button>
      </div>
      <button
        type="button"
        onClick={() => void dismiss()}
        aria-label={LAUNCH.dismiss}
        className="absolute right-sm top-sm rounded-sm p-xxs text-text-tertiary hover:text-text-primary"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}

export default MigrationSetupCard;
