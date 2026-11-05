import { formatWhatsappPreview } from './whatsappPreview';

/** The WhatsApp block of a customer / vendor form. */
export interface WhatsappFieldsState {
  /** As typed. Ignored until `touched`: the server derives it from Phone. */
  value: string;
  touched: boolean;
  optIn: boolean;
  language: '' | 'en' | 'ur';
}

export const emptyWhatsappFields = (): WhatsappFieldsState => ({ value: '', touched: false, optIn: false, language: '' });

export const whatsappFieldsFrom = (c: {
  whatsappE164?: string | null;
  whatsappOptInAt?: string | null;
  preferredLanguage?: 'en' | 'ur' | null;
}): WhatsappFieldsState => ({
  value: c.whatsappE164 ?? '',
  touched: false,
  optIn: !!c.whatsappOptInAt,
  language: c.preferredLanguage ?? '',
});

/** The number the field shows: what was typed, else the phone it defaults to. */
export const effectiveWhatsapp = (s: WhatsappFieldsState, phone: string) => (s.touched ? s.value : s.value || phone);

/** Inline error, or null. Empty is fine (the contact just gets no messages). */
export const whatsappFieldError = (s: WhatsappFieldsState, phone: string): string | null => {
  const v = effectiveWhatsapp(s, phone).trim();
  if (!s.touched || v === '') return null;
  return formatWhatsappPreview(v) ? null : 'Not a WhatsApp number. Use 0300 1234567 or +92 300 1234567.';
};

/** The API fields. The number goes only when edited — untouched, the server keeps or re-derives it. */
export const whatsappPayload = (s: WhatsappFieldsState) => ({
  ...(s.touched ? { whatsappPhone: s.value.trim() } : {}),
  whatsappOptIn: s.optIn,
  ...(s.language ? { preferredLanguage: s.language } : {}),
});
