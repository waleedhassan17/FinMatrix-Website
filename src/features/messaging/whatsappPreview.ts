import { normalizeWhatsappPhone } from '@/features/share/shareDocument';

/**
 * How a WhatsApp number reads once saved — "+92 300 1234567" — by the same
 * rule as the wa.me hand-off (normalizeWhatsappPhone) and the server.
 * Null when it is not a usable number.
 */
export function formatWhatsappPreview(raw: string | null | undefined): string | null {
  const digits = normalizeWhatsappPhone(raw ?? '');
  if (!digits) return null;
  if (digits.startsWith('92') && digits.length === 12) return `+92 ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return `+${digits}`;
}

/** Masked as the server shows it: +92300***4567. */
export function maskWhatsapp(raw: string | null | undefined): string | null {
  const digits = normalizeWhatsappPhone(raw ?? '') ?? (raw ? String(raw).replace(/\D/g, '') : '');
  if (!digits || digits.length < 9) return null;
  return `+${digits.slice(0, 5)}***${digits.slice(-4)}`;
}
