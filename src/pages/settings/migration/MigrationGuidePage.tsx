import { ArrowLeft, ExternalLink, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { AFTER_UPLOAD, guideFor, MIGRATION_GUIDES, type GuideFile } from '@/config/migrationGuides';

const REQUIRED_LABEL = { yes: 'Required', 'if-stock': 'If you keep stock', optional: 'Optional' } as const;

/**
 * The step-by-step guide for one source system: before you start, which files
 * to export (per version), what FinMatrix does with them, common problems.
 * Printable. Owner only, like the rest of the Migration Center.
 */
export default function MigrationGuidePage() {
  const { source = '' } = useParams();
  const { hash } = useLocation();
  const guide = guideFor(source);
  const versionsInSteps = guide ? [...new Set(guide.files.flatMap((f) => f.how.map((h) => h.versions)))] : [];
  // ?v=<version> opens the guide on that version's steps (shareable).
  const [params, setParams] = useSearchParams();
  const asked = params.get('v');
  const [version, setVersionState] = useState(asked && versionsInSteps.includes(asked) ? asked : (versionsInSteps[0] ?? ''));
  const setVersion = (v: string) => {
    setVersionState(v);
    setParams((p) => {
      p.set('v', v);
      return p;
    }, { replace: true });
  };

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash]);

  if (!guide) {
    return (
      <div className="flex flex-col gap-lg">
        <BackLink />
        <h1 className="text-h2 text-text-primary">Migration guides</h1>
        <Card className="flex flex-col gap-sm p-lg">
          {MIGRATION_GUIDES.map((g) => (
            <Link key={g.source} to={`/settings/migration/guide/${g.source}`} className="text-label-md text-primary hover:underline">
              {g.title}
            </Link>
          ))}
        </Card>
      </div>
    );
  }

  const stepsFor = (f: GuideFile) => f.how.find((h) => h.versions === version) ?? f.how[0];

  return (
    <div className="flex flex-col gap-lg print:gap-md">
      <div className="print:hidden">
        <BackLink />
      </div>
      <div className="flex flex-col gap-sm md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-h2 text-text-primary">Moving from {guide.title}</h1>
          <p className="text-body-sm text-text-secondary">{guide.summary}</p>
          <p className="mt-xs text-caption text-text-secondary">
            {guide.status === 'ready'
              ? 'Status: ready — proven end to end.'
              : 'Status: guided — FinMatrix reads these exports as documented by the vendor; our support team checks your files with you before you import.'}
          </p>
        </div>
        <Button variant="secondary" className="print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden /> Print
        </Button>
      </div>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="1. Find your version" />
        <p className="text-body-sm text-text-secondary">{guide.findVersion}</p>
        <p className="text-body-sm text-text-primary">Covered: {guide.versions.join(' · ')}</p>
        {versionsInSteps.length > 1 && (
          <div className="max-w-[24rem] print:hidden">
            <Select label="Show the steps for" value={version} options={versionsInSteps.map((v) => ({ value: v, label: v }))} onChange={setVersion} />
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="2. Before you start" />
        <ol className="list-decimal pl-lg text-body-sm text-text-primary">
          {guide.before.map((s) => (
            <li key={s} className="py-[2px]">
              {s}
            </li>
          ))}
        </ol>
      </Card>

      {guide.routes?.length ? (
        <Card className="flex flex-col gap-sm p-lg">
          <SectionHeader title="Two ways in" />
          <ul className="flex flex-col gap-xs text-body-sm">
            {guide.routes.map((r) => (
              <li key={r.id}>
                <span className="text-label-md text-text-primary">{r.title}</span>
                <span className="text-text-secondary"> — {r.when}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title="3. Export these files" />
        {guide.files.map((f, i) => {
          const how = stepsFor(f);
          return (
            <section key={f.id} id={`file-${f.id}`} className="flex scroll-mt-lg flex-col gap-xs border-t border-border-light pt-md first:border-t-0 first:pt-0">
              <h3 className="text-label-lg text-text-primary">
                {String.fromCharCode(97 + i)}. {f.title}
                <span className="ml-sm text-caption text-text-secondary">
                  {REQUIRED_LABEL[f.required]}
                  {f.routes ? ` · route ${f.routes.map((r) => (guide.routes?.findIndex((x) => x.id === r) === 0 ? 'A' : 'B')).join(' and ')}` : ''}
                </span>
              </h3>
              <p className="text-body-sm text-text-secondary">{f.gives}</p>
              {f.how.length > 1 && <p className="text-caption text-text-secondary">Steps for {how.versions}:</p>}
              <ol className="list-decimal pl-lg text-body-sm text-text-primary">
                {how.steps.map((s) => (
                  <li key={s} className="py-[2px]">
                    {s}
                  </li>
                ))}
              </ol>
              {f.settings?.length ? (
                <ul className="list-disc pl-lg text-caption text-text-secondary">
                  {f.settings.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </Card>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="4. Upload and check" />
        <ol className="list-decimal pl-lg text-body-sm text-text-primary">
          <li className="py-[2px]">Settings → Move to FinMatrix → choose “{guide.title}” and your cutover date → Start migration.</li>
          <li className="py-[2px]">Upload step: drop every file. Each is ticked off as FinMatrix recognises it; large files go up in pieces and resume if the connection drops.</li>
          {AFTER_UPLOAD.map((s) => (
            <li key={s} className="py-[2px]">
              {s}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="5. Common problems" />
        <dl className="flex flex-col gap-sm text-body-sm">
          {guide.problems.map((p) => (
            <div key={p.problem}>
              <dt className="text-label-md text-text-primary">{p.problem}</dt>
              <dd className="text-text-secondary">{p.fix}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card className="flex flex-col gap-sm p-lg">
        <SectionHeader title="6. After the import" />
        <ul className="list-disc pl-lg text-body-sm text-text-primary">
          <li className="py-[2px]">Keep the certificate (Import step → Download certificate). Compare its trial balance with your old system's.</li>
          <li className="py-[2px]">From the cutover day, enter everything in FinMatrix. Stop entering in the old system.</li>
          <li className="py-[2px]">Until you close the migration you can undo it in one step, as long as nothing new depends on it.</li>
        </ul>
      </Card>

      {guide.references.length > 0 && (
        <Card className="flex flex-col gap-xs p-lg">
          <SectionHeader title="Vendor documentation" />
          {guide.references.map((r) => (
            <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-xs text-body-sm text-primary hover:underline">
              <ExternalLink className="h-3 w-3" aria-hidden /> {r.label}
            </a>
          ))}
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link to="/settings/migration" className="flex items-center gap-xs text-caption text-text-secondary hover:text-text-primary">
      <ArrowLeft className="h-3 w-3" aria-hidden /> Move to FinMatrix
    </Link>
  );
}
