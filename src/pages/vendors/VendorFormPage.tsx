import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Combobox } from '@/components/ui/Combobox';
import { Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PAYMENT_TERMS_OPTIONS, type PaymentTerms } from '@/models/customer';
import { EMPTY_VENDOR_FORM, VENDOR_MAX_LENGTHS } from '@/models/vendor';
import { getBillableAccounts } from '@/networks/accounting/accountNetwork';
import {
  createVendor,
  getVendorById,
  updateVendor,
} from '@/networks/purchases/vendorNetwork';
import {
  vendorFormToPayload,
  vendorToFormData,
} from '@/serializers/vendorSerializer';

const M = VENDOR_MAX_LENGTHS;

/**
 * Vendor validation.
 *
 * Email is required here, as it is on the customer form and in the app's own
 * `validateVendor` — the server marks it optional, but a vendor created
 * without one could not then be saved from the phone.
 *
 * The max lengths are the Postgres column widths. No DTO validates them, so
 * an overlong value is a 500 rather than a message a form can show.
 */
const vendorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Vendor name is required')
    .max(M.name, `Name must be ${M.name} characters or fewer`),
  contactPerson: z
    .string()
    .trim()
    .max(M.contactPerson, `Contact person must be ${M.contactPerson} characters or fewer`),
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Enter a valid email address')
    .max(M.email, `Email must be ${M.email} characters or fewer`),
  phone: z
    .string()
    .trim()
    .max(M.phone, `Phone must be ${M.phone} characters or fewer`)
    .refine((v) => v === '' || /^[+\d\s\-()]+$/.test(v), 'Invalid phone format'),
  street: z.string().trim(),
  city: z.string().trim(),
  state: z.string().trim(),
  zipCode: z.string().trim(),
  country: z.string().trim(),
  paymentTerms: z.string().min(1, 'Payment terms are required'),
  taxId: z
    .string()
    .trim()
    .max(M.taxId, `Tax ID must be ${M.taxId} characters or fewer`),
  defaultExpenseAccountId: z.string(),
  notes: z.string().trim(),
});

type VendorSchema = z.infer<typeof vendorSchema>;

export default function VendorFormPage() {
  const { vendorId } = useParams<{ vendorId: string }>();
  const isEditing = Boolean(vendorId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: vendor, isLoading } = useQuery({
    queryKey: ['vendors', vendorId],
    queryFn: () => getVendorById(vendorId!),
    enabled: isEditing,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts', 'billable'],
    queryFn: getBillableAccounts,
  });

  const accountOptions = useMemo(
    () => [
      { value: '', label: 'No default — choose per bill' },
      ...accounts.map((a) => ({
        value: a.id,
        label: `${a.accountNumber} · ${a.name}`,
      })),
    ],
    [accounts],
  );

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<VendorSchema>({
    resolver: zodResolver(vendorSchema),
    defaultValues: EMPTY_VENDOR_FORM,
  });

  useEffect(() => {
    if (vendor) reset(vendorToFormData(vendor));
  }, [vendor, reset]);

  const save = useMutation({
    mutationFn: (values: VendorSchema) => {
      const payload = vendorFormToPayload({
        ...values,
        paymentTerms: values.paymentTerms as PaymentTerms,
      });
      return isEditing ? updateVendor(vendorId!, payload) : createVendor(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] });
      toast.success(isEditing ? 'Vendor updated' : 'Vendor created', {
        description: `${saved.name} has been saved.`,
      });
      navigate(`/vendors/${saved.id}`, { replace: true });
    },
    onError: (e: Error) =>
      toast.error('Could not save vendor', { description: e.message }),
  });

  if (isEditing && isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading vendor…</p>;
  }

  if (isEditing && !vendor) {
    return (
      <Card className="p-xl">
        <p className="text-label-lg text-text-primary">Vendor not found</p>
        <p className="mt-xxs text-body-sm text-text-secondary">
          It may have been removed.
        </p>
        <Button asChild variant="secondary" className="mt-lg">
          <Link to="/vendors">Back to vendors</Link>
        </Button>
      </Card>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate(v))}
      className="mx-auto flex max-w-3xl flex-col gap-lg"
    >
      <Button asChild variant="text" size="sm" className="self-start px-0">
        <Link to={isEditing ? `/vendors/${vendorId}` : '/vendors'}>
          <ArrowLeft className="size-4" />
          Back
        </Link>
      </Button>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? 'Edit vendor' : 'New vendor'}
        </h1>
        <p className="text-body-sm text-text-secondary">Supplier profile</p>
      </div>

      {/* ── Company information ─────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Company information" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          {/* One name field — the vendor IS the company. There is no
              name + company pair as there is on a customer. */}
          <Input
            label="Company name *"
            error={errors.name?.message}
            containerClassName="sm:col-span-2"
            {...register('name')}
          />
          <Input
            label="Contact person"
            error={errors.contactPerson?.message}
            {...register('contactPerson')}
          />
          <Input
            label="Email *"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input
            label="Phone"
            error={errors.phone?.message}
            containerClassName="sm:col-span-2"
            {...register('phone')}
          />
        </div>
      </Card>

      {/* ── Address ─────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Address" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Street"
            containerClassName="sm:col-span-2"
            {...register('street')}
          />
          <Input label="City" {...register('city')} />
          <Input label="State / province" {...register('state')} />
          <Input label="Zip code" {...register('zipCode')} />
          <Input label="Country" placeholder="Pakistan" {...register('country')} />
        </div>
      </Card>

      {/* ── Terms & accounting ──────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Terms & accounting" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Controller
            control={control}
            name="paymentTerms"
            render={({ field }) => (
              <Select
                label="Payment terms *"
                value={field.value}
                onChange={field.onChange}
                options={PAYMENT_TERMS_OPTIONS}
                placeholder="Select payment terms…"
                error={errors.paymentTerms?.message}
              />
            )}
          />
          <Input
            label="Tax ID (NTN)"
            placeholder="NTN-XXXXXXX-X"
            error={errors.taxId?.message}
            {...register('taxId')}
          />
          <Controller
            control={control}
            name="defaultExpenseAccountId"
            render={({ field }) => (
              <Combobox
                label="Default expense account"
                value={field.value}
                onChange={field.onChange}
                options={accountOptions}
                placeholder="No default"
                searchPlaceholder="Search accounts…"
                hint="Preselected on this vendor's bill lines. Vendors have this; customers do not."
                containerClassName="sm:col-span-2"
              />
            )}
          />
        </div>
      </Card>

      <Card className="p-lg">
        <SectionHeader title="Notes" />
        <div className="mt-md">
          <Textarea placeholder="Anything worth remembering…" {...register('notes')} />
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to={isEditing ? `/vendors/${vendorId}` : '/vendors'}>Cancel</Link>
        </Button>
        {/* vendor.manage is 'direct' for both roles — no approval affordance. */}
        <Button type="submit" disabled={isSubmitting || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save vendor'}
        </Button>
      </div>
    </form>
  );
}
