import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import { Eye, KeyRound, MoreHorizontal, Plus, RefreshCw, ShieldCheck, UserCheck, UserX, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { CopyField, CredentialsDialog, type HandoverCredentials } from '@/components/shared/CredentialsDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataTable } from '@/components/ui/DataTable';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import {
  TEAM_ROLE_LABEL,
  teamMemberPayload,
  teamUserActions,
  validateTeamMember,
  type TeamMemberForm,
  type TeamRole,
  type TeamUser,
} from '@/models/settings';
import { ApiError } from '@/networks/network/apiHelpers';
import {
  changeTeamUserRole,
  createTeamUser,
  getTeamUsers,
  inviteTeamUser,
  resetTeamUserPassword,
  revealTeamUserCredential,
  setTeamUserActive,
} from '@/networks/settings/settingsNetwork';
import { selectUser } from '@/store/authSlice';
import { useAppSelector } from '@/store/store';
import { generatePassword, suggestUsername } from '@/utils/password';

const ROLE_OPTIONS: ReadonlyArray<{ value: TeamRole; label: string }> = [
  { value: 'staff', label: 'Staff — runs the day to day; money and corrections need the owner' },
  { value: 'admin', label: 'Owner — full access, approves requests' },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Pending =
  | { kind: 'role'; user: TeamUser; to: TeamRole }
  | { kind: 'deactivate'; user: TeamUser }
  | { kind: 'reset'; user: TeamUser }
  | null;

const columnHelper = createColumnHelper<TeamUser>();

/**
 * The people who can sign in to this company. Owner only, tier-gated by
 * `multiUser`.
 *
 * Staff are created with a username and a password the owner chooses and
 * hands over — a warehouse hand may have no inbox. The password is shown once
 * after creating or resetting; after that it can be shown again on request,
 * and every showing is audited. Accounts are deactivated, never deleted: the
 * ledger still names who posted what.
 */
export default function TeamPage() {
  const enabled = useFeature('multiUser');
  const queryClient = useQueryClient();
  const viewer = useAppSelector(selectUser);

  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState<{ title: string; credentials: HandoverCredentials | null } | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [revealed, setRevealed] = useState<{ user: TeamUser; username: string; password: string | null } | null>(null);

  const query = useQuery({ queryKey: ['settings', 'users'], queryFn: getTeamUsers, enabled });
  const users = useMemo(() => query.data ?? [], [query.data]);
  const ownerCount = users.filter((u) => u.role === 'admin' && u.status === 'active').length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['settings', 'users'] });
    queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  const role = useMutation({
    mutationFn: (p: { user: TeamUser; to: TeamRole }) => changeTeamUserRole(p.user.id, p.to),
    onSuccess: (u) => {
      refresh();
      setPending(null);
      toast.success(`${u.name || 'Member'} is now ${TEAM_ROLE_LABEL[u.role].toLowerCase()}`);
    },
    onError: (e: Error) => toast.error('Could not change the role', { description: e.message }),
  });

  const active = useMutation({
    mutationFn: (p: { user: TeamUser; on: boolean }) => setTeamUserActive(p.user.id, p.on),
    onSuccess: (u) => {
      refresh();
      setPending(null);
      toast.success(u.status === 'active' ? 'Account activated' : 'Account deactivated', {
        description: u.status === 'active' ? 'They can sign in again.' : 'They can no longer sign in. Their history is kept.',
      });
    },
    onError: (e: Error) => toast.error('Could not update the account', { description: e.message }),
  });

  const reset = useMutation({
    mutationFn: (user: TeamUser) => resetTeamUserPassword(user.id),
    onSuccess: (credentials, user) => {
      refresh();
      setPending(null);
      setRevealed(null);
      setIssued({ title: `New password for ${user.name || user.username}`, credentials });
    },
    onError: (e: Error) => toast.error('Could not reset the password', { description: e.message }),
  });

  const reveal = useMutation({
    mutationFn: (user: TeamUser) => revealTeamUserCredential(user.id),
    onSuccess: (c, user) => setRevealed({ user, ...c }),
    onError: (e: Error) => toast.error('Could not show the credential', { description: e.message }),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Member',
        cell: (c) => (
          <div className="min-w-0">
            <p className="text-label-md text-text-primary">
              {c.getValue() || '—'}
              {c.row.original.id === viewer?.id && <span className="ml-xs text-caption text-text-tertiary">(you)</span>}
            </p>
            <p className="text-caption text-text-tertiary">
              {[c.row.original.username, c.row.original.email].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      }),
      columnHelper.accessor('role', {
        header: 'Role',
        cell: (c) => (
          <span className="inline-flex items-center gap-xxs text-body-sm text-text-primary">
            {c.getValue() === 'admin' && <ShieldCheck className="size-4 text-primary" />}
            {TEAM_ROLE_LABEL[c.getValue()]}
          </span>
        ),
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (c) => <StatusBadge status={c.getValue()} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        meta: { align: 'right' },
        cell: (c) => {
          const user = c.row.original;
          const can = teamUserActions(user, viewer?.id, ownerCount);
          const item =
            'flex cursor-pointer items-center gap-xs rounded-md px-sm py-xs text-body-sm text-text-primary outline-none data-[highlighted]:bg-surface-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';
          return (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="text" size="sm" aria-label={`Actions for ${user.name || user.username}`}>
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[14rem] rounded-lg border border-border-light bg-surface p-xxs shadow-lg"
                >
                  <DropdownMenu.Item
                    className={item}
                    disabled={!can.changeRole}
                    onSelect={() => setPending({ kind: 'role', user, to: user.role === 'admin' ? 'staff' : 'admin' })}
                  >
                    <ShieldCheck className="size-4" />
                    {user.role === 'admin' ? 'Make staff' : 'Make owner'}
                  </DropdownMenu.Item>
                  {can.roleLockedReason && (
                    <p className="px-sm pb-xs text-caption text-text-tertiary">{can.roleLockedReason}</p>
                  )}
                  {can.showCredential && (
                    <DropdownMenu.Item className={item} onSelect={() => reveal.mutate(user)}>
                      <Eye className="size-4" />
                      Show sign-in
                    </DropdownMenu.Item>
                  )}
                  {can.resetPassword && (
                    <DropdownMenu.Item className={item} onSelect={() => setPending({ kind: 'reset', user })}>
                      <KeyRound className="size-4" />
                      Reset password
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Separator className="my-xxs h-px bg-border-light" />
                  {user.status === 'active' ? (
                    <DropdownMenu.Item
                      className={cn(item, 'text-danger')}
                      disabled={!can.deactivate}
                      onSelect={() => setPending({ kind: 'deactivate', user })}
                    >
                      <UserX className="size-4" />
                      Deactivate
                    </DropdownMenu.Item>
                  ) : (
                    <DropdownMenu.Item className={item} onSelect={() => active.mutate({ user, on: true })}>
                      <UserCheck className="size-4" />
                      Activate
                    </DropdownMenu.Item>
                  )}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewer?.id, ownerCount],
  ) as never;

  if (!enabled) {
    return (
      <div className="flex flex-col gap-lg">
        <SettingsTabs />
        <FeatureUnavailable icon={Users} title="Team" body="Adding team members is not included in your company’s plan." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-lg">
      <SettingsTabs />
      <div className="flex flex-wrap items-start justify-between gap-md">
        <div>
          <h1 className="text-h2 text-text-primary">Team</h1>
          <p className="text-body-sm text-text-secondary">
            Who can sign in to this company. Staff work day to day; invoices, payments and
            corrections they prepare wait for an owner’s approval.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add team member
        </Button>
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      <DataTable
        columns={columns}
        data={users}
        isLoading={query.isLoading}
        empty={<p className="p-lg text-center text-body-sm text-text-tertiary">No team members yet.</p>}
      />

      {revealed && (
        <Card className="flex flex-col gap-sm p-lg">
          <div className="flex items-center justify-between gap-sm">
            <p className="text-label-lg text-text-primary">Sign-in for {revealed.user.name || revealed.user.username}</p>
            <Button variant="text" size="sm" onClick={() => setRevealed(null)}>
              Hide
            </Button>
          </div>
          <CopyField label="Username" value={revealed.username || revealed.user.username} />
          {revealed.password ? (
            <CopyField label="Password" value={revealed.password} />
          ) : (
            <p className="text-body-sm text-text-secondary">No password is stored for this account. Reset it to issue one.</p>
          )}
          <p className="text-caption text-text-tertiary">This showing has been recorded in the audit log.</p>
        </Card>
      )}

      <AddMemberDialog
        open={adding}
        onOpenChange={setAdding}
        onIssued={(title, credentials) => {
          refresh();
          setAdding(false);
          setIssued({ title, credentials });
        }}
      />

      <CredentialsDialog
        open={issued !== null}
        title={issued?.title ?? ''}
        credentials={issued?.credentials ?? null}
        onClose={() => setIssued(null)}
      />

      <ConfirmDialog
        open={pending?.kind === 'role'}
        onOpenChange={(o) => !o && setPending(null)}
        title={
          pending?.kind === 'role'
            ? `Make ${pending.user.name || pending.user.username} ${pending.to === 'admin' ? 'an owner' : 'staff'}?`
            : ''
        }
        description={
          pending?.kind === 'role' && pending.to === 'admin'
            ? 'Owners have full access: they approve requests, manage the team and see every setting.'
            : 'Staff keep the day-to-day work; invoices, payments and corrections they prepare will need an owner’s approval.'
        }
        confirmLabel="Change role"
        busy={role.isPending}
        onConfirm={() => pending?.kind === 'role' && role.mutate({ user: pending.user, to: pending.to })}
      />

      <ConfirmDialog
        open={pending?.kind === 'deactivate'}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === 'deactivate' ? `Deactivate ${pending.user.name || pending.user.username}?` : ''}
        description="They are signed out and can no longer sign in. Nothing they posted changes, and you can activate the account again at any time."
        confirmLabel="Deactivate"
        destructive
        busy={active.isPending}
        onConfirm={() => pending?.kind === 'deactivate' && active.mutate({ user: pending.user, on: false })}
      />

      <ConfirmDialog
        open={pending?.kind === 'reset'}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.kind === 'reset' ? `Reset the password for ${pending.user.name || pending.user.username}?` : ''}
        description="A new password is generated and shown once. The old one stops working immediately."
        confirmLabel="Reset password"
        destructive
        busy={reset.isPending}
        onConfirm={() => pending?.kind === 'reset' && reset.mutate(pending.user)}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

type Mode = 'account' | 'email';

function AddMemberDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onIssued: (title: string, credentials: HandoverCredentials | null) => void;
}) {
  const [mode, setMode] = useState<Mode>('account');
  const [form, setForm] = useState<TeamMemberForm>(() => ({
    name: '',
    username: '',
    password: generatePassword(),
    role: 'staff',
    email: '',
    phone: '',
  }));
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof TeamMemberForm, string>>>({});
  const [limit, setLimit] = useState<string | null>(null);

  const reset = () => {
    setMode('account');
    setForm({ name: '', username: '', password: generatePassword(), role: 'staff', email: '', phone: '' });
    setUsernameTouched(false);
    setServerErrors({});
    setLimit(null);
  };

  const patch = (p: Partial<TeamMemberForm>) => {
    setForm((f) => {
      const next = { ...f, ...p };
      if (p.name !== undefined && !usernameTouched) next.username = suggestUsername(p.name);
      return next;
    });
    setServerErrors({});
  };

  const errors = mode === 'account' ? validateTeamMember(form) : {};
  const emailOk = EMAIL.test(form.email.trim());
  const valid = mode === 'account' ? Object.keys(errors).length === 0 : emailOk;
  // Only show a field's own error once something has been typed into it.
  const shown = (k: keyof TeamMemberForm) => serverErrors[k] ?? (form[k] ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: () =>
      mode === 'account'
        ? createTeamUser(teamMemberPayload(form))
        : inviteTeamUser({ email: form.email.trim(), role: form.role, displayName: form.name.trim() || undefined }),
    onSuccess: ({ user, credentials }) => {
      onIssued(`${user.name || user.username} can now sign in`, credentials);
      reset();
    },
    onError: (e: Error) => {
      const code = e instanceof ApiError ? e.code : undefined;
      if (code === 'USERNAME_TAKEN') return setServerErrors({ username: 'That username is taken.' });
      if (code === 'EMAIL_EXISTS') return setServerErrors({ email: 'An account already uses this email.' });
      if (code === 'STAFF_LIMIT_REACHED') return setLimit(e.message);
      toast.error('Could not add the team member', { description: e.message });
    },
  });

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Add a team member"
      description="They sign in with a username and password you hand over — no invite email is sent."
      confirmLabel={save.isPending ? 'Adding…' : 'Add member'}
      busy={save.isPending}
      confirmDisabled={!valid}
      onConfirm={() => save.mutate()}
    >
      <div className="flex flex-col gap-md">
        <div className="flex gap-xxs rounded-md bg-surface-2 p-xxs" role="tablist">
          {(
            [
              ['account', 'Choose a username'],
              ['email', 'From their email'],
            ] as Array<[Mode, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => {
                setMode(value);
                setServerErrors({});
              }}
              className={cn(
                'flex-1 rounded-sm px-sm py-xs text-label-md transition-colors',
                mode === value ? 'bg-surface text-text-primary shadow-sm' : 'text-text-secondary',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {limit && (
          <p role="alert" className="rounded-md border border-warning-light bg-warning-lighter p-sm text-body-sm text-text-primary">
            {limit}
          </p>
        )}

        {mode === 'account' ? (
          <>
            <Input label="Full name" value={form.name} onChange={(e) => patch({ name: e.target.value })} error={shown('name')} autoFocus />
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => {
                setUsernameTouched(true);
                patch({ username: e.target.value });
              }}
              error={shown('username')}
              autoCapitalize="none"
              spellCheck={false}
            />
            <Input
              label="Password"
              value={form.password}
              onChange={(e) => patch({ password: e.target.value })}
              error={shown('password')}
              className="font-mono"
              spellCheck={false}
              trailing={
                <button
                  type="button"
                  onClick={() => patch({ password: generatePassword() })}
                  className="inline-flex items-center gap-xxs text-label-sm text-primary hover:underline"
                >
                  <RefreshCw className="size-3" />
                  New
                </button>
              }
            />
            <Input label="Email (optional)" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} error={shown('email')} />
          </>
        ) : (
          <>
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              error={serverErrors.email ?? (form.email && !emailOk ? 'Enter a valid email address.' : undefined)}
              hint="Their username is taken from the address and a password is generated."
              autoFocus
            />
            <Input label="Name (optional)" value={form.name} onChange={(e) => patch({ name: e.target.value })} />
          </>
        )}
        <Select label="Role" value={form.role} onChange={(v) => patch({ role: v as TeamRole })} options={ROLE_OPTIONS} />
      </div>
    </ConfirmDialog>
  );
}
