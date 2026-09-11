import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SettingsTabs } from '@/features/settings/SettingsTabs';
import {
  CURRENCY_OPTIONS,
  FISCAL_MONTH_OPTIONS,
  profilePayload,
  profileToForm,
  validateProfile,
  type CompanyProfileForm,
} from '@/models/settings';
import { authMe } from '@/networks/auth/authNetwork';
import { getCompanyProfile, updateCompanyProfile } from '@/networks/settings/settingsNetwork';
import { selectCompanyId, setIdentity } from '@/store/authSlice';
import { useAppDispatch, useAppSelector } from '@/store/store';

type Errors = Partial<Record<keyof CompanyProfileForm, string>>;

/**
 * The company's identity — what invoices and payslips print. Owner only.
 *
 * Saved to the company record itself (PATCH /companies/:id). Fiscal year start
 * and home currency are recorded here too; reports still run on the dates you
 * choose, and figures display in Rs, as in the app.
 */
export default function CompanyProfilePage() {
  const companyId = useAppSelector(selectCompanyId);
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['companies', companyId, 'profile'],
    queryFn: () => getCompanyProfile(companyId!),
    enabled: !!companyId,
  });

  const [draft, setDraft] = useState<CompanyProfileForm | null>(null);
  const form = draft ?? (query.data ? profileToForm(query.data) : null);
  const [errors, setErrors] = useState<Errors>({});

  const patch = (p: Partial<CompanyProfileForm>) => {
    if (!form) return;
    setDraft({ ...form, ...p });
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(p)) delete next[k as keyof CompanyProfileForm];
      return next;
    });
  };

  const save = useMutation({
    mutationFn: () => updateCompanyProfile(companyId!, profilePayload(form!)),
    onSuccess: (saved) => {
      setDraft(null);
      queryClient.setQueryData(['companies', companyId, 'profile'], saved);
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      // The top bar shows the company name from the session; re-read it so a
      // rename appears without signing in again.
      authMe()
        .then((me) => dispatch(setIdentity(me)))
        .catch(() => undefined);
      toast.success('Company profile saved', {
        description: 'New invoices and payslips print these details.',
      });
    },
    onError: (e: Error) => toast.error('Could not save the profile', { description: e.message }),
  });

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!form) return;
    const e = validateProfile(form);
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };

  return (
    <div className="flex flex-col gap-lg">
      <SettingsTabs />
      <div>
        <h1 className="text-h2 text-text-primary">Company profile</h1>
        <p className="text-body-sm text-text-secondary">
          The name, contact details and address printed on your invoices and payslips.
        </p>
      </div>

      {query.error && (
        <Card className="p-lg">
          <p className="text-body-sm text-danger">{query.error.message}</p>
        </Card>
      )}

      {!form ? (
        <Card className="p-lg">
          <div className="h-40 animate-pulse rounded-md bg-neutral-100" />
        </Card>
      ) : (
        <form onSubmit={submit} className="flex max-w-3xl flex-col gap-lg" noValidate>
          <Card className="p-lg">
            <SectionHeader title="Identity" />
            <div className="mt-md grid gap-md sm:grid-cols-2">
              <Input label="Company name *" value={form.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} containerClassName="sm:col-span-2" />
              <Input label="Industry" value={form.industry} onChange={(e) => patch({ industry: e.target.value })} />
              <Input label="Tax ID / NTN" value={form.taxId} onChange={(e) => patch({ taxId: e.target.value })} />
              <Input label="Phone" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} inputMode="tel" />
              <Input label="Email" type="email" value={form.email} onChange={(e) => patch({ email: e.target.value })} error={errors.email} />
              <Input label="Website" value={form.website} onChange={(e) => patch({ website: e.target.value })} error={errors.website} placeholder="example.com" containerClassName="sm:col-span-2" />
            </div>
          </Card>

          <Card className="p-lg">
            <SectionHeader title="Address" />
            <div className="mt-md grid gap-md sm:grid-cols-2">
              <Input label="Street" value={form.street} onChange={(e) => patch({ street: e.target.value })} containerClassName="sm:col-span-2" />
              <Input label="City" value={form.city} onChange={(e) => patch({ city: e.target.value })} />
              <Input label="State / province" value={form.state} onChange={(e) => patch({ state: e.target.value })} />
              <Input label="Postal code" value={form.postalCode} onChange={(e) => patch({ postalCode: e.target.value })} />
              <Input label="Country" value={form.country} onChange={(e) => patch({ country: e.target.value })} />
            </div>
          </Card>

          <Card className="p-lg">
            <SectionHeader title="Accounting" />
            <div className="mt-md grid gap-md sm:grid-cols-2">
              <Select
                label="Fiscal year starts"
                value={form.fiscalYearStartMonth}
                onChange={(v) => patch({ fiscalYearStartMonth: v })}
                options={FISCAL_MONTH_OPTIONS}
                placeholder="Choose a month"
              />
              <Select
                label="Home currency"
                value={form.homeCurrency}
                onChange={(v) => patch({ homeCurrency: v })}
                options={CURRENCY_OPTIONS}
                placeholder="Choose a currency"
                error={errors.homeCurrency}
              />
            </div>
            <p className="mt-md flex items-start gap-xs text-caption text-text-tertiary">
              <Info className="mt-[1px] size-3 shrink-0" />
              Recorded on the company. Reports run on the dates you pick, and figures display in
              Rs — the same as the mobile app.
            </p>
          </Card>

          <div className="flex justify-end gap-sm pb-xl">
            {draft && (
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                Discard changes
              </Button>
            )}
            <Button type="submit" disabled={!draft || save.isPending}>
              <Building2 className="size-4" />
              {save.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
