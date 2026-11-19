import { BookOpen, CheckCircle2, Circle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card, SectionHeader } from '@/components/ui/Card';
import { activeRoute, fileArrived, guideFor } from '@/config/migrationGuides';
import { openingDateOf, type MigrationBatch } from '@/models/migration';

const REQUIRED_LABEL = { yes: '', 'if-stock': ' (if you keep stock)', optional: ' (optional)' } as const;

/**
 * What this source must provide, ticked off as each file is recognised. Each
 * item still missing links to its step in the guide.
 */
export function ExportChecklist({ batch }: { batch: MigrationBatch }) {
  const guide = guideFor(batch.sourceSystem);
  if (!guide) return null;
  const files = batch.files ?? [];
  const route = activeRoute(guide, files);
  const items = guide.files.filter((f) => !route || !f.routes || f.routes.includes(route));
  const routeInfo = guide.routes?.find((r) => r.id === route);
  const guidePath = `/settings/migration/guide/${guide.source}`;
  const missing = items.filter((f) => f.required === 'yes' && !fileArrived(f, files));
  return (
    <Card className="flex flex-col gap-sm p-lg">
      <SectionHeader title={`From ${guide.title}`} />
      <p className="text-body-sm text-text-secondary">
        Export each file as of <span className="text-label-md text-text-primary">{openingDateOf(batch)}</span>, the day before your cutover.
        {routeInfo ? ` ${routeInfo.title}.` : ''}
      </p>
      <ul className="flex flex-col gap-xs">
        {items.map((f) => {
          const done = fileArrived(f, files);
          return (
            <li key={f.id} className="flex items-start gap-sm">
              {done ? (
                <CheckCircle2 className="mt-[2px] h-4 w-4 shrink-0 text-success" aria-label="received" />
              ) : (
                <Circle className="mt-[2px] h-4 w-4 shrink-0 text-text-secondary" aria-label="not yet" />
              )}
              <span className="flex flex-col">
                <span className="text-label-md text-text-primary">
                  {f.title}
                  {REQUIRED_LABEL[f.required]}
                </span>
                {!done && (
                  <Link to={`${guidePath}#file-${f.id}`} className="text-caption text-primary hover:underline">
                    How to export it
                  </Link>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <span className="text-caption text-text-secondary">
          {missing.length === 0 ? 'Every required file has arrived.' : `Still needed: ${missing.length} file${missing.length === 1 ? '' : 's'}.`}
        </span>
        <Link to={guidePath} className="flex items-center gap-xs text-label-md text-primary hover:underline">
          <BookOpen className="h-4 w-4" aria-hidden /> Step-by-step guide
        </Link>
      </div>
    </Card>
  );
}

export default ExportChecklist;
