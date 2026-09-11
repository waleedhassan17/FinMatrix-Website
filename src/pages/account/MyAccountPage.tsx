import { Building2, LogOut, Settings, UserCircle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useSignOut } from '@/features/auth/useSignOut';
import { useFeature, useIsOwner } from '@/hooks/useCapability';
import { selectCompany, selectUser } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

/**
 * Who is signed in, for which company, as what — and the way out.
 *
 * Both roles. Nothing here is editable: there is no self-service profile or
 * password endpoint. Staff accounts are managed by the owner (Settings → Team),
 * so a forgotten password is a reset the owner performs.
 */
export default function MyAccountPage() {
  const user = useAppSelector(selectUser);
  const company = useAppSelector(selectCompany);
  const isOwner = useIsOwner();
  const multiUser = useFeature('multiUser');
  const { signOut } = useSignOut();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-lg">
      <div>
        <h1 className="text-h2 text-text-primary">My account</h1>
        <p className="text-body-sm text-text-secondary">Your sign-in and the company you are working in.</p>
      </div>

      <Card className="p-lg">
        <div className="flex items-center gap-md">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-tint text-primary">
            <UserCircle className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-h4 text-text-primary">{user?.displayName || user?.username || '—'}</p>
            <p className="text-body-sm text-text-secondary">{isOwner ? 'Owner' : 'Staff'}</p>
          </div>
        </div>
        <div className="mt-lg">
          <Row label="Username" value={user?.username || '—'} />
          <Row label="Email" value={user?.email || '—'} />
          <Row label="Phone" value={user?.phone || '—'} />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Company" />
        <div className="mt-md flex items-center gap-sm">
          <Building2 className="size-5 text-text-tertiary" />
          <p className="text-label-lg text-text-primary">{company?.name || '—'}</p>
          {company?.status && <StatusBadge status={company.status === 'approved' ? 'active' : company.status} />}
        </div>
      </Card>

      {isOwner ? (
        <Card className="flex flex-wrap gap-xs p-lg">
          <Button asChild variant="secondary">
            <Link to="/settings/company">
              <Settings className="size-4" />
              Company settings
            </Link>
          </Button>
          {multiUser && (
            <Button asChild variant="secondary">
              <Link to="/settings/users">
                <Users className="size-4" />
                Team
              </Link>
            </Button>
          )}
        </Card>
      ) : (
        <p className="rounded-md bg-surface-2 p-md text-body-sm text-text-secondary">
          Your account is managed by the company owner. If you forget your password, ask them to
          reset it from Settings → Team.
        </p>
      )}

      <div>
        <Button variant="secondary" onClick={signOut}>
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-md border-b border-border-light py-xs last:border-0">
      <span className="text-body-sm text-text-secondary">{label}</span>
      <span className="text-right text-body-sm text-text-primary break-all">{value}</span>
    </div>
  );
}
