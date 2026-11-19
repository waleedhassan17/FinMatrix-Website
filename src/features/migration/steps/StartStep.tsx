import { BookOpen, Download, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { guideFor } from '@/config/migrationGuides';
import { sourceById } from '@/config/migrationSources';
import type { MigrationBatch } from '@/models/migration';
import { downloadStarterWorkbook } from '@/networks/settings/migrationNetwork';

/** Step 1: what this migration is, what to export, and the starter workbook. */
export function StartStep({ batch, onNext }: { batch: MigrationBatch; onNext: () => void }) {
  const source = sourceById(batch.sourceSystem);
  const guide = guideFor(batch.sourceSystem);
  const files = guide ? guide.files.filter((f) => f.required !== 'optional' && (!f.routes || f.routes.includes(guide.routes?.[0]?.id ?? ''))).map((f) => f.title) : (source?.files ?? []);
  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md p-lg">
        <SectionHeader title={`Moving from ${source?.label ?? batch.sourceSystem}`} />
        <p className="text-body-sm text-text-secondary">
          Your opening balances, open invoices and bills, and stock will be brought in as they stood at the start of{' '}
          <span className="text-label-md text-text-primary">{batch.cutoverDate}</span> (the close of business the day before). Anything dated on or after that day is entered in FinMatrix. Everything is checked to the rupee before anything is posted.
        </p>
        <div>
          <p className="text-label-md text-text-primary">Files to prepare</p>
          <ul className="mt-xs list-disc pl-lg text-body-sm text-text-secondary">
            {files.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-sm">
          <Button
            variant="secondary"
            onClick={() => downloadStarterWorkbook(batch.cutoverDate).catch(() => toast.error('The starter workbook could not be downloaded.'))}
          >
            <Download className="h-4 w-4" aria-hidden />
            Download starter workbook
          </Button>
          {guide && (
            <Button variant="text" asChild>
              <Link to={`/settings/migration/guide/${guide.source}`}>
                <BookOpen className="h-4 w-4" aria-hidden />
                Step-by-step guide: {guide.title}
              </Link>
            </Button>
          )}
        </div>
      </Card>
      <Card className="flex gap-md p-lg">
        <FlaskConical className="mt-[2px] h-5 w-5 shrink-0 text-primary" aria-hidden />
        <div>
          <p className="text-label-md text-text-primary">Try a practice run first</p>
          <p className="text-body-sm text-text-secondary">
            The Check and Review steps run the whole import as a practice — every posting, every check — and then undo it. Nothing reaches your books until you sign off and press Import.
          </p>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button onClick={onNext}>Continue to upload</Button>
      </div>
    </div>
  );
}
