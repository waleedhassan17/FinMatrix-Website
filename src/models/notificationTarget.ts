// ═══════════════════════════════════════════════════════
// Where a notification opens
// ═══════════════════════════════════════════════════════
// The server stores each notification's subject in `data`, keyed by type (see
// the backend's notifications callers). Its `data.route` values are the mobile
// app's screen names, not web paths, so the web maps each type itself.

export interface NotificationLike {
  type: string;
  data: Record<string, unknown> | null;
}

const idOf = (data: Record<string, unknown> | null, key: string): string | null => {
  const v = data?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
};

/**
 * The page a notification is about, or null when it has nowhere to go (an
 * unknown type, or one whose id is missing).
 */
export function notificationTarget(n: NotificationLike): string | null {
  switch (n.type) {
    // "Bill photo received — review needed" (to admins), and the rider's
    // "approved / rejected / reversed" result. `requestId` is the completion.
    case 'inventory_approvals':
    case 'approval_results': {
      const id = idOf(n.data, 'requestId');
      return id
        ? `/deliveries/completions?focus=${encodeURIComponent(id)}`
        : '/deliveries/completions';
    }
    case 'delivery_assigned': {
      const id = idOf(n.data, 'deliveryId');
      return id ? `/deliveries/${encodeURIComponent(id)}` : '/deliveries';
    }
    case 'personnel_plan_locked':
      return '/delivery-personnel';
    // Billing screens are off in this build; My Account shows the plan.
    case 'subscription_activated':
    case 'subscription_rejected':
    case 'subscription_expiring':
    case 'subscription_expired':
      return '/account';
    default:
      return null;
  }
}
