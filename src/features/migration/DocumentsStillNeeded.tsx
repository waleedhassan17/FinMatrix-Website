import { AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Card } from '@/components/ui/Card';
import type { GuideFile } from '@/config/migrationGuides';

import type { DocumentGateState } from './useDocumentGate';

/**
 * What must still be uploaded before the wizard moves on, each linked to its
 * export steps; and, for a company that keeps stock, the owner's way to say
 * there is no stock to bring in.
 */
export function DocumentsStillNeeded({ gate, source, where }: { gate: DocumentGateState; source: string; where: 'upload' | 'match' }) {
  const stockCounts = gate.keepsStock && gate.stockMissing.length > 0;
  if (gate.missing.length === 0 && !stockCounts) return null;
  const guidePath = `/settings/migration/guide/${source}`;
  const needed: GuideFile[] = [...gate.missing, ...(stockCounts && !gate.noStock ? gate.stockMissing : [])];
  return (
    <Card className="flex flex-col gap-sm border-warning p-lg" role="status" aria-live="polite">
      {needed.length > 0 && (
        <>
          <span className="flex items-center gap-sm text-label-md text-text-primary">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
            {needed.length === 1 ? 'One more document is needed' : `${needed.length} more documents are needed`} before you continue
          </span>
          <ul className="flex flex-col gap-xs pl-lg">
            {needed.map((f) => (
              <li key={f.id} className="text-body-sm text-text-primary">
                {f.title}{' '}
                <Link to={`${guidePath}#file-${f.id}`} className="text-caption text-primary hover:underline">
                  How to export it
                </Link>
              </li>
            ))}
          </ul>
          {where === 'upload' && gate.unplaced.length > 0 && (
            <p className="text-caption text-text-secondary">
              FinMatrix could not tell what {gate.unplaced.length === 1 ? `“${gate.unplaced[0]}” holds` : `${gate.unplaced.length} sheets hold`}. If it is one of these documents, continue to matching and choose what it is.
            </p>
          )}
          {where === 'match' && (
            <p className="text-caption text-text-secondary">Upload them on the Upload step, or, if one of your sheets is one of them, choose that sheet&apos;s type above.</p>
          )}
        </>
      )}
      {stockCounts && (
        <label className="flex items-center gap-xs text-body-sm text-text-primary">
          <input type="checkbox" checked={gate.noStock} onChange={(e) => gate.setNoStock(e.target.checked)} />
          We have no stock to bring in{gate.noStock ? '' : ` (skip ${gate.stockMissing.map((f) => f.title).join(' and ')})`}
        </label>
      )}
    </Card>
  );
}

export default DocumentsStillNeeded;
