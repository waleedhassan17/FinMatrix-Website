import { useMutation } from '@tanstack/react-query';
import { Download, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { migrationErrorMessage } from '@/config/migrationErrors';
import { canSignOff, ENTITY_LABEL, type AsTypedFigures, type CertificatePreview, type MigrationBatch } from '@/models/migration';
import type { ApiError } from '@/networks/network/apiHelpers';
import { downloadCertificate, dryRunMigration, signOffMigration } from '@/networks/settings/migrationNetwork';

import { useMigrationAction } from '../useMigration';

/**
 * Step 6: the certificate from a practice run, and spot checks the owner
 * compares with their old books. Sign off is enabled only when the certificate
 * is confirmed and every spot check is ticked.
 */
export function ReviewStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const [preview, setPreview] = useState<CertificatePreview | null>(null);
  const [ticked, setTicked] = useState<Set<number>>(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const dry = useMutation({
    mutationFn: () => dryRunMigration(batch.id),
    onSuccess: (r) => {
      setPreview(r.certificate);
      setTicked(new Set());
    },
    onError: (e: ApiError) => toast.error(migrationErrorMessage(e.code, e.message)),
  });
  const signOff = useMigrationAction(batch.id, () => signOffMigration(batch.id), { success: 'Signed off', onSuccess: onNext });

  useEffect(() => {
    if (batch.status === 'ready' && !preview && !dry.isPending) dry.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch.status]);

  return <ReviewView batch={batch} preview={preview} loading={dry.isPending} ticked={ticked} setTicked={setTicked} confirmed={confirmed} setConfirmed={setConfirmed} signing={signOff.isPending} onSignOff={() => signOff.mutate(undefined)} onNext={onNext} />;
}

/** The presentational half — what the tests render. */
export function ReviewView(props: {
  batch: MigrationBatch;
  preview: CertificatePreview | null;
  loading: boolean;
  ticked: Set<number>;
  setTicked: (s: Set<number>) => void;
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  signing: boolean;
  onSignOff: () => void;
  onNext: () => void;
}) {
  const { batch, preview, ticked } = props;
  const spot = preview?.spotChecks ?? [];
  const enabled = !!preview && canSignOff(batch, spot, ticked, props.confirmed) && !props.signing;
  const toggle = (i: number) => {
    const next = new Set(ticked);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    props.setTicked(next);
  };

  if (batch.signedOffAt) {
    return (
      <Card className="flex flex-col gap-md p-lg">
        <p className="text-body-sm text-text-primary">Signed off by {batch.signedOffBy?.name ?? 'you'} on {new Date(batch.signedOffAt).toLocaleString()}.</p>
        <div className="flex justify-end"><Button onClick={props.onNext}>Continue to import</Button></div>
      </Card>
    );
  }
  if (props.loading || !preview) {
    return (
      <Card className="flex items-center gap-sm p-lg">
        <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
        <p className="text-body-sm text-text-secondary">Running the practice import and preparing the certificate…</p>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader
          title="Certificate (preview)"
          right={
            <Button variant="secondary" size="sm" onClick={() => downloadCertificate(batch.id).catch(() => toast.error('The certificate could not be downloaded.'))}>
              <Download className="h-4 w-4" aria-hidden /> Download PDF
            </Button>
          }
        />
        <p className="text-body-sm text-text-secondary">
          {preview.allPassed ? 'All ten checks pass at zero difference, every figure read the same two ways.' : 'Some checks fail — go back to Check.'} {preview.rejectedTotal} row{preview.rejectedTotal === 1 ? '' : 's'} set aside, each with its reason.
        </p>
        <ul className="grid gap-xs sm:grid-cols-2">
          {preview.rowCounts.map((r) => (
            <li key={r.entity} className="text-caption text-text-secondary">
              <span className="text-label-md text-text-primary">{ENTITY_LABEL[r.entity] ?? r.entity}</span> · {r.source} rows: {r.imported} new, {r.merged} matched, {r.rejected} set aside
            </li>
          ))}
        </ul>
      </Card>
      {preview.asTyped && <AsTypedTables figures={preview.asTyped} />}
      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="Spot checks" />
        <p className="text-body-sm text-text-secondary">Look each one up in your old system. Tick it when the balance agrees.</p>
        <ul className="flex flex-col divide-y divide-border-light">
          {spot.map((s, i) => (
            <li key={`${s.kind}-${s.name}`} className="flex items-center justify-between gap-sm py-sm">
              <label className="flex min-w-0 items-center gap-sm">
                <input type="checkbox" checked={ticked.has(i)} onChange={() => toggle(i)} aria-label={`Spot check ${s.name}`} />
                <span className="truncate text-label-md text-text-primary">{s.name}</span>
                <span className="text-caption text-text-secondary">{s.kind} · {s.documents} open</span>
                {s.asTyped && s.asTyped.length > 0 && (
                  <span className="truncate text-caption text-text-secondary">As typed: {s.asTyped.join(' · ')}</span>
                )}
              </label>
              <span className="text-caption tabular text-text-secondary">
                Source {s.sourceBalance} · FinMatrix <span className={s.matches ? 'text-success' : 'text-danger'}>{s.finmatrixBalance}</span>
              </span>
            </li>
          ))}
          {spot.length === 0 && <li className="py-sm text-body-sm text-text-secondary">No open invoices or bills to spot-check.</li>}
        </ul>
        <label className="flex items-center gap-sm text-body-sm text-text-primary">
          <input type="checkbox" checked={props.confirmed} onChange={(e) => props.setConfirmed(e.target.checked)} aria-label="Confirm the certificate" />
          I have read the certificate and the figures match my records.
        </label>
      </Card>
      <div className="flex justify-end">
        <Button onClick={props.onSignOff} disabled={!enabled} aria-label="Sign off">
          {props.signing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Sign off
        </Button>
      </div>
    </div>
  );
}

/**
 * Before and after, figure by figure: the text exactly as it stood in the
 * file, what FinMatrix read it as, and what the books now hold. The owner
 * reads the first column against their old system.
 */
export function AsTypedTables({ figures }: { figures: AsTypedFigures }) {
  const dash = (v: string | null) => (v === null || v === '' ? '—' : v);
  const more = (n: number, what: string) =>
    n > 0 ? <p className="text-caption text-text-secondary">{n} more {what} not shown; every one is checked.</p> : null;
  const head = 'px-sm py-xs text-left text-overline text-text-secondary';
  const cell = 'px-sm py-xs text-caption text-text-primary';
  const num = `${cell} text-right tabular`;
  return (
    <Card className="flex flex-col gap-md p-lg">
      <SectionHeader title="Your figures, as you typed them" />
      <p className="text-body-sm text-text-secondary">
        Each figure exactly as it stands in your file, what FinMatrix read it as, and what your books will hold. A second, independent reader read every one again and agreed.
      </p>
      {figures.trialBalance.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Trial balance as typed">
            <thead><tr><th className={head}>Account</th><th className={head}>Debit as typed</th><th className={head}>Credit as typed</th><th className={head}>Read as</th><th className={head}>In FinMatrix</th></tr></thead>
            <tbody>
              {figures.trialBalance.map((r) => (
                <tr key={r.account} className="border-t border-border-light">
                  <td className={cell}>{r.account} {r.name}</td>
                  <td className={num}>{dash(r.debitText)}</td>
                  <td className={num}>{dash(r.creditText)}</td>
                  <td className={num}>{dash(r.readAs)}</td>
                  <td className={num}>{dash(r.posted)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {more(figures.more.trialBalance, 'accounts')}
        </div>
      )}
      {figures.openItems.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Open invoices and bills as typed">
            <thead><tr><th className={head}>Party</th><th className={head}>Document</th><th className={head}>Due as typed</th><th className={head}>Read as</th><th className={head}>Party balance</th></tr></thead>
            <tbody>
              {figures.openItems.map((r) => (
                <tr key={`${r.kind}-${r.document}`} className="border-t border-border-light">
                  <td className={cell}>{r.party}</td>
                  <td className={cell}>{r.kind === 'invoice' ? 'Invoice' : 'Bill'} {r.document}</td>
                  <td className={num}>{dash(r.asTyped)}</td>
                  <td className={num}>{dash(r.readAs)}</td>
                  <td className={num}>{dash(r.partyBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {more(figures.more.openItems, 'documents')}
        </div>
      )}
      {figures.stock.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full" aria-label="Stock as typed">
            <thead><tr><th className={head}>SKU</th><th className={head}>Quantity as typed</th><th className={head}>Cost as typed</th><th className={head}>Read as</th><th className={head}>On hand × cost</th></tr></thead>
            <tbody>
              {figures.stock.map((r) => (
                <tr key={r.sku} className="border-t border-border-light">
                  <td className={cell}>{r.sku}</td>
                  <td className={num}>{dash(r.quantityText)}</td>
                  <td className={num}>{dash(r.costText)}</td>
                  <td className={num}>{dash(r.readAs)}</td>
                  <td className={num}>{dash(r.onHand)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {more(figures.more.stock, 'items')}
        </div>
      )}
    </Card>
  );
}
