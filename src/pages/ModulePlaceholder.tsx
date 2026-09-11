import { Compass } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

/**
 * The catch-all for a path no screen answers.
 *
 * This used to name the build module a path belonged to, while modules were
 * still being built. Every module is built now, so anything reaching here is
 * a mistyped or stale link — and saying "coming soon" about it would be false.
 *
 * It sits inside the route guard, so a staff member reaching an owner-only path
 * is redirected before ever seeing this.
 */
export default function ModulePlaceholder() {
  const { pathname } = useLocation();

  return (
    <Card className="mx-auto max-w-[32rem] p-xxl text-center">
      <Compass className="mx-auto size-10 text-text-tertiary" />
      <h1 className="mt-md text-h3 text-text-primary">Page not found</h1>
      <p className="mt-xs text-body-md text-text-secondary">
        There is nothing at this address. The link may be mistyped, or the page may have moved.
      </p>
      <p className="mt-xs text-caption break-all text-text-tertiary">{pathname}</p>
      <Button asChild variant="secondary" className="mt-lg">
        <Link to="/dashboard">Back to dashboard</Link>
      </Button>
    </Card>
  );
}
