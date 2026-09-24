import { describe, expect, it } from 'vitest';

import { dashboardSerializer } from '@/serializers/dashboardSerializer';

describe('dashboardSerializer', () => {
  it('maps the server’s colour severities onto the semantic ones', () => {
    const d = dashboardSerializer({
      alerts: [
        { id: 'overdue', severity: 'red', message: 'a' },
        { id: 'pending_bills', severity: 'amber', message: 'b' },
        { id: 'pending_delivery', severity: 'blue', message: 'c' },
        { id: 'x', severity: 'warning', message: 'd' },
        { id: 'y', severity: 'purple', message: 'e' },
      ],
    });
    expect(d.alerts.map((a) => a.severity)).toEqual([
      'danger',
      'warning',
      'info',
      'warning',
      'info',
    ]);
  });

  it('reads the delivery breakdown, including the snake_case in-transit key', () => {
    const d = dashboardSerializer({
      deliveryBreakdown: {
        pending: 2,
        assigned: '1',
        in_transit: 3,
        delivered: 10,
        failed: 1,
        cancelled: 4,
      },
      deliveryTotal: 21,
    });
    expect(d.deliveries).toEqual({
      pending: 2,
      assigned: 1,
      inTransit: 3,
      delivered: 10,
      failed: 1,
      // The server's total, which also counts cancelled orders.
      total: 21,
    });
  });

  it('zeroes deliveries when the server sends none, and sums when it sends no total', () => {
    expect(dashboardSerializer({}).deliveries.total).toBe(0);
    expect(
      dashboardSerializer({ deliveryBreakdown: { pending: 2, delivered: 3 } })
        .deliveries.total,
    ).toBe(5);
  });

  it('still derives net income from revenue less expenses', () => {
    const d = dashboardSerializer({ totalRevenue: '1000.50', totalExpenses: 1500 });
    expect(d.netIncome).toBeCloseTo(-499.5);
  });
});
