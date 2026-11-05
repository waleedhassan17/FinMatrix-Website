import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useConnect } from '@/features/messaging/useConnect';
import { AgingReportView } from '@/features/reports/AgingReportView';
import { useAgingReport } from '@/features/reports/useAgingReport';
import { getArAging } from '@/networks/reports/agingNetwork';

export default function ArAgingPage() {
  const aging = useAgingReport('ar-aging', getArAging);
  // FinMatrix Connect: what the WhatsApp payment reminders are doing.
  const { enabled: connectOn } = useConnect();

  return (
    <AgingReportView
      title="AR Aging"
      subtitle="Who owes you, and how overdue each amount is."
      counterpartyHeader="Customer"
      csvName="ar-aging"
      emptyTitle="No outstanding receivables"
      emptyHint="Every customer invoice is settled."
      documentNoun="invoice"
      partyType="customer"
      actions={
        connectOn ? (
          <Button asChild variant="secondary" size="sm">
            <Link to="/reports/collections">
              <MessageCircle className="size-4" aria-hidden="true" />
              Collections on WhatsApp
            </Link>
          </Button>
        ) : undefined
      }
      {...aging}
    />
  );
}
