import { AtSign, Building2, Mail, Pencil } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { RolePill } from '@/features/account/AccountParts';
import type { AuthUser, CompanyRef } from '@/types';
import { initialsOf } from '@/utils/initials';

/**
 * Who is signed in, at a glance: the same initials as the top bar, the name,
 * the role, how they sign in and the company they are working in. Its band is
 * the sidebar's navy; everything below it is plain settings, and
 * the detail (verified, company status) lives there rather than twice.
 */
export function AccountHero({
  user,
  name,
  isOwner,
  company,
  onEdit,
}: {
  user: AuthUser | null;
  name: string;
  isOwner: boolean;
  company: CompanyRef | null;
  onEdit?: () => void;
}) {
  const facts: ReactNode[] = [];
  if (isOwner && user?.email) {
    facts.push(
      <>
        <Mail className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 break-all">{user.email}</span>
      </>,
    );
  } else if (user?.username) {
    facts.push(
      <>
        <AtSign className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 break-all">{user.username}</span>
      </>,
    );
  }
  if (company?.name) {
    facts.push(
      <>
        <Building2 className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 break-words">{company.name}</span>
      </>,
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* The sidebar's own colours (--color-sidebar-from/-to, the tokens behind
          SIDEBAR_GRADIENT), so the band reads as part of the app's chrome. */}
      <div aria-hidden="true" className="h-16 bg-linear-to-b from-sidebar-from to-sidebar-to sm:h-20" />

      <div className="flex flex-col gap-md px-lg pb-lg sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-sm sm:flex-row sm:items-start sm:gap-md">
          <span
            aria-hidden="true"
            className="relative -mt-10 flex size-20 shrink-0 items-center justify-center rounded-full bg-primary-tint text-h2 text-primary shadow-card ring-4 ring-surface"
          >
            {initialsOf(name)}
          </span>

          <div className="min-w-0 sm:pt-sm">
            <div className="flex flex-wrap items-center gap-xs">
              <h2 className="min-w-0 break-words text-h2 text-text-primary">{name}</h2>
              <RolePill owner={isOwner} />
            </div>
            {facts.length > 0 && (
              <p className="mt-xs flex flex-wrap items-center gap-x-sm gap-y-xs text-body-sm text-text-secondary">
                {facts.map((fact, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <span aria-hidden="true" className="hidden size-1 rounded-full bg-border-strong sm:block" />
                    )}
                    <span className="inline-flex min-w-0 items-center gap-xxs">{fact}</span>
                  </Fragment>
                ))}
              </p>
            )}
          </div>
        </div>

        {onEdit && (
          <Button variant="secondary" size="sm" onClick={onEdit} className="w-full shrink-0 sm:mt-md sm:w-auto">
            <Pencil className="size-4" />
            Edit profile
          </Button>
        )}
      </div>
    </Card>
  );
}

export default AccountHero;
