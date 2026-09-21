import { AgingReportView, useAgingReport } from '@/features/reports/AgingReportView';
import { getArAging } from '@/networks/reports/agingNetwork';

export default function ArAgingPage() {
  const aging = useAgingReport('ar-aging', getArAging);

  return (
    <AgingReportView
      title="AR Aging"
      subtitle="Who owes you, and how overdue each amount is."
      counterpartyHeader="Customer"
      csvName="ar-aging"
      emptyTitle="No outstanding receivables"
      emptyHint="Every customer invoice is settled."
      documentNoun="invoice"
      {...aging}
    />
  );
}
