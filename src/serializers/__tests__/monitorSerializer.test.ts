import { describe, expect, it } from 'vitest';

import { mapMonitorData } from '@/serializers/deliverySerializer';

/**
 * The monitor marker must carry DUTY, not just GPS.
 *
 * The server has always sent `isAvailable` on each marker's personnel; this
 * serializer used to drop it and keep only `isOnline`, which is derived purely
 * from how recently the phone reported a location. So a rider who went on duty
 * with an empty queue — sending no location pings at all — showed as offline on
 * the Delivery Monitor while the Riders page showed them available. Same row in
 * the database, two different questions, one of them unasked.
 */
describe('mapMonitorData', () => {
  const payload = {
    markers: [
      {
        deliveryId: 'd1',
        deliveryNumber: 'DEL-1',
        status: 'in_transit',
        priority: 'high',
        customerName: 'Bismillah Mart',
        personnelId: 'r1',
        itemCount: 1,
        address: 'Lahore',
        destination: { lat: 31.5, lng: 74.3 },
        personnel: {
          lat: 31.4,
          lng: 74.2,
          isAvailable: true,
          isOnline: false,
          locationUpdatedAt: null,
        },
      },
    ],
    summary: {},
  };

  it('carries duty through, not only GPS liveness', () => {
    const [m] = mapMonitorData(payload).markers;
    // On duty, phone silent — the exact reported case.
    expect(m.rider?.isAvailable).toBe(true);
    expect(m.rider?.isOnline).toBe(false);
  });

  it('defaults a missing duty flag to false rather than undefined', () => {
    const { personnel, ...rest } = payload.markers[0];
    const [m] = mapMonitorData({
      ...payload,
      markers: [{ ...rest, personnel: { ...personnel, isAvailable: undefined } }],
    }).markers;
    expect(m.rider?.isAvailable).toBe(false);
  });

  it('yields a null rider when a delivery has nobody on it', () => {
    const { personnel, ...rest } = payload.markers[0];
    const [m] = mapMonitorData({ ...payload, markers: [rest] }).markers;
    expect(m.rider).toBeNull();
  });
});
