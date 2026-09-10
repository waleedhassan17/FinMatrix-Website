import { AgingReportView, useAgingQuery } from '@/features/reports/AgingReportView';
import { getApAging } from '@/networks/reports/agingNetwork';

export default function ApAgingPage() {
  const query = useAgingQuery('ap-aging', getApAging);

  return (
    <AgingReportView
      title="AP Aging"
      subtitle="Who you owe, and how late you are."
      // The payload reuses the receivables field names, so `customerName` holds a
      // vendor here. Relabelled at the boundary rather than renamed in the
      // serializer, which does not own the API's vocabulary.
      counterpartyHeader="Vendor"
      csvName="ap-aging"
      emptyTitle="No outstanding payables"
      emptyHint="Every supplier bill is settled."
      query={query}
    />
  );
}
