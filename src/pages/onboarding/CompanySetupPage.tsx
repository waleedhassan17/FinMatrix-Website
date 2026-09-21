// ═══════════════════════════════════════════════════════
// FinMatrix Web — Onboarding step 1: the company
// ═══════════════════════════════════════════════════════
// POST /companies, then store the id before anything else happens. That ordering
// is load-bearing: the axios interceptor reads x-company-id out of localStorage,
// so the very next request — fetching plans for this company — is unscoped
// without it.

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BILLING_DISABLED_BUILD } from '@/config/featureFlags';
import { OnboardingShell } from '@/features/onboarding/OnboardingShell';
// BILLING-DISABLED BUILD: submitCompanyForApproval is called from here now
// that there is no plan/payment step to carry it.
import { createCompany, submitCompanyForApproval } from '@/networks/companies/companiesNetwork';
import { setStoredCompanyId } from '@/networks/network/apiHelpers';
import { authMe } from '@/networks/auth/authNetwork';
import { setIdentity } from '@/store/authSlice';
import { useAppDispatch } from '@/store/store';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter your business name.'),
  industry: z.string().trim(),
  // Required, as in the app. It is on invoices, and a free trial is tied to it
  // (one trial per phone number). Format is checked by the server, which knows
  // every way a Pakistani number is written; its message is shown as-is.
  phone: z
    .string()
    .trim()
    .min(1, 'Enter your business phone number.')
    .refine(
      (v) => v.replace(/\D/g, '').length >= 10,
      'Enter a full phone number, e.g. 0300 1234567.',
    ),
  email: z.string().trim(),
  taxId: z.string().trim(),
  street: z.string().trim(),
  city: z.string().trim(),
  stateProv: z.string().trim(),
  postalCode: z.string().trim(),
  country: z.string().trim(),
});

type FormValues = z.infer<typeof schema>;

export default function CompanySetupPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const [formError, setFormError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      industry: '',
      phone: '',
      email: '',
      taxId: '',
      street: '',
      city: '',
      stateProv: '',
      postalCode: '',
      // The only plan catalogue the server publishes is Pakistani, and prices
      // are in rupees, so defaulting elsewhere would be pedantry.
      country: 'Pakistan',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setFormError('');
    try {
      const company = await createCompany({
        name: values.name,
        industry: values.industry,
        // The live catalogue publishes warehouse plans only; sending a type the
        // server has no plans for would leave the next step with an empty grid.
        companyType: 'warehouse',
        phone: values.phone,
        email: values.email,
        taxId: values.taxId,
        address: {
          street: values.street,
          city: values.city,
          state: values.stateProv,
          postalCode: values.postalCode,
          country: values.country,
        },
      });

      // Before anything else: every later request is scoped by this.
      setStoredCompanyId(company.id);

      // ── BILLING-DISABLED BUILD ────────────────────────────────────────
      // This used to hand off to /onboarding/plan, which is where the
      // submit-for-approval call lived. With no plan or payment step, this
      // IS the end of onboarding, so it submits here.
      //
      // Submit BEFORE re-reading identity, so the authMe() below already
      // reports `pending` and the guards route to /account-status rather
      // than bouncing the owner back through onboarding.
      //
      // Non-fatal on purpose: if it fails the company stays a draft, and
      // AccountStatusPage's draft branch offers "Submit for approval" to
      // retry. Better than an error on a screen whose work is done.
      if (BILLING_DISABLED_BUILD) {
        try {
          await submitCompanyForApproval(company.id);
        } catch {
          /* AccountStatusPage's draft branch retries this */
        }
      }

      // Re-read identity so the guards stop treating this owner as company-less.
      // Non-fatal — the company exists either way and the next step can proceed.
      try {
        dispatch(setIdentity(await authMe()));
      } catch {
        /* /account-status re-reads it anyway */
      }

      navigate(BILLING_DISABLED_BUILD ? '/account-status' : '/onboarding/plan', {
        replace: true,
      });
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'Something went wrong. Please try again.',
      );
    }
  };

  return (
    <OnboardingShell
      step={1}
      title="Tell us about your business"
      subtitle="This names your company on invoices and reports. You can change any of it later in Settings."
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="max-w-[720px] rounded-xl border border-border-light bg-surface p-xl shadow-lg sm:p-xxl"
      >
        {formError && (
          <div
            role="alert"
            className="mb-lg flex items-start gap-xs rounded-md bg-danger-lighter p-sm"
          >
            <AlertCircle className="mt-[2px] size-4 shrink-0 text-danger" />
            <span className="text-body-sm text-danger">{formError}</span>
          </div>
        )}

        <div className="flex flex-col gap-md">
          <Input
            label="Business name"
            autoFocus
            error={errors.name?.message}
            {...register('name')}
          />

          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Industry (optional)"
              error={errors.industry?.message}
              {...register('industry')}
            />
            <Input
              label="Tax / NTN number (optional)"
              error={errors.taxId?.message}
              {...register('taxId')}
            />
          </div>

          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Business phone"
              type="tel"
              inputMode="tel"
              error={errors.phone?.message}
              {...register('phone')}
            />
            <Input
              label="Business email (optional)"
              type="text"
              inputMode="email"
              error={errors.email?.message}
              {...register('email')}
            />
          </div>

          <div className="mt-sm h-px bg-border-light" />

          <Input
            label="Street address (optional)"
            error={errors.street?.message}
            {...register('street')}
          />

          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="City (optional)"
              error={errors.city?.message}
              {...register('city')}
            />
            <Input
              label="Province (optional)"
              error={errors.stateProv?.message}
              {...register('stateProv')}
            />
          </div>

          <div className="grid gap-md sm:grid-cols-2">
            <Input
              label="Postal code (optional)"
              error={errors.postalCode?.message}
              {...register('postalCode')}
            />
            <Input
              label="Country"
              error={errors.country?.message}
              {...register('country')}
            />
          </div>
        </div>

        <Button type="submit" size="lg" className="mt-xxl" disabled={isSubmitting}>
          {isSubmitting ? 'Creating company…' : 'Continue to plans'}
        </Button>
      </form>
    </OnboardingShell>
  );
}
