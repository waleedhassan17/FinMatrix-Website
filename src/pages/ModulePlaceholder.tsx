import { Construction } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * Stands in for a route whose module has not been built yet.
 *
 * The nav is complete because it IS the deliverable of the shell module —
 * checking that admin and staff see different navigation is only possible with
 * every entry present. But a link that silently bounced you back to the
 * dashboard would read as a bug, so the unbuilt ones say so plainly and name
 * the pass that will fill them in.
 *
 * This is not a "coming soon" stub in the sense the app's history warns about:
 * those hid live endpoints behind fake screens. Nothing is hidden here.
 */

const MODULE_OF: Array<[string, string]> = [
  ['/customers', 'Customers — module 4'],
  ['/invoices', 'Invoices — module 5'],
  ['/estimates', 'Estimates — module 6'],
  ['/sales-orders', 'Sales Orders — module 7'],
  ['/payments/receive', 'Receive Payments — module 8'],
  ['/credit-memos', 'Credit Memos — module 9'],
  ['/vendors', 'Vendors — module 10'],
  ['/bills/pay', 'Pay Bills — module 12'],
  ['/bills', 'Bills — module 11'],
  ['/purchase-orders', 'Purchase Orders — module 13'],
  // Modules 14-20 and 22-23 are built and routed, so they never reach this
  // screen. Their entries are gone rather than left to tell a future reader they
  // are still to do.
  ['/employees', 'Payroll — module 21'],
  ['/payroll', 'Payroll — module 21'],
  ['/budgets', 'Budgets — module 21'],
  ['/settings', 'Settings & Users — module 24'],
  ['/account', 'My Account — module 24'],
];

export default function ModulePlaceholder() {
  const { pathname } = useLocation();
  const match = MODULE_OF.find(([prefix]) => pathname.startsWith(prefix));

  return (
    <Card className="mx-auto max-w-[32rem] p-xxl text-center">
      <Construction className="mx-auto size-10 text-text-tertiary" />
      <h1 className="mt-md text-h3 text-text-primary">
        {match ? match[1] : 'Not built yet'}
      </h1>
      <p className="mt-xs text-body-md text-text-secondary">
        This screen arrives in a later pass. The navigation, permissions and API
        client it will sit on are already in place.
      </p>
      <p className="mt-xs text-caption text-text-tertiary">{pathname}</p>
      <Button asChild variant="secondary" className="mt-lg">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </Card>
  );
}
