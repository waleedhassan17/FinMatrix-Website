// ═══════════════════════════════════════════════════════
// FinMatrix Web — Bill & Bill-Payment Network
// ═══════════════════════════════════════════════════════

import {
  api,
  authedBlobUrl,
  isPendingApproval,
  postMultipart,
  toApiError,
  unwrapEnvelope,
  type PendingApproval,
} from '@/networks/network/apiHelpers';
import {
  billListSerializer,
  billPaymentsSerializer,
  billSingleSerializer,
  mapBill,
  type BillPaymentRow,
  type BillWritePayload,
} from '@/serializers/billSerializer';
import { asRaw, str } from '@/serializers/documentLines';
import type { Bill, BillStatus } from '@/models/bill';
import type { AllocationRow } from '@/models/allocation';
import { toNumber } from '@/utils/money';

export interface BillQueryParams {
  search?: string;
  status?: BillStatus;
  vendorId?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export type BillWriteResult =
  | { pending: false; bill: Bill }
  | { pending: true; approval: PendingApproval };

/** A fresh key per submit, so a retried POST cannot double-post. */
const idempotencyKey = (): Record<string, string> => ({
  'Idempotency-Key': crypto.randomUUID(),
});

/**
 * List bills.
 *
 * Never pass `status: 'overdue'` — the column never holds that value, so the
 * server can only answer with an empty list. The Overdue tab filters the
 * loaded rows against the derived status instead.
 */
export const getBills = async (params: BillQueryParams = {}): Promise<Bill[]> => {
  const { fromDate, toDate, status, ...rest } = params;
  const query: Record<string, unknown> = { ...rest };
  if (status && status !== 'overdue') query.status = status;
  if (fromDate && toDate) {
    query.startDate = fromDate;
    query.endDate = toDate;
  }

  try {
    const response = await api.get('/bills', { params: query });
    return billListSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const getBillById = async (id: string): Promise<Bill | null> => {
  try {
    const response = await api.get(`/bills/${id}`);
    return billSingleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Create a bill.
 *
 * `bill.create` is **direct for staff** — recording what a supplier has
 * invoiced you is bookkeeping, not a commitment, and the approval gate sits on
 * paying it instead. The pending branch is still narrowed because the server,
 * not the client, decides.
 */
export const createBill = async (
  data: BillWritePayload,
): Promise<BillWriteResult> => {
  try {
    const response = await api.post('/bills', data, { headers: idempotencyKey() });
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) return { pending: true, approval: payload };
    return { pending: false, bill: mapBill(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};

/** Drafts only — a posted bill is refused with CANNOT_EDIT_POSTED. */
export const updateBill = async (
  id: string,
  data: Partial<BillWritePayload>,
): Promise<Bill> => {
  try {
    const response = await api.patch(`/bills/${id}`, data);
    return mapBill(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Draft → open. This is what posts the AP journal entry. */
export const postBill = async (id: string): Promise<Bill> => {
  try {
    const response = await api.patch(`/bills/${id}/status`, { status: 'open' });
    return mapBill(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** Admin only, and refused once anything has been paid against the bill. */
export const deleteBill = async (id: string): Promise<void> => {
  try {
    await api.delete(`/bills/${id}`);
  } catch (e) {
    throw toApiError(e);
  }
};

export const getBillPayments = async (
  billId: string,
): Promise<BillPaymentRow[]> => {
  try {
    const response = await api.get(`/bills/${billId}/payments`);
    return billPaymentsSerializer(unwrapEnvelope(response.data), billId);
  } catch (e) {
    throw toApiError(e);
  }
};

// ═══════════════════════════════════════════════════════
// Module 12 — Pay Bills
// ═══════════════════════════════════════════════════════

/**
 * Unpaid bills for a vendor, as allocation rows.
 *
 * There is no dedicated "outstanding" route on the AP side (the AR side has
 * one), so this filters the vendor's bills on the derived balance. Draft bills
 * are excluded: paying one is refused with BILL_NOT_POSTED, so offering it
 * would only produce an error at submit time.
 */
export const getPayableBills = async (
  vendorId: string,
): Promise<AllocationRow[]> => {
  const bills = await getBills({ vendorId, limit: 200 });
  return bills
    .filter((b) => b.balance > 0 && b.status !== 'draft' && b.status !== 'void')
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
    .map((b) => ({
      documentId: b.id,
      documentNumber: b.billNumber || `Bill ${b.id.slice(0, 8)}`,
      dueDate: b.dueDate,
      total: b.total,
      amountPaid: b.amountPaid,
      balance: b.balance,
      checked: false,
      applied: '',
    }));
};

export interface PaymentProof {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const PROOF_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * Upload a payment proof, returning the id the payment must carry.
 *
 * The multipart field name is **`proof`** — multer is configured with
 * `FileInterceptor('proof')` and any other name is dropped before the handler
 * sees it, producing a confusing "file is required".
 */
export const uploadPaymentProof = async (file: File): Promise<PaymentProof> => {
  const form = new FormData();
  form.append('proof', file);

  const payload = unwrapEnvelope(
    await postMultipart('/bill-payments/proofs', form),
  );
  const r = asRaw(payload);
  const proof = asRaw(r.proof ?? r);
  return {
    id: str(proof.id),
    fileName: str(proof.fileName ?? proof.originalName ?? file.name),
    mimeType: str(proof.mimeType ?? file.type),
    fileSize: toNumber((proof.fileSize ?? file.size) as never),
  };
};

/**
 * Fetch a proof for display.
 *
 * This route is the only `StreamableFile` in the API and it uses
 * `@Res({ passthrough: true })`, which leaves the global response-envelope
 * interceptor in the chain — so the bytes are very likely wrapped in JSON while
 * the header still claims `image/png`. The caller sniffs the blob's type and
 * degrades to a filename rather than rendering a broken image. See the
 * follow-ups; the fix is one line, server-side.
 */
export const getPaymentProofUrl = (proofId: string): Promise<string> =>
  authedBlobUrl(`/bill-payments/proofs/${proofId}/file`);

/**
 * The **write** shape. The wire is asymmetric: the server accepts `amount` and
 * returns `amountApplied` (see `billPaymentsSerializer`, which reads both). One
 * type cannot serve both directions, so this mirrors `PaymentApplicationPayload`
 * on the AR side and is named for the request, not the response.
 *
 * Sending `amountApplied` here does not fail loudly — the server's ValidationPipe
 * runs with `whitelist: true`, so an undeclared key is stripped and `amount`
 * arrives undefined, surfacing as "applications.0.amount must be a number string".
 */
export interface BillPaymentApplicationPayload {
  billId: string;
  amount: string;
}

export interface PayBillsPayload {
  vendorId: string;
  paymentDate: string;
  paymentMethod: string;
  bankAccountId: string;
  proofId: string;
  applications: BillPaymentApplicationPayload[];
  reference?: string;
}

export type PayBillsResult =
  | { pending: false; payment: Record<string, unknown> }
  | { pending: true; approval: PendingApproval };

/**
 * Record a payment against one or more bills.
 *
 * Three ways this differs from receiving a customer payment, all enforced
 * server-side:
 *
 *   • **`proofId` is required.** There is no route into BillsService.pay that
 *     skips it. Money leaving the bank is evidenced; money arriving is not.
 *   • **`bankAccountId` is required.** Unlike the AR side there is no fallback
 *     to a default cash account, so the picker cannot offer "Automatic".
 *   • **There is no top-level `amount`.** The payment total IS the sum of
 *     `applications`, which must hold at least one entry. No unapplied amount,
 *     no prepayment, and paying more than a bill owes is refused outright with
 *     PAYMENT_EXCEEDS_BALANCE.
 */
export const payBills = async (
  data: PayBillsPayload,
): Promise<PayBillsResult> => {
  try {
    const response = await api.post('/bills/pay', data, {
      headers: idempotencyKey(),
    });
    const payload = unwrapEnvelope(response.data);
    if (isPendingApproval(payload)) return { pending: true, approval: payload };
    return { pending: false, payment: asRaw(payload) };
  } catch (e) {
    throw toApiError(e);
  }
};
