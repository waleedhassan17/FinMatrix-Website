import { describe, expect, it } from 'vitest';

import { notificationTarget } from '@/models/notificationTarget';

describe('notificationTarget', () => {
  it('opens the completion a bill photo needs reviewing on', () => {
    // QA's case: "Bill photo received — review needed … DEL-MTU289X3-KXAP".
    expect(
      notificationTarget({
        type: 'inventory_approvals',
        data: { requestId: 'req-1', route: 'InventoryApproval' },
      }),
    ).toBe('/deliveries/completions?focus=req-1');
  });

  it('opens the completion for an approval result', () => {
    expect(
      notificationTarget({ type: 'approval_results', data: { requestId: 'req-2', route: 'DPHistory' } }),
    ).toBe('/deliveries/completions?focus=req-2');
  });

  it('opens an assigned delivery', () => {
    expect(
      notificationTarget({ type: 'delivery_assigned', data: { deliveryId: 'd-9', referenceNo: 'DEL-1' } }),
    ).toBe('/deliveries/d-9');
  });

  it('opens the list when the id is missing', () => {
    expect(notificationTarget({ type: 'inventory_approvals', data: null })).toBe('/deliveries/completions');
    expect(notificationTarget({ type: 'delivery_assigned', data: { deliveryId: '' } })).toBe('/deliveries');
  });

  it('opens riders and the account for plan notices', () => {
    expect(notificationTarget({ type: 'personnel_plan_locked', data: { lockedUserIds: ['u1'] } })).toBe(
      '/delivery-personnel',
    );
    for (const type of ['subscription_activated', 'subscription_rejected', 'subscription_expiring', 'subscription_expired']) {
      expect(notificationTarget({ type, data: { route: 'billing' } })).toBe('/account');
    }
  });

  it('encodes ids into the URL', () => {
    expect(notificationTarget({ type: 'delivery_assigned', data: { deliveryId: 'a/b' } })).toBe('/deliveries/a%2Fb');
  });

  it('has nowhere to go for an unknown type', () => {
    expect(notificationTarget({ type: 'info', data: null })).toBeNull();
  });
});
