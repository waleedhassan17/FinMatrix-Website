import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { PartySummaryPanel, type SummaryPartyRecord } from '@/features/documents/PartySummaryPanel';
import { getVendorById } from '@/networks/purchases/vendorNetwork';
import { getCustomerById } from '@/networks/sales/customerNetwork';

export interface AgingPartyActionsProps {
  partyId: string;
  partyType: 'customer' | 'vendor';
}

/**
 * From an aging row to the party: its outstanding (or payables) summary — the
 * same panel the customer and vendor pages open — and the party's own page.
 *
 * The summary needs the full record to build the document it sends, so the
 * record is fetched when the summary is asked for, not for every row.
 */
export function AgingPartyActions({ partyId, partyType }: AgingPartyActionsProps) {
  const [open, setOpen] = useState(false);
  // The same keys the customer and vendor pages use, so either cache serves both.
  const customer = useQuery({
    queryKey: ['customers', partyId],
    queryFn: () => getCustomerById(partyId),
    enabled: open && partyType === 'customer',
  });
  const vendor = useQuery({
    queryKey: ['vendors', partyId],
    queryFn: () => getVendorById(partyId),
    enabled: open && partyType === 'vendor',
  });
  const record = partyType === 'customer' ? customer : vendor;
  const party: SummaryPartyRecord | null =
    partyType === 'customer'
      ? customer.data
        ? { type: 'customer', record: customer.data.customer }
        : null
      : vendor.data
        ? { type: 'vendor', record: vendor.data }
        : null;
  const label = partyType === 'customer' ? 'Outstanding summary' : 'Payables summary';
  const pageHref = `/${partyType === 'customer' ? 'customers' : 'vendors'}/${encodeURIComponent(partyId)}`;

  return (
    <div className="flex flex-wrap items-center gap-sm">
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)} disabled={open && record.isLoading}>
        <FileText className="size-4" aria-hidden="true" />
        {open && record.isLoading ? 'Opening…' : label}
      </Button>
      <Link to={pageHref} className="inline-flex items-center gap-xxs text-label-md text-text-link hover:underline">
        Open {partyType}
        <ExternalLink className="size-3.5" aria-hidden="true" />
      </Link>
      {party && <PartySummaryPanel open={open} onOpenChange={setOpen} party={party} />}
    </div>
  );
}

export default AgingPartyActions;
