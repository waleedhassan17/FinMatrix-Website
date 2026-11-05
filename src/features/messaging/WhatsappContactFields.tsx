import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import {
  effectiveWhatsapp,
  whatsappFieldError,
  type WhatsappFieldsState,
} from './whatsappFields';
import { formatWhatsappPreview } from './whatsappPreview';

/**
 * WhatsApp number (prefilled from Phone, with a live "+92 300 1234567"
 * preview and an inline error), consent, and preferred language — what
 * FinMatrix Connect needs to message a customer or vendor.
 */
export function WhatsappContactFields({
  party,
  phone,
  state,
  onChange,
}: {
  party: 'customer' | 'vendor';
  phone: string;
  state: WhatsappFieldsState;
  onChange: (next: WhatsappFieldsState) => void;
}) {
  const shown = effectiveWhatsapp(state, phone);
  const preview = formatWhatsappPreview(shown);
  const error = whatsappFieldError(state, phone);
  return (
    <div className="flex flex-col gap-md">
      <div>
        <Input
          label="WhatsApp number"
          value={shown}
          onChange={(e) => onChange({ ...state, value: e.target.value, touched: true })}
          placeholder="0300 1234567"
          inputMode="tel"
          error={error ?? undefined}
        />
        {!error && (
          <p className="mt-xxs text-caption text-text-tertiary" aria-live="polite">
            {preview ? `Messages go to ${preview}` : 'No WhatsApp messages without a number.'}
          </p>
        )}
      </div>

      <label className="flex items-start gap-sm text-body-sm text-text-secondary">
        <input
          type="checkbox"
          className="mt-xxs size-4 accent-[color:var(--color-primary)]"
          checked={state.optIn}
          onChange={(e) => onChange({ ...state, optIn: e.target.checked })}
        />
        <span>
          {party === 'customer'
            ? 'This customer agreed to receive invoices, receipts and reminders on WhatsApp'
            : 'This vendor agreed to receive purchase orders and remittances on WhatsApp'}
        </span>
      </label>

      <fieldset>
        <legend className="mb-xs text-label-md text-text-secondary">Message language</legend>
        <div className="flex flex-wrap gap-xs" role="radiogroup">
          {(
            [
              ['', 'Company default'],
              ['en', 'English'],
              ['ur', 'اردو'],
            ] as const
          ).map(([value, label]) => {
            const on = state.language === value;
            return (
              <button
                key={value || 'default'}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => onChange({ ...state, language: value })}
                className={cn(
                  'rounded-full border px-sm py-xxs text-label-sm',
                  on ? 'border-primary bg-primary-lighter text-primary' : 'border-border text-text-secondary',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
