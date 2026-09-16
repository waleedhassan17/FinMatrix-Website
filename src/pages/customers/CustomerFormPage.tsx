import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Switch, Textarea } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { customerSchema, type CustomerSchema } from '@/features/customers/customerSchema';
import {
  createCustomer,
  getCustomerById,
  updateCustomer,
} from '@/networks/sales/customerNetwork';
import {
  EMPTY_CUSTOMER_FORM,
  PAYMENT_TERMS_OPTIONS,
  type PaymentTerms,
} from '@/models/customer';
import {
  customerToFormData,
  formDataToCustomerPayload,
} from '@/serializers/customerSerializer';

export default function CustomerFormPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const isEditing = Boolean(customerId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch by id rather than reading from the list cache. The app hydrates its
  // edit form from the already-loaded list, which renders a blank form when
  // someone opens /customers/:id/edit directly.
  const { data: detail, isLoading } = useQuery({
    queryKey: ['customers', customerId],
    queryFn: () => getCustomerById(customerId!),
    enabled: isEditing,
  });

  const form = useForm<CustomerSchema>({
    resolver: zodResolver(customerSchema),
    defaultValues: EMPTY_CUSTOMER_FORM,
  });

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => {
    if (detail?.customer) reset(customerToFormData(detail.customer));
  }, [detail, reset]);

  const sameAsBilling = watch('sameAsBilling');

  const save = useMutation({
    mutationFn: (values: CustomerSchema) => {
      const payload = formDataToCustomerPayload({
        ...values,
        paymentTerms: values.paymentTerms as PaymentTerms,
      });
      return isEditing
        ? updateCustomer(customerId!, payload)
        : createCustomer(payload);
    },
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      toast.success(isEditing ? 'Customer updated' : 'Customer created', {
        description: `${customer.name} has been saved.`,
      });
      navigate(`/customers/${customer.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error('Could not save customer', {
      description: e.message,
    }),
  });

  if (isEditing && isLoading) {
    return <p className="text-body-sm text-text-secondary">Loading customer…</p>;
  }

  return (
    <form
      onSubmit={handleSubmit((v) => save.mutate(v))}
      className="mx-auto flex max-w-3xl flex-col gap-lg"
    >
      <div className="flex items-center gap-sm">
        <Button asChild variant="text" size="sm" className="px-0">
          <Link to={isEditing ? `/customers/${customerId}` : '/customers'}>
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-h2 text-text-primary">
          {isEditing ? 'Edit customer' : 'New customer'}
        </h1>
        <p className="text-body-sm text-text-secondary">Customer profile</p>
      </div>

      {/* ── Basic information ───────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Basic information" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Name *"
            error={errors.name?.message}
            containerClassName="sm:col-span-2"
            {...register('name')}
          />
          <Input label="Company" error={errors.company?.message} {...register('company')} />
          <Input
            label="Email *"
            type="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Input label="Phone" error={errors.phone?.message} {...register('phone')} />
          <Input
            label="Contact person"
            error={errors.contactPerson?.message}
            {...register('contactPerson')}
          />
          <Input
            label="Tax ID (NTN)"
            placeholder="NTN-XXXXXXX-X"
            error={errors.taxId?.message}
            containerClassName="sm:col-span-2"
            {...register('taxId')}
          />
        </div>
      </Card>

      {/* ── Billing address ─────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Billing address" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Street *"
            error={errors.billingStreet?.message}
            containerClassName="sm:col-span-2"
            {...register('billingStreet')}
          />
          <Input
            label="City *"
            error={errors.billingCity?.message}
            {...register('billingCity')}
          />
          <Input label="State / province" {...register('billingState')} />
          <Input label="Zip code" {...register('billingZipCode')} />
          <Input label="Country" placeholder="Pakistan" {...register('billingCountry')} />
        </div>
      </Card>

      {/* ── Shipping address ────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Shipping address" />
        <div className="mt-md">
          <Controller
            control={control}
            name="sameAsBilling"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked);
                  // Copy billing across when switching on, matching the app's
                  // toggleSameAsBilling. Without this the payload would carry
                  // whatever stale shipping values were typed earlier.
                  if (checked) {
                    const v = getValues();
                    setValue('shippingStreet', v.billingStreet);
                    setValue('shippingCity', v.billingCity);
                    setValue('shippingState', v.billingState);
                    setValue('shippingZipCode', v.billingZipCode);
                    setValue('shippingCountry', v.billingCountry);
                  }
                }}
                label="Same as billing address"
              />
            )}
          />
        </div>

        {!sameAsBilling && (
          <div className="mt-md grid gap-md sm:grid-cols-2">
            <Input
              label="Street *"
              error={errors.shippingStreet?.message}
              containerClassName="sm:col-span-2"
              {...register('shippingStreet')}
            />
            <Input
              label="City *"
              error={errors.shippingCity?.message}
              {...register('shippingCity')}
            />
            <Input label="State / province" {...register('shippingState')} />
            <Input label="Zip code" {...register('shippingZipCode')} />
            <Input
              label="Country"
              placeholder="Pakistan"
              {...register('shippingCountry')}
            />
          </div>
        )}
      </Card>

      {/* ── Credit & terms ──────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Credit & terms" />
        <div className="mt-md grid gap-md sm:grid-cols-2">
          <Input
            label="Credit limit (Rs)"
            placeholder="0.00"
            hint="0 means no limit. Past the limit a shipment or invoice needs an advance or the owner's approval."
            inputMode="decimal"
            error={errors.creditLimit?.message}
            {...register('creditLimit')}
          />
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
        </div>
      </Card>

      {/* ── Notes ───────────────────────────────────────────────────── */}
      <Card className="p-lg">
        <SectionHeader title="Notes" />
        <div className="mt-md">
          <Textarea placeholder="Anything worth remembering…" {...register('notes')} />
        </div>
      </Card>

      <div className="flex justify-end gap-sm pb-xl">
        <Button asChild variant="secondary">
          <Link to={isEditing ? `/customers/${customerId}` : '/customers'}>Cancel</Link>
        </Button>
        {/* customer.manage is 'direct' for both roles, so there is no
            approval affordance in this module — the label never changes. */}
        <Button type="submit" disabled={isSubmitting || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save customer'}
        </Button>
      </div>
    </form>
  );
}
