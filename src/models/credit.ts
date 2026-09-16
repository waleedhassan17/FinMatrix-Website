// ═══════════════════════════════════════════════════════
// FinMatrix Web — Customer credit limit
// ═══════════════════════════════════════════════════════

import { ApiError } from '@/networks/network/apiHelpers';
import { toNumber } from '@/utils/money';

/**
 * The server's credit check, as it explains a refusal.
 *
 *   exposure = unpaid invoices + goods shipped on credit not yet invoiced
 *            − advances paid − open credit memos + this shipment or invoice
 */
export interface CreditAssessment {
  customerId: string;
  customerName: string;
  limit: number;
  openInvoices: number;
  inTransit: number;
  shippedNotInvoiced: number;
  advances: number;
  credits: number;
  thisAmount: number;
  exposure: number;
  excess: number;
  requiredAdvance: number;
  withinLimit: boolean;
}

const num = (v: unknown) => toNumber((v ?? 0) as never);

export const toCreditAssessment = (raw: unknown): CreditAssessment | null => {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    customerId: String(r.customerId ?? ''),
    customerName: String(r.customerName ?? ''),
    limit: num(r.limit),
    openInvoices: num(r.openInvoices),
    inTransit: num(r.inTransit),
    shippedNotInvoiced: num(r.shippedNotInvoiced),
    advances: num(r.advances),
    credits: num(r.credits),
    thisAmount: num(r.thisAmount),
    exposure: num(r.exposure),
    excess: num(r.excess),
    requiredAdvance: num(r.requiredAdvance),
    withinLimit: r.withinLimit === true,
  };
};

/** The assessment behind a CREDIT_LIMIT_EXCEEDED refusal, or null for any other error. */
export const creditLimitError = (e: unknown): CreditAssessment | null =>
  e instanceof ApiError && e.code === 'CREDIT_LIMIT_EXCEEDED' ? toCreditAssessment(e.details) : null;

