import { Mail, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';

import { RailSection } from '@/components/layout/DetailLayout';
import { KeyValueList, type KeyValueItem } from '@/components/ui/KeyValueList';
import { Skeleton } from '@/components/ui/Skeleton';
import type { DocParty } from '@/features/documents/documentModel';

/** The other party on a document, in the rail: name, contact links, address. */
export function PartyCard({
  title,
  to,
  party,
  loading,
  extra = [],
}: {
  title: string;
  to: string;
  party: DocParty | null;
  /** True while the full record is still arriving — the name is already known. */
  loading?: boolean;
  extra?: KeyValueItem[];
}) {
  // The "phone · email" line is shown below as links instead; every other line
  // (company, attention, address, NTN) stays as text.
  const contactLine = [party?.phone, party?.email].filter(Boolean).join(' · ');
  const lines = (party?.lines ?? []).filter((line) => !contactLine || line !== contactLine);
  const visibleExtra = extra.filter((e) => !e.hidden);

  return (
    <RailSection
      title={title}
      action={
        <Link to={to} className="text-label-md text-primary hover:underline">
          View
        </Link>
      }
    >
      <p className="break-words text-label-lg text-text-primary">{party?.name || '—'}</p>

      {loading ? (
        <div className="mt-xs flex flex-col gap-xxs">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <>
          {lines.length > 0 && (
            <div className="mt-xxs">
              {lines.map((line) => (
                <p key={line} className="break-words text-body-sm text-text-secondary">
                  {line}
                </p>
              ))}
            </div>
          )}
          {(party?.email || party?.phone) && (
            <div className="mt-sm flex flex-col gap-xxs">
              {party?.email && (
                <a
                  href={`mailto:${party.email}`}
                  className="inline-flex min-w-0 items-center gap-xs text-body-sm text-primary hover:underline"
                >
                  <Mail className="size-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{party.email}</span>
                </a>
              )}
              {party?.phone && (
                <a
                  href={`tel:${party.phone.replace(/[^\d+]/g, '')}`}
                  className="inline-flex items-center gap-xs text-body-sm text-primary hover:underline"
                >
                  <Phone className="size-4 shrink-0" aria-hidden="true" />
                  {party.phone}
                </a>
              )}
            </div>
          )}
          {visibleExtra.length > 0 && (
            <KeyValueList items={visibleExtra} className="mt-sm border-t border-border-light pt-sm" />
          )}
        </>
      )}
    </RailSection>
  );
}

export default PartyCard;
