import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, RefreshCw, Truck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { CredentialsDialog } from '@/components/shared/CredentialsDialog';
import { invalidateDeliveries } from '@/features/delivery/invalidateDeliveries';
import { FeatureUnavailable } from '@/features/shell/FeatureUnavailable';
// BILLING-DISABLED BUILD: useIsOwner un-comments with the link below.
import { useFeature /*, useIsOwner */ } from '@/hooks/useCapability';
import {
  emptyRiderForm,
  generateRiderPassword,
  riderPayload,
  validateRider,
  type RiderForm,
} from '@/models/delivery';
import { createRider, type RiderCredentials } from '@/networks/delivery/personnelNetwork';
import { ApiError } from '@/networks/network/apiHelpers';

/** `Imran Khan` → `imran.khan`, trimmed to what RIDER_USERNAME accepts. */
const suggestUsername = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 64);

/**
 * Add a rider. Direct for staff (`personnel.manage`) — the owner should not be
 * the bottleneck for putting someone on a route.
 *
 * Riders do not sign themselves up: the office issues a username and password
 * and hands them over. They are shown once on success, then the page moves to
 * the rider, where they can be revealed again (audited) or reset.
 */
export default function RiderFormPage() {
  const enabled = useFeature('delivery');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RiderForm>(() => ({
    ...emptyRiderForm(),
    password: generateRiderPassword(),
  }));
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof RiderForm, string>>>({});
  const [issued, setIssued] = useState<{ userId: string; credentials: RiderCredentials | null } | null>(
    null,
  );
  const [limit, setLimit] = useState<string | null>(null);
  // BILLING-DISABLED BUILD: only gated the plan-limit link above.
  // const isOwner = useIsOwner();

  const patch = (p: Partial<RiderForm>) => {
    setForm((f) => {
      const next = { ...f, ...p };
      // Follow the name until the username is typed by hand.
      if (p.name !== undefined && !usernameTouched) next.username = suggestUsername(p.name);
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof RiderForm];
      if (p.name !== undefined && !usernameTouched) delete next.username;
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => createRider(riderPayload(form)),
    onSuccess: (result) => {
      invalidateDeliveries(queryClient);
      setIssued({
        userId: result.userId,
        credentials: result.credentials ?? {
          username: form.username.trim().toLowerCase(),
          password: form.password,
        },
      });
    },
    onError: (e: Error) => {
      // The plan caps how many riders a company may have. That is not a
      // passing error to toast away — it stays until the plan changes, so it
      // stays on the form.
      if (e instanceof ApiError && e.code === 'DELIVERY_PERSONNEL_LIMIT_REACHED') {
        setLimit(e.message);
        return;
      }
      if (/username/i.test(e.message) && /(taken|exists|use)/i.test(e.message)) {
        setErrors({ username: 'That username is taken — try another.' });
        return;
      }
      toast.error('Could not add the rider', { description: e.message });
    },
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validateRider(form);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  if (!enabled) {
    return (
      <FeatureUnavailable
        icon={Truck}
        title="Riders"
        body="Delivery operations are not included in your company’s plan."
      />
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto flex max-w-2xl flex-col gap-lg" noValidate>
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to="/delivery-personnel">
          <ArrowLeft className="size-4" />
          Riders
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">Add a rider</h1>
        <p className="text-body-sm text-text-secondary">
          You issue their sign-in. Riders have no email and no self-service reset, so keep
          the password somewhere you can pass it on.
        </p>
      </div>

      {limit && (
        <div
          role="alert"
          className="flex items-start gap-sm rounded-md border border-warning-light bg-warning-lighter p-md"
        >
          <AlertTriangle className="mt-[2px] size-4 shrink-0 text-warning" />
          <div className="text-body-sm text-text-primary">
            <p>{limit}</p>
            {/* BILLING-DISABLED BUILD: there is no plan to change, and
                "ask the owner to upgrade" would send a team member after
                something the owner cannot do either. Only a company already
                on a paid plan can still see this warning at all. */}
            <p className="mt-xxs text-text-secondary">Existing riders keep working.</p>
            {/* <p className="mt-xxs text-text-secondary">
              Existing riders keep working.{' '}
              {isOwner ? (
                <Link to="/account/renew" className="text-primary hover:underline">
                  Change plan
                </Link>
              ) : (
                'Ask the owner to upgrade the plan.'
              )}
            </p> */}
          </div>
        </div>
      )}

      <Card className="p-lg">
        <SectionHeader title="Sign-in" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Full name *"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            error={errors.name}
            autoFocus
          />
          <Input
            label="Username *"
            value={form.username}
            onChange={(e) => {
              setUsernameTouched(true);
              patch({ username: e.target.value });
            }}
            error={errors.username}
            autoCapitalize="none"
            spellCheck={false}
            hint="Lowercase — no @, so it is never mistaken for an email."
          />
          <Input
            label="Password *"
            value={form.password}
            onChange={(e) => patch({ password: e.target.value })}
            error={errors.password}
            className="font-mono"
            spellCheck={false}
            containerClassName="sm:col-span-2"
            hint="Shown once after saving, with a copy button."
            trailing={
              <button
                type="button"
                onClick={() => patch({ password: generateRiderPassword() })}
                className="inline-flex items-center gap-xxs text-label-sm text-primary hover:underline"
              >
                <RefreshCw className="size-3" />
                New
              </button>
            }
          />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Contact and vehicle" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Phone"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
            error={errors.phone}
            inputMode="tel"
            placeholder="0312 4890176"
          />
          <Input
            label="Email"
            value={form.email}
            onChange={(e) => patch({ email: e.target.value })}
            error={errors.email}
            type="email"
            hint="Contact only — riders never sign in with it."
          />
          <Input
            label="Vehicle"
            value={form.vehicleType}
            onChange={(e) => patch({ vehicleType: e.target.value })}
            error={errors.vehicleType}
            placeholder="Motorbike, van…"
          />
          <Input
            label="Vehicle number"
            value={form.vehicleNumber}
            onChange={(e) => patch({ vehicleNumber: e.target.value })}
            error={errors.vehicleNumber}
          />
          <Input
            label="Zones"
            value={form.zones}
            onChange={(e) => patch({ zones: e.target.value })}
            placeholder="Gulberg, DHA"
            hint="Comma-separated."
          />
          <Input
            label="Max load"
            value={form.maxLoad}
            onChange={(e) => patch({ maxLoad: e.target.value })}
            error={errors.maxLoad}
            inputMode="decimal"
            hint="Deliveries they can carry at once."
          />
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to="/delivery-personnel">Cancel</Link>
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Adding…' : 'Add rider'}
        </Button>
      </div>

      <CredentialsDialog
        open={issued !== null}
        title="Rider added"
        credentials={issued?.credentials ?? null}
        onClose={() =>
          navigate(issued?.userId ? `/delivery-personnel/${issued.userId}` : '/delivery-personnel', {
            replace: true,
          })
        }
      />
    </form>
  );
}
