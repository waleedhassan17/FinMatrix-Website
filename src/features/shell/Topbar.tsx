import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Building2, LogOut, Menu, Search, UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import { useSignOut } from '@/features/auth/useSignOut';
import {
  fetchNotifications,
  fetchUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/networks/notifications/notificationsNetwork';
import { selectCompany, selectUser } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';

const menuPanel =
  'z-50 min-w-56 rounded-lg border border-border bg-surface p-xxs shadow-md';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const user = useAppSelector(selectUser);
  const company = useAppSelector(selectCompany);
  const { signOut } = useSignOut();
  const queryClient = useQueryClient();

  const { data: unread = 0 } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: fetchUnreadCount,
    refetchInterval: 60_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => fetchNotifications({ limit: 10 }),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['notifications'] });

  const readOne = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  });
  const readAll = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  });

  const initials = (user?.displayName ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-md border-b border-border bg-surface px-md lg:px-lg">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="rounded-lg p-xs text-text-secondary hover:bg-surface-hover lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </button>

      <div className="relative hidden max-w-[28rem] flex-1 sm:block">
        <Search className="pointer-events-none absolute left-sm top-1/2 size-4 -translate-y-1/2 text-text-tertiary" />
        <input
          type="search"
          placeholder="Search customers, invoices, bills…"
          className="h-10 w-full rounded-md border border-border bg-background pl-[38px] pr-sm text-body-sm text-text-primary outline-none placeholder:text-text-tertiary focus:border-primary"
        />
      </div>

      <div className="ml-auto flex items-center gap-xs">
        {/* The active company, read-only.

            There is no switcher here, and that is not an omission. The server
            resolves tenancy from the JWT, not from a header, and offers no
            token-exchange endpoint — so switching company genuinely requires a
            new sign-in. The app ships a switcher that only writes local state
            and does not re-scope anything; reproducing that would be
            reproducing a bug. */}
        {company?.name && (
          <div className="mr-xs hidden items-center gap-xs rounded-md bg-background px-sm py-xs md:flex">
            <Building2 className="size-4 text-text-tertiary" />
            <span className="text-label-md text-text-secondary">
              {company.name}
            </span>
          </div>
        )}

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="relative rounded-lg p-xs text-text-secondary hover:bg-surface-hover"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute right-0 top-0 min-w-4 rounded-full bg-danger px-[3px] text-center text-label-sm leading-4 text-white tabular">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={cn(menuPanel, 'w-80')}
            >
              <div className="flex items-center justify-between px-sm py-xs">
                <span className="text-overline text-text-secondary">
                  Notifications
                </span>
                {unread > 0 && (
                  <button
                    type="button"
                    onClick={() => readAll.mutate()}
                    className="text-label-md text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="px-sm py-md text-body-sm text-text-tertiary">
                    Nothing new.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => !n.isRead && readOne.mutate(n.id)}
                      className={cn(
                        'block w-full rounded-md px-sm py-xs text-left hover:bg-surface-hover',
                        !n.isRead && 'bg-primary-tint',
                      )}
                    >
                      <div className="text-label-md text-text-primary">
                        {n.title}
                      </div>
                      {n.body && (
                        <div className="text-caption text-text-secondary">
                          {n.body}
                        </div>
                      )}
                    </button>
                  ))
                )}
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className="flex items-center gap-xs rounded-lg p-xxs hover:bg-surface-hover"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-primary-tint text-label-md text-primary">
                {initials}
              </span>
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={8}
              className={menuPanel}
            >
              <div className="px-sm py-xs">
                <div className="text-label-lg text-text-primary">
                  {user?.displayName}
                </div>
                <div className="text-caption text-text-secondary">
                  {user?.email ?? user?.username}
                </div>
                <div className="mt-xxs text-caption text-text-tertiary capitalize">
                  {user?.role === 'admin' ? 'Owner' : user?.role}
                </div>
              </div>

              <DropdownMenu.Separator className="my-xxs h-px bg-border-light" />

              <DropdownMenu.Item
                asChild
                className="flex cursor-pointer items-center gap-xs rounded-md px-sm py-xs text-body-sm text-text-primary outline-none data-[highlighted]:bg-surface-hover"
              >
                <Link to="/account">
                  <UserCircle className="size-4" />
                  My account
                </Link>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={signOut}
                className="flex cursor-pointer items-center gap-xs rounded-md px-sm py-xs text-body-sm text-text-primary outline-none data-[highlighted]:bg-surface-hover"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}

export default Topbar;
