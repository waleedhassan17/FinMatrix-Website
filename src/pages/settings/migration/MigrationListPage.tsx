import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { DateField } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { MIGRATION_SOURCES, sourceById, type MigrationSourceSystem } from '@/config/migrationSources';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { MIGRATION_STATUS_LABEL } from '@/models/migration';
import type { ApiError } from '@/networks/network/apiHelpers';
import { createMigration, listMigrations } from '@/networks/settings/migrationNetwork';

/** "Move to FinMatrix": the owner's migrations, and starting a new one. Owner only. */
export default function MigrationListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [source, setSource] = useState<MigrationSourceSystem>('finmatrix_template');
  const [cutover, setCutover] = useState('');
  const list = useQuery({ queryKey: ['migrations'], queryFn: listMigrations });
  const start = useMutation({
    mutationFn: () => createMigration({ sourceSystem: source, cutoverDate: cutover }),
    onSuccess: (b) => {
      void queryClient.invalidateQueries({ queryKey: ['migrations'] });
      navigate(`/settings/migration/${b.id}`);
    },
    onError: (e: ApiError) => toast.error(migrationErrorMessage(e.code, e.message)),
  });

  return (
    <div className="flex flex-col gap-lg">
      <SettingsTabs />
      <div>
        <h1 className="text-h2 text-text-primary">Move to FinMatrix</h1>
        <p className="text-body-sm text-text-secondary">
          Bring your books in from Excel, Tally or another system. We check every balance to the rupee and show you a certificate before anything is posted.
        </p>
      </div>

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Start a migration" />
        <div className="grid gap-md md:grid-cols-2">
          <Select label="Where are your books now?" value={source} options={MIGRATION_SOURCES.map((s) => ({ value: s.id, label: s.label }))} onChange={(v) => setSource(v as MigrationSourceSystem)} />
          <DateField label="Cutover date" value={cutover} onChange={setCutover} hint="Your balances as they stood at the start of this day. FinMatrix closes the books before it." />
        </div>
        <p className="text-caption text-text-secondary">{sourceById(source)?.description}</p>
        <div className="flex justify-end">
          <Button onClick={() => start.mutate()} disabled={!cutover || start.isPending}>
            <Plus className="h-4 w-4" aria-hidden /> Start migration
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Your migrations" />
        {list.isLoading ? (
          <div className="h-24 animate-pulse rounded-md bg-neutral-100" />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-body-sm text-text-secondary">None yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border-light">
            {(list.data ?? []).map((b) => (
              <li key={b.id}>
                <Link to={`/settings/migration/${b.id}`} className="flex items-center justify-between gap-sm py-md hover:bg-surface-hover">
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-sm">
                      <span className="text-label-md text-text-primary">{sourceById(b.sourceSystem)?.label ?? b.sourceSystem}</span>
                      <StatusBadge status={b.status} label={MIGRATION_STATUS_LABEL[b.status]} />
                    </span>
                    <span className="text-caption text-text-secondary">Cutover {b.cutoverDate} · readiness {b.readiness}% · started {new Date(b.createdAt).toLocaleDateString()}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
