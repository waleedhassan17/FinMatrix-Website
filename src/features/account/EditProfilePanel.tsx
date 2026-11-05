import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SidePanel } from '@/components/ui/SidePanel';
import { authUpdateProfile } from '@/networks/auth/authNetwork';
import { ApiError } from '@/networks/network/apiHelpers';
import { setIdentity } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';
import type { AuthUser } from '@/types';
import {
  formatPkPhoneForDisplay,
  isValidPkMobile,
  normalizePkPhone,
  PK_MOBILE_MESSAGE,
} from '@/utils/phone';

const FORM_ID = 'edit-profile-form';
const NAME_MAX = 120;

const tidyName = (raw: string) => raw.trim().replace(/\s+/g, ' ');

const nameError = (raw: string): string => {
  const name = tidyName(raw);
  if (name.length < 2) return 'Enter your name — at least 2 characters.';
  if (name.length > NAME_MAX) return `Keep it to ${NAME_MAX} characters.`;
  return '';
};

const phoneError = (raw: string): string =>
  raw.trim() && !isValidPkMobile(raw) ? PK_MOBILE_MESSAGE : '';

/**
 * The signed-in person's own name and phone. Their email or username is shown
 * but not editable: it is how they sign in, and changing it needs a verified
 * flow of its own.
 *
 * Mount it with a fresh `key` each time it opens, so the fields start from
 * the profile as saved rather than from an abandoned edit.
 */
export function EditProfilePanel({
  open,
  onOpenChange,
  user,
  isOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  isOwner: boolean;
}) {
  const dispatch = useAppDispatch();
  const [name, setName] = useState(user.displayName ?? '');
  const [phone, setPhone] = useState(formatPkPhoneForDisplay(user.phone) || (user.phone ?? ''));
  const [touched, setTouched] = useState({ name: false, phone: false });
  const [submitted, setSubmitted] = useState(false);

  const errors = { name: nameError(name), phone: phoneError(phone) };
  const show = {
    name: (touched.name || submitted) && errors.name,
    phone: (touched.phone || submitted) && errors.phone,
  };
  const nextPhone = normalizePkPhone(phone) ?? null;
  const dirty = tidyName(name) !== (user.displayName ?? '') || nextPhone !== (user.phone ?? null);

  const save = useMutation({
    mutationFn: () =>
      authUpdateProfile({
        displayName: tidyName(name),
        ...(nextPhone ? { phone: nextPhone } : {}),
      }),
    onSuccess: (me) => {
      // Everything that shows the name (top bar, this page) reads the session.
      dispatch(setIdentity(me));
      toast.success('Profile updated');
      onOpenChange(false);
    },
  });

  const serverError =
    save.error instanceof ApiError && save.error.status === 404
      ? 'Editing your profile isn’t available yet. Please try again after the next update.'
      : save.error
        ? save.error.message || 'Could not save your profile. Please try again.'
        : '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.name || errors.phone || !dirty || save.isPending) return;
    save.mutate();
  };

  const signIn = isOwner
    ? { label: 'Sign-in email', value: user.email }
    : { label: 'Username', value: user.username };

  return (
    <SidePanel
      open={open}
      onOpenChange={(next) => {
        if (!next && save.isPending) return;
        onOpenChange(next);
      }}
      title="Edit profile"
      description="How your name appears to your team and on records you create."
      footer={
        <div className="flex items-center justify-end gap-xs">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} size="sm" disabled={!dirty || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="flex flex-col gap-lg p-lg">
        {serverError && (
          <div role="alert" className="flex items-start gap-xs rounded-md bg-danger-lighter p-sm">
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" aria-hidden="true" />
            <span className="text-body-sm text-danger">{serverError}</span>
          </div>
        )}

        <Input
          label="Full name"
          autoComplete="name"
          autoFocus
          maxLength={NAME_MAX + 20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          error={show.name || undefined}
          required
        />

        <Input
          label={
            <>
              Phone <span className="text-text-tertiary">(optional)</span>
            </>
          }
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="0312 3456789"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
          error={show.phone || undefined}
          hint="A Pakistani mobile number. Leave it empty to remove it."
        />

        {signIn.value && (
          <div className="flex flex-col gap-xxs">
            <span className="text-label-md text-text-secondary">{signIn.label}</span>
            <div className="flex h-12 items-center gap-xs rounded-md border border-border-light bg-surface-2 px-md text-body-md text-text-secondary">
              <Lock className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <span className="min-w-0 truncate">{signIn.value}</span>
            </div>
            <span className="text-caption text-text-tertiary">
              This is how you sign in, so it can’t be changed here.
            </span>
          </div>
        )}
      </form>
    </SidePanel>
  );
}

export default EditProfilePanel;
