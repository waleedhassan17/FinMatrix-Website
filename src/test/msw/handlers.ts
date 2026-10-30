// ═══════════════════════════════════════════════════════
// FinMatrix Web — MSW handlers for the reports v2 API
// ═══════════════════════════════════════════════════════
// Bare JSON for the routes that write their own response (balance sheet,
// trial balance, cash flow, aging, inventory valuation — `@Res()` on the
// server) and the `{ success, data }` envelope for the newer routes that go
// through ResponseEnvelopeInterceptor. That split is the real API's, and
// `unwrapEnvelope` has to cope with both.

import { http, HttpResponse } from 'msw';

import {
  arAgingV2,
  balanceSheetV2,
  cashFlowLineEntries,
  cashFlowV2,
  financialHealthV2,
  inventoryHealthV2,
  movementCash,
  ownerCockpitV2,
  registerCash,
  retainedEarningsV2,
  trialBalanceClosing,
  trialBalanceMovement,
  trialBalanceWorking,
} from '@/test/msw/reportsV2Fixtures';

const enveloped = (data: unknown) => HttpResponse.json({ success: true, data });

/** Every request a report page makes, by path, so a test can assert on them. */
export const requestLog: URL[] = [];

export const reportsV2Handlers = [
  http.get('*/reports/balance-sheet/retained-earnings', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(retainedEarningsV2);
  }),
  http.get('*/reports/balance-sheet', ({ request }) => {
    requestLog.push(new URL(request.url));
    return HttpResponse.json(balanceSheetV2);
  }),
  http.get('*/reports/financial-health', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(financialHealthV2);
  }),
  http.get('*/reports/accounts/:code/register', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(registerCash);
  }),
  http.get('*/reports/accounts/:code/movement', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(movementCash);
  }),
  http.get('*/reports/trial-balance', ({ request }) => {
    const url = new URL(request.url);
    requestLog.push(url);
    const mode = url.searchParams.get('mode');
    return HttpResponse.json(
      mode === 'working' ? trialBalanceWorking : mode === 'movement' ? trialBalanceMovement : trialBalanceClosing,
    );
  }),
  http.get('*/reports/cash-flow/lines/:lineKey/entries', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(cashFlowLineEntries);
  }),
  http.get('*/reports/cash-flow', ({ request }) => {
    requestLog.push(new URL(request.url));
    return HttpResponse.json(cashFlowV2);
  }),
  http.get('*/reports/ar-aging', ({ request }) => {
    requestLog.push(new URL(request.url));
    return HttpResponse.json(arAgingV2);
  }),
  http.get('*/reports/inventory-health', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(inventoryHealthV2);
  }),
  http.get('*/reports/analytics', ({ request }) => {
    requestLog.push(new URL(request.url));
    return enveloped(ownerCockpitV2);
  }),
];
