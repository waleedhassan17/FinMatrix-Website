import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { MIGRATION_SUPPORT, supportReference } from '@/config/migrationSources';

/**
 * Copies the migration's support reference and opens an email to support.
 * Read-only partner access is out of scope for this build.
 */
export function AskForHelpButton({ batchId }: { batchId: string }) {
  const ref = supportReference(batchId);
  const onClick = async () => {
    try {
      await navigator.clipboard?.writeText(ref);
      toast.success('Reference copied', { description: `${ref} — quote it when you write to us.` });
    } catch {
      toast.info(`Your reference is ${ref}`);
    }
    const subject = encodeURIComponent(MIGRATION_SUPPORT.subject(batchId));
    const body = encodeURIComponent(`Reference: ${ref}\n\nWhat I need help with:\n`);
    window.open(`mailto:${MIGRATION_SUPPORT.email}?subject=${subject}&body=${body}`, '_blank', 'noopener');
  };
  return (
    <Button variant="text" size="sm" onClick={onClick} aria-label="Ask for help">
      <LifeBuoy className="h-4 w-4" aria-hidden />
      Ask for help
    </Button>
  );
}

export default AskForHelpButton;
