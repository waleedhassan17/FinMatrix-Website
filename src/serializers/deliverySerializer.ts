// ═══════════════════════════════════════════════════════
// FinMatrix Web — Delivery serializer
// ═══════════════════════════════════════════════════════
// Deliveries, riders, rider-return completions and the monitor's map data.
// Quantities and money arrive as decimal strings; coordinates as numbers or
// strings depending on the column. Everything goes through toNumber.

import type {
  Completion,
  CompletionStatus,
  Delivery,
  DeliveryHistoryEntry,
  DeliveryIssue,
  DeliveryLine,
  DeliveryPriority,
  DeliveryStatus,
  Rider,
  RiderStatus,
} from '@/models/delivery';
import { toNumber } from '@/utils/money';

type Raw = Record<string, unknown>;

const asRaw = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const num = (v: unknown): number => toNumber(v as never);
const nullableNum = (v: unknown): number | null =>
  v === null || v === undefined || v === '' ? null : num(v);
const nullableStr = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const mapDeliveryLine = (raw: unknown): DeliveryLine => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    itemId: str(r.itemId),
    itemName: str(r.itemName),
    orderedQty: num(r.orderedQty ?? r.quantity),
    deliveredQty: num(r.deliveredQty),
    returnedQty: num(r.returnedQty),
    unitPrice: num(r.unitPrice),
    taxRate: num(r.taxRate),
  };
};

export const mapDelivery = (raw: unknown): Delivery => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    referenceNo: str(r.referenceNo),
    customerId: str(r.customerId),
    customerName: str(r.customerName),
    zone: str(r.zone),
    address: str(r.address),
    destLat: nullableNum(r.destLat),
    destLng: nullableNum(r.destLng),
    personnelId: nullableStr(r.personnelId ?? r.assignedTo),
    status: (str(r.status) || 'unassigned') as DeliveryStatus,
    priority: (str(r.priority) || 'normal') as DeliveryPriority,
    preferredDate: str(r.preferredDate ?? r.scheduledDate).slice(0, 10),
    preferredTimeSlot: str(r.preferredTimeSlot),
    assignedAt: str(r.assignedAt),
    completedAt: str(r.completedAt),
    notes: str(r.notes),
    cancelReason: str(r.cancelReason),
    paidStatus: r.paidStatus === 'paid' || r.paidStatus === 'unpaid' ? r.paidStatus : null,
    prepaid: r.prepaid === true,
    salesOrderId: nullableStr(r.salesOrderId),
    invoiceId: nullableStr(r.invoiceId),
    ledgerStatus: str(r.ledgerStatus) || 'none',
    createdAt: str(r.createdAt),
    lines: arr(r.items).map(mapDeliveryLine),
  };
};

export const mapHistoryEntry = (raw: unknown): DeliveryHistoryEntry => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    status: str(r.status) as DeliveryStatus,
    timestamp: str(r.timestamp ?? r.createdAt),
    notes: str(r.notes),
    changedBy: str(r.changedBy),
  };
};

export const mapIssue = (raw: unknown): DeliveryIssue => {
  const r = asRaw(raw);
  return {
    id: str(r.id),
    issueType: str(r.issueType),
    notes: str(r.notes),
    reportedAt: str(r.reportedAt ?? r.createdAt),
    reportedBy: str(r.reportedBy),
  };
};

export const mapRider = (raw: unknown): Rider => {
  const r = asRaw(raw);
  const status = str(r.status);
  return {
    userId: str(r.userId),
    name: str(r.name),
    username: str(r.username),
    email: str(r.email),
    phone: str(r.phone),
    vehicleType: str(r.vehicleType),
    vehicleNumber: str(r.vehicleNumber),
    zones: arr(r.zones).map(String),
    maxLoad: num(r.maxLoad),
    currentLoad: num(r.currentLoad),
    isAvailable: r.isAvailable === true,
    // plan_locked must not fall through to 'active': a paused rider cannot sign
    // in or take work, and showing them as active would say they can.
    status: (status === 'on_leave' || status === 'inactive' || status === 'plan_locked'
      ? status
      : 'active') as RiderStatus,
    rating: num(r.rating),
    totalDeliveries: num(r.totalDeliveries),
    onTimeRate: num(r.onTimeRate),
    currentLat: nullableNum(r.currentLat),
    currentLng: nullableNum(r.currentLng),
    locationUpdatedAt: nullableStr(r.locationUpdatedAt),
    createdAt: str(r.createdAt),
  };
};

export const mapCompletion = (raw: unknown): Completion => {
  const r = asRaw(raw);
  const proof = asRaw(r.proof);
  const status = str(r.status);
  return {
    id: str(r.id),
    deliveryId: str(r.deliveryId),
    deliveryReference: str(r.deliveryReference),
    personnelId: str(r.personnelId),
    personnelName: str(r.personnelName),
    submittedAt: str(r.submittedAt),
    status: (status === 'approved' || status === 'rejected' ? status : 'pending') as CompletionStatus,
    reviewedAt: nullableStr(r.reviewedAt),
    reviewedBy: nullableStr(r.reviewedBy),
    reviewerRole: nullableStr(r.reviewerRole),
    reviewerComment: str(r.reviewerComment),
    reversalCreditMemoId: nullableStr(r.reversalCreditMemoId),
    changes: arr(r.changes).map((c) => {
      const x = asRaw(c);
      return {
        itemId: str(x.itemId),
        itemName: str(x.itemName),
        beforeQty: num(x.beforeQty),
        deliveredQty: num(x.deliveredQty),
        returnedQty: num(x.returnedQty),
      };
    }),
    proof: {
      signedBy: str(proof.signedBy),
      billPhotoUri: str(proof.billPhotoUri),
      billPhotoCapturedAt: nullableStr(proof.billPhotoCapturedAt),
      verificationMethod: str(proof.verificationMethod),
    },
    paidStatus: r.paidStatus === 'paid' ? 'paid' : 'unpaid',
    prepaid: r.prepaid === true,
    ledgerStatus: str(r.ledgerStatus),
    customerId: nullableStr(r.customerId),
    customerName: str(r.customerName),
    saleAmount: num(r.saleAmount),
  };
};

// ─── Monitor map data ───────────────────────────────────

export interface MonitorMarker {
  deliveryId: string;
  status: DeliveryStatus;
  priority: DeliveryPriority;
  customerName: string;
  personnelId: string | null;
  itemCount: number;
  address: string;
  destination: { lat: number | null; lng: number | null } | null;
  rider: { lat: number | null; lng: number | null; isOnline: boolean; locationUpdatedAt: string | null } | null;
}

export interface MonitorSummary {
  total: number;
  unassigned: number;
  pending: number;
  inTransit: number;
  delivered: number;
  failed: number;
}

export interface MonitorData {
  markers: MonitorMarker[];
  summary: MonitorSummary;
  locatedPersonnel: number;
}

export const mapMonitorData = (raw: unknown): MonitorData => {
  const r = asRaw(raw);
  const s = asRaw(r.summary);
  return {
    markers: arr(r.markers).map((m) => {
      const x = asRaw(m);
      const dest = x.destination ? asRaw(x.destination) : null;
      const p = x.personnel ? asRaw(x.personnel) : null;
      return {
        deliveryId: str(x.deliveryId),
        status: str(x.status) as DeliveryStatus,
        priority: (str(x.priority) || 'normal') as DeliveryPriority,
        customerName: str(x.customerName),
        personnelId: nullableStr(x.personnelId),
        itemCount: num(x.itemCount),
        address: str(x.address),
        destination: dest ? { lat: nullableNum(dest.lat), lng: nullableNum(dest.lng) } : null,
        rider: p
          ? {
              lat: nullableNum(p.lat),
              lng: nullableNum(p.lng),
              isOnline: p.isOnline === true,
              locationUpdatedAt: nullableStr(p.locationUpdatedAt),
            }
          : null,
      };
    }),
    summary: {
      total: num(s.total),
      unassigned: num(s.unassigned),
      pending: num(s.pending),
      inTransit: num(s.inTransit),
      delivered: num(s.delivered),
      failed: num(s.failed),
    },
    locatedPersonnel: num(r.locatedPersonnel),
  };
};
