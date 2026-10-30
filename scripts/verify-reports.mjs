#!/usr/bin/env node
// ═══════════════════════════════════════════════════════
// FinMatrix Web — Report tie-out
// ═══════════════════════════════════════════════════════
// Asserts the accounting identities that have to hold BETWEEN reports. Unit tests
// prove each serializer handles its own payload; only real data can prove the
// statements agree with each other, and a statement that balances in isolation
// while contradicting its neighbour is the failure mode that matters.
//
// Read-only: every request is a GET against a report endpoint. Nothing is created,
// changed or deleted, so it is safe to point at production.
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/verify-reports.mjs
//   API_BASE=http://localhost:3000/api/v1 ADMIN_EMAIL=... node scripts/verify-reports.mjs
//
// Exits non-zero if any tie fails.

const API =
  process.env.API_BASE ||
  'https://finmatrix-api-prod-665c6b5cb6a1.herokuapp.com/api/v1';
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(
    'ADMIN_EMAIL and ADMIN_PASSWORD are required.\n' +
      '  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/verify-reports.mjs',
  );
  process.exit(2);
}

let token = '';
let companyId = '';
let passed = 0;
const failures = [];

const n = (v) => {
  const x = parseFloat(String(v ?? '0'));
  return Number.isFinite(x) ? x : 0;
};

/** A paisa of tolerance: the ledger carries four decimals and reports show two. */
const ties = (a, b) => Math.abs(n(a) - n(b)) < 0.01;

const check = (name, ok, detail) => {
  if (ok) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}`);
    if (detail !== undefined) console.log(`      ${JSON.stringify(detail)}`);
  }
};

const get = async (path) => {
  const res = await fetch(`${API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'x-company-id': companyId,
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const body = await res.json();
  // The statement reports are unenveloped; dashboard and analytics are not.
  return body && body.success !== undefined && body.data !== undefined
    ? body.data
    : body;
};

const signIn = async () => {
  const res = await fetch(`${API}/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status}`);
  const payload = await res.json();
  const d = payload.data ?? payload;
  token = d?.tokens?.accessToken ?? '';
  companyId = d?.companyId ?? '';
  if (!token || !companyId) throw new Error('sign-in returned no token or company');
  return d;
};

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;

const main = async () => {
  const session = await signIn();
  const today = iso(new Date());
  // All of history, so the P&L and the balance sheet describe the same window and
  // their net-income figures are comparable. A narrower P&L would legitimately
  // differ from the equity line and prove nothing.
  const from = '1970-01-01';

  console.log(`\n${session.company?.name ?? 'company'}  ·  as of ${today}`);
  console.log(`${API}\n`);

  const [pnl, bs, tb, cf, ledger, ar, ap, inv, dash] = await Promise.all([
    get(`/reports/profit-loss?startDate=${from}&endDate=${today}`),
    get(`/reports/balance-sheet?asOfDate=${today}`),
    get(`/reports/trial-balance?startDate=${from}&endDate=${today}`),
    get(`/reports/cash-flow?startDate=${from}&endDate=${today}`),
    get(`/ledger?startDate=${from}&endDate=${today}`),
    get('/reports/ar-aging'),
    get('/reports/ap-aging'),
    get('/reports/inventory-valuation'),
    get('/reports/dashboard'),
  ]);

  console.log('Trial Balance');
  check('debits equal credits', ties(tb.totalDebits, tb.totalCredits), {
    debits: tb.totalDebits,
    credits: tb.totalCredits,
  });
  check('the server agrees it balances', tb.isBalanced === true);
  check('every row sits in exactly one column', (tb.rows ?? []).every(
    (r) => n(r.debit) === 0 || n(r.credit) === 0,
  ));

  console.log('\nBalance Sheet');
  const le = n(bs.totalLiabilities) + n(bs.totalEquity);
  check('assets equal liabilities plus equity', ties(bs.totalAssets, le), {
    assets: bs.totalAssets,
    liabilitiesAndEquity: le,
  });
  check('the server agrees it balances', bs.isBalanced === true);

  console.log('\nProfit & Loss');
  check(
    'gross profit less expenses equals net income',
    ties(n(pnl.grossProfit) - n(pnl.expenses), pnl.netIncome),
    { grossProfit: pnl.grossProfit, expenses: pnl.expenses, netIncome: pnl.netIncome },
  );
  // The real cross-report tie. The backend derives the equity line through the
  // same rounded gross profit the P&L uses, specifically so these agree exactly.
  const equityNetIncome = (bs.equity ?? []).find((e) =>
    /net income/i.test(String(e.accountName)),
  );
  if (bs.fiscalYearStart) {
    // Reports v2 splits equity: the line is THIS fiscal year's earnings, and
    // the years before sit in Retained Earnings. So it ties to the P&L for the
    // fiscal year to date, not for all of history.
    const fyPnl = await get(`/reports/profit-loss?startDate=${bs.fiscalYearStart}&endDate=${today}`);
    check(
      'net income (current fiscal year) matches the P&L for the fiscal year to date',
      equityNetIncome !== undefined && ties(equityNetIncome.amount, fyPnl.netIncome),
      { pnl: fyPnl.netIncome, balanceSheet: equityNetIncome?.amount ?? null, from: bs.fiscalYearStart },
    );
  } else {
    check(
      'net income matches the balance sheet equity line',
      equityNetIncome !== undefined && ties(equityNetIncome.amount, pnl.netIncome),
      { pnl: pnl.netIncome, balanceSheet: equityNetIncome?.amount ?? null },
    );
  }

  console.log('\nCash Flow');
  check(
    'beginning plus net change equals ending cash',
    ties(n(cf.beginningCash) + n(cf.netChange), cf.endingCash),
    {
      beginning: cf.beginningCash,
      netChange: cf.netChange,
      ending: cf.endingCash,
    },
  );
  // The server's Cash and Bank section when it groups (reports v2); otherwise
  // Cash and Bank occupy 1000-1099 in the seeded chart.
  const cashSection = (bs.sections ?? []).find((sec) => sec.key === 'cashAndBank');
  const bsCash = cashSection
    ? n(cashSection.subtotal)
    : (bs.assets ?? [])
        .filter((a) => /^\d+$/.test(String(a.accountCode)) && Number(a.accountCode) < 1100)
        .reduce((s, a) => s + n(a.amount), 0);
  check('ending cash matches balance sheet cash', ties(bsCash, cf.endingCash), {
    balanceSheetCash: Math.round(bsCash * 100) / 100,
    endingCash: cf.endingCash,
  });

  console.log('\nGeneral Ledger');
  const entries = ledger.entries ?? [];
  check('period debits equal period credits', ties(ledger.totals?.debit, ledger.totals?.credit), {
    debit: ledger.totals?.debit,
    credit: ledger.totals?.credit,
  });
  check(
    'entries are oldest first',
    entries.every((e, i) => i === 0 || String(e.date) >= String(entries[i - 1].date)),
  );
  check(
    'every row can be drilled into',
    entries.every((e) => Boolean(e.sourceId)),
  );

  console.log('\nAging');
  for (const [label, report] of [
    ['AR', ar],
    ['AP', ap],
  ]) {
    const t = report.totals ?? {};

    // The five legacy fields, which the server still computes on 30/60/90
    // whatever preset was asked for. A shipped Android build and the analytics
    // A/R trend read these, so they keep being checked.
    const legacySum =
      n(t.current) +
      n(t.bucket1to30) +
      n(t.bucket31to60) +
      n(t.bucket61to90) +
      n(t.bucket90Plus);
    check(`${label} legacy buckets sum to the total`, ties(legacySum, t.total), {
      buckets: Math.round(legacySum * 100) / 100,
      total: t.total,
    });

    // The configurable columns, which is what the clients now render.
    const buckets = report.buckets ?? [];
    check(`${label} describes its own buckets`, buckets.length > 0, {
      preset: report.preset,
      buckets: buckets.map((b) => b.label),
    });
    const amountSum = buckets.reduce(
      (s, b) => s + n((t.amounts ?? {})[b.key]),
      0,
    );
    check(`${label} configurable buckets sum to the total`, ties(amountSum, t.total), {
      preset: report.preset,
      buckets: Math.round(amountSum * 100) / 100,
      total: t.total,
    });

    // Both shapes describe the SAME money. This is the identity that lets the
    // report be re-bucketed at all: slicing changes how the total is divided,
    // never what it is — which is what keeps AR aging tied to balance-sheet
    // 1100 and AP to 2000 under every preset.
    check(`${label} both bucket shapes agree`, ties(legacySum, amountSum), {
      legacy: Math.round(legacySum * 100) / 100,
      configurable: Math.round(amountSum * 100) / 100,
    });

    const rowSum = (report.rows ?? []).reduce((s, r) => s + n(r.total), 0);
    check(`${label} rows sum to the total`, ties(rowSum, t.total), {
      rows: Math.round(rowSum * 100) / 100,
      total: t.total,
    });
  }

  // Re-bucketing must not move the total. Asked for explicitly rather than
  // inferred, because this is the one property the whole feature rests on: if a
  // preset could change the total, the aging report would stop tying to its
  // control account and the books would disagree with themselves.
  console.log('\nAging — re-bucketing');
  for (const [label, path] of [
    ['AR', 'ar-aging'],
    ['AP', 'ap-aging'],
  ]) {
    const base = label === 'AR' ? ar : ap;
    for (const preset of ['days3', 'weekly', 'monthly']) {
      const alt = await get(`/reports/${path}?preset=${preset}`);
      const altTotal = n((alt.totals ?? {}).total);
      check(`${label} total is unchanged under preset=${preset}`, ties(altTotal, base.totals?.total), {
        preset,
        total: altTotal,
        baseline: base.totals?.total,
      });
      const altBuckets = alt.buckets ?? [];
      const altSum = altBuckets.reduce(
        (s, b) => s + n((alt.totals?.amounts ?? {})[b.key]),
        0,
      );
      check(`${label} preset=${preset} columns foot`, ties(altSum, altTotal), {
        columns: altBuckets.length,
        sum: Math.round(altSum * 100) / 100,
        total: altTotal,
      });
    }
  }

  // NOT a tie, and deliberately reported rather than asserted.
  //
  // The dashboard's outstandingAR sums every invoice balance whose status is not
  // paid or void — DRAFTS INCLUDED. The aging report excludes drafts, because
  // nothing is owed on an invoice that was never issued. The aging figure is the
  // correct measure of receivables; the gap below should be exactly the drafts on
  // file, and a non-zero gap is information, not a failure.
  const arGap = n(dash.outstandingAR) - n(ar.totals?.total);
  console.log('\nDashboard comparison (informational)');
  console.log(
    `  dashboard outstandingAR ${n(dash.outstandingAR).toFixed(2)}  ` +
      `aging total ${n(ar.totals?.total).toFixed(2)}  ` +
      `gap ${arGap.toFixed(2)} (expected: draft invoices)`,
  );
  check('AP aging agrees with the dashboard', ties(dash.pendingAP, ap.totals?.total), {
    dashboard: dash.pendingAP,
    aging: ap.totals?.total,
  });

  console.log('\nInventory');
  const invRowSum = (inv.rows ?? []).reduce((s, r) => s + n(r.value), 0);
  check('item values sum to the total', ties(invRowSum, inv.totalValue), {
    rows: Math.round(invRowSum * 100) / 100,
    total: inv.totalValue,
  });
  const catSum = (inv.byCategory ?? []).reduce((s, c) => s + n(c.totalValue), 0);
  check('category values sum to the total', ties(catSum, inv.totalValue));
  // Inventory is a subledger of account 1200; if they disagree, stock and the
  // control account have drifted.
  const bsInventory = (bs.assets ?? []).find((a) => String(a.accountCode) === '1200');
  check(
    'inventory total matches the balance sheet Inventory account',
    bsInventory === undefined || ties(bsInventory.amount, inv.totalValue),
    { balanceSheet: bsInventory?.amount ?? null, valuation: inv.totalValue },
  );

  // The value-over-time series is the SAME control account read month by month,
  // so its last point — this month's close — has to be where the snapshot is
  // standing. If these drift, the trend is telling a story the balance sheet
  // does not support, which is worse than having no trend.
  const trend = await get('/reports/inventory-valuation/trend?months=12');
  const points = trend.points ?? [];
  check('valuation trend returns a full window', points.length === 12, {
    points: points.length,
  });
  const latest = points[points.length - 1];
  check(
    'the trend closes where the valuation snapshot stands',
    latest === undefined || ties(latest.value, inv.totalValue),
    { trendLatest: latest?.value ?? null, valuation: inv.totalValue },
  );
  // A zero mid-series is NOT checked, deliberately: a company that sold all its
  // stock in March genuinely closes March at nothing, and asserting otherwise
  // would be a check that cannot pass. What is checkable is the shape — the
  // window must be contiguous, oldest first, and every point must close on a
  // real month end, which is what makes "the last point is today's balance"
  // mean anything.
  const monthEnds = points.every((p) => {
    const [y, m, d] = String(p.asOfDate).split('-').map(Number);
    return Boolean(y && m && d) && d === new Date(Date.UTC(y, m, 0)).getUTCDate();
  });
  check('every trend point closes on a month end', monthEnds, {
    dates: points.map((p) => p.asOfDate),
  });
  const ordered = points.every(
    (p, i) => i === 0 || String(points[i - 1].period) < String(p.period),
  );
  check('trend months run oldest first, with no repeats', ordered, {
    periods: points.map((p) => p.period),
  });

  // ── Item margin reconciles to the P&L ───────────────────────────────
  //
  // Per-item figures can never simply equal revenue and cost of sales: sales
  // tax, service lines, manual journal entries, bills coded straight to cost
  // and supplier returns all sit in those accounts with no item to own them.
  // The report names each of those, and this asserts the naming is exhaustive
  // — goods sold plus every reconciling line must equal the ledger.
  //
  // Checked here rather than in qa/invariants.sql because the arithmetic lives
  // in the endpoint: writing it again in SQL means re-deriving the same case
  // analysis somewhere it can drift from the code it checks.
  console.log('\nItem margin');
  const perf = await get(
    `/reports/inventory-performance?startDate=${from}&endDate=${today}`,
  );
  const rc = perf.reconciliation ?? {};
  check('the report describes its own reconciliation', Array.isArray(rc.items), {
    keys: Object.keys(rc),
  });

  const namedRevenue = (rc.items ?? []).reduce((s, i) => s + n(i.revenue), 0);
  const namedCogs = (rc.items ?? []).reduce((s, i) => s + n(i.cogs), 0);

  check(
    'goods sold plus the named parts equal the P&L revenue',
    ties(n(rc.itemRevenue) + namedRevenue, n(rc.glRevenue)),
    { goodsSold: rc.itemRevenue, named: Math.round(namedRevenue * 100) / 100, pl: rc.glRevenue },
  );
  check(
    'goods sold plus the named parts equal the P&L cost of sales',
    ties(n(rc.itemCogs) + namedCogs, n(rc.glCogs)),
    { goodsSold: rc.itemCogs, named: Math.round(namedCogs * 100) / 100, pl: rc.glCogs },
  );

  // Revenue is net of tax on both arms. `line_total` includes tax and the
  // ledger does not — worth 45,117.80 on real books before it was corrected —
  // so an item report exceeding the P&L's revenue is that bug returning.
  check(
    'item revenue does not exceed the P&L',
    n(rc.itemRevenue) <= n(rc.glRevenue) + 0.01,
    { item: rc.itemRevenue, pl: rc.glRevenue },
  );

  const rowsWithMargin = (perf.rows ?? []).filter((r) => n(r.revenue) !== 0);
  check(
    'every trading row reports a margin',
    rowsWithMargin.every((r) => r.marginPct !== null && r.marginPct !== undefined),
    { rows: rowsWithMargin.length },
  );

  // ── The item explorer agrees with the report it opens from ─────────
  //
  // Three endpoints feed one item's page and each has to agree with the row
  // it was opened from: the item's sales for a window equal that row's, its
  // stock history ends on the quantity and value the row shows, and a month's
  // documents add up to that month. Over the last twelve months rather than
  // all time, because the monthly series stops at sixty months.
  console.log('\nItem explorer');
  const now = new Date();
  const windowStart = iso(new Date(now.getFullYear(), now.getMonth() - 11, 1));
  const window = `startDate=${windowStart}&endDate=${today}`;
  const recent = await get(`/reports/inventory-performance?${window}`);
  const top = [...(recent.rows ?? [])].sort((a, b) => n(b.revenue) - n(a.revenue))[0];
  if (!top || n(top.revenue) === 0) {
    console.log('  – nothing sold in the last twelve months; skipped');
  } else {
    const id = encodeURIComponent(top.itemId);
    const itemPerf = await get(`/reports/item-performance/${id}?${window}`);
    check(`${top.itemName}: the explorer's revenue is the report's`, ties(itemPerf.totals?.revenue, top.revenue), {
      explorer: itemPerf.totals?.revenue,
      report: top.revenue,
    });
    check(`${top.itemName}: …and so is its gross profit`, ties(itemPerf.totals?.grossProfit, top.grossProfit), {
      explorer: itemPerf.totals?.grossProfit,
      report: top.grossProfit,
    });

    const history = await get(`/reports/inventory-valuation/items/${id}/history?${window}`);
    const last = (history.points ?? [])[(history.points ?? []).length - 1] ?? {};
    check(`${top.itemName}: stock history ends on the quantity on hand`, ties(last.closingQty, top.qtyOnHand), {
      history: last.closingQty,
      onHand: top.qtyOnHand,
    });
    if (last.valueKnown) {
      check(`${top.itemName}: …at the value the report carries it at`, ties(last.closingValue, top.stockValue), {
        history: last.closingValue,
        report: top.stockValue,
      });
    }

    // The busiest month, and the documents behind it.
    const busiest = [...(itemPerf.points ?? [])].sort((a, b) => n(b.revenue) - n(a.revenue))[0];
    const [y, m] = busiest.period.split('-').map(Number);
    const monthEnd = iso(new Date(y, m, 0));
    let entries = null;
    try {
      entries = await get(
        `/reports/item-performance/${id}/entries?startDate=${busiest.period}-01&endDate=${monthEnd < today ? monthEnd : today}&limit=100`,
      );
    } catch (e) {
      console.log(`  – documents behind a month: ${e.message} (a server without the endpoint)`);
    }
    if (entries) {
      check('the documents arrive as an object, not a bare array', !Array.isArray(entries) && Array.isArray(entries.entries));
      check(`${busiest.label}'s documents add up to the month`, ties(entries.totals?.revenue, busiest.revenue), {
        documents: entries.totals?.revenue,
        month: busiest.revenue,
      });
      if ((entries.entries ?? []).length >= n(entries.total)) {
        const listed = entries.entries.reduce((t, e) => t + n(e.revenue), 0);
        check(`${busiest.label}'s listed lines add up too`, ties(listed, busiest.revenue), {
          listed: Math.round(listed * 100) / 100,
          month: busiest.revenue,
        });
      }
    }

    // The revenue breakdown: who bought it and how it went out add up to the
    // same window, and the stock facts follow the Health tab's own lists.
    if (Array.isArray(itemPerf.channels)) {
      const parts = (itemPerf.customers ?? []).length + (itemPerf.otherCustomers?.count ?? 0);
      const byCustomer = (itemPerf.customers ?? []).reduce((t, c) => t + n(c.revenue), 0) + n(itemPerf.otherCustomers?.revenue);
      check(`${top.itemName}: its customers add up to its revenue`, tiesWithin(byCustomer, itemPerf.totals?.revenue, parts), {
        customers: Math.round(byCustomer * 100) / 100,
        revenue: itemPerf.totals?.revenue,
      });
      const outRevenue = itemPerf.channels.reduce((t, c) => t + n(c.revenue), 0) + n(itemPerf.returns?.revenue);
      const outUnits = itemPerf.channels.reduce((t, c) => t + n(c.unitsSold), 0) + n(itemPerf.returns?.unitsSold);
      check(`${top.itemName}: …and so do its channels and returns`, tiesWithin(outRevenue, itemPerf.totals?.revenue, 3) && ties(outUnits, itemPerf.totals?.unitsSold), {
        channels: Math.round(outRevenue * 100) / 100,
        units: outUnits,
        totals: itemPerf.totals,
      });
      const shares = [...(itemPerf.customers ?? []), ...(itemPerf.otherCustomers?.count ? [itemPerf.otherCustomers] : [])].map((c) => c.sharePct);
      if (shares.every((x) => x !== null && x !== undefined)) {
        const sum = shares.reduce((t, x) => t + n(x), 0);
        check(`${top.itemName}: its customer shares make 100%`, Math.abs(sum - 100) < 0.05 * shares.length, { sum });
      }
      const fact = itemPerf.item ?? {};
      const health = await get('/reports/inventory-health');
      const reorder = (health.belowReorder ?? []).find((x) => x.itemId === top.itemId);
      check(`${top.itemName}: low or out of stock exactly when the reorder list has it`, (fact.suggestedOrderQty !== null) === !!reorder, {
        stockStatus: fact.stockStatus,
        explorer: fact.suggestedOrderQty,
        reorderList: reorder?.suggestedOrderQty ?? null,
      });
      if (reorder) check(`${top.itemName}: …suggesting the same order`, ties(reorder.suggestedOrderQty, fact.suggestedOrderQty));
      const dead = (health.deadStock?.items ?? []).some((x) => x.itemId === top.itemId);
      check(`${top.itemName}: dead stock exactly when the Health tab lists it`, !!fact.deadStock === dead, { explorer: fact.deadStock, health: dead });
      check(`${top.itemName}: its days of cover carry a verdict`, fact.cover && ['healthy', 'watch', 'risk', 'neutral'].includes(fact.cover.level), { cover: fact.cover?.level, days: fact.daysOfCover });
    } else {
      console.log('  – no revenue breakdown (a server before it)');
    }
  }

  // ── The P&L drill-down survives the response envelope ───────────────
  //
  // It shipped returning its rows under a key named `data`, which the envelope
  // interceptor lifted into its own slot while discarding every sibling — so
  // the clients received a bare array and showed "no transactions" for every
  // account. An array here means that has come back.
  console.log('\nP&L drill-down');
  const plForDrill = await get(
    `/reports/profit-loss?startDate=${from}&endDate=${today}`,
  );
  const drillLine =
    (plForDrill.income ?? [])[0] ??
    (plForDrill.cogsLines ?? [])[0] ??
    (plForDrill.expenseLines ?? [])[0];

  if (drillLine?.accountCode) {
    const drill = await get(
      `/reports/profit-loss/lines/${drillLine.accountCode}/entries?startDate=${from}&endDate=${today}&limit=5`,
    );
    check('the drill-down returns an object, not a bare array', !Array.isArray(drill), {
      got: Array.isArray(drill) ? 'array' : typeof drill,
    });
    check('it carries entries and its own metadata', Array.isArray(drill.entries) && drill.lineAmount !== undefined && drill.total !== undefined, {
      keys: Object.keys(drill ?? {}),
    });
    check(
      'every row names the document behind it',
      (drill.entries ?? []).every((e) => !!e.documentNumber),
      { sample: (drill.entries ?? [])[0]?.documentNumber },
    );
  }

  await verifyReportsV2({ today, bs });

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n  ${failures.join('\n  ')}` : ''),
  );
  process.exit(failures.length === 0 ? 0 : 1);
};

// ═══════════════════════════════════════════════════════
// Reports v2 — the investigable statements
// ═══════════════════════════════════════════════════════
// Every v2 endpoint, and the identity each must keep: sections foot to the
// totals the web prints, every drill sums to the line it opens from, the KPIs
// are numbers or null and never Infinity. Skipped, not failed, against a
// server that predates v2 — the checks above still cover that one.

/** Rounded lines can drift a paisa each from a total taken at full precision. */
const tiesWithin = (a, b, lines) => Math.abs(n(a) - n(b)) < 0.01 * Math.max(1, lines);

const ASSET_KEYS = ['cashAndBank', 'receivables', 'inventory', 'otherCurrentAssets', 'fixedAssets'];
const LIABILITY_KEYS = ['currentLiabilities', 'longTermLiabilities'];

const total = (bs, key) => {
  const t = Array.isArray(bs.subtotals)
    ? bs.subtotals.find((x) => x.key === key)
    : (bs.subtotals ?? bs.totals ?? {})[key];
  return t === undefined ? undefined : n(typeof t === 'object' ? (t.amount ?? t.value) : t);
};

const priorMonthEnd = (asOf) => {
  const d = new Date(`${asOf}T00:00:00`);
  return iso(new Date(d.getFullYear(), d.getMonth(), 0));
};

const verifyReportsV2 = async ({ today, bs }) => {
  console.log('\nReports v2');
  if (!Array.isArray(bs.sections) || bs.sections.length === 0) {
    console.log('  – skipped: this server predates reports v2 (no balance-sheet sections)');
    return;
  }
  const fy = bs.fiscalYearStart;

  // ── Balance sheet sections ────────────────────────────────────────────
  for (const sec of bs.sections) {
    const sum = (sec.lines ?? []).reduce((t, l) => t + n(l.amount), 0);
    check(`BS ${sec.label}: lines sum to the subtotal`, tiesWithin(sum, sec.subtotal, sec.lines.length), {
      lines: Math.round(sum * 100) / 100,
      subtotal: sec.subtotal,
    });
  }
  const side = (keys) => bs.sections.filter((s) => keys.includes(s.key)).reduce((t, s) => t + n(s.subtotal), 0);
  check('BS asset sections sum to total assets', tiesWithin(side(ASSET_KEYS), bs.totalAssets, 5));
  check('BS liability sections sum to total liabilities', tiesWithin(side(LIABILITY_KEYS), bs.totalLiabilities, 2));
  const le = total(bs, 'totalLiabilitiesAndEquity');
  if (le !== undefined) check('BS L + E total equals total assets', ties(le, bs.totalAssets), { le, assets: bs.totalAssets });
  const equity = bs.sections.find((s) => s.key === 'equity');
  const codes = (equity?.lines ?? []).map((l) => l.accountCode).filter(Boolean);
  check('no two equity lines share an account code', new Set(codes).size === codes.length, { codes });
  check(
    'synthetic lines carry no account code',
    bs.sections.every((s) => (s.lines ?? []).every((l) => !l.synthetic || !l.accountCode)),
  );

  const compareTo = priorMonthEnd(today);
  const [compared, atPrior] = await Promise.all([
    get(`/reports/balance-sheet?asOfDate=${today}&compareTo=${compareTo}`),
    get(`/reports/balance-sheet?asOfDate=${compareTo}`),
  ]);
  check('BS comparison totals equal the balance sheet at that date', ties(compared.comparison?.totalAssets, atPrior.totalAssets), {
    comparison: compared.comparison?.totalAssets,
    atPrior: atPrior.totalAssets,
  });

  // ── Retained earnings rollforward ─────────────────────────────────────
  const reLine = (equity?.lines ?? []).find((l) => l.composite || l.synthetic === 'retainedEarnings');
  if (reLine) {
    const re = await get(`/reports/balance-sheet/retained-earnings?asOfDate=${today}`);
    check('retained earnings rollforward totals the balance-sheet line', ties(re.total, reLine.amount), {
      rollforward: re.total,
      line: reLine.amount,
    });
  }

  // ── Register and movement, on the largest asset line ──────────────────
  const assetLines = bs.sections
    .filter((s) => ASSET_KEYS.includes(s.key))
    .flatMap((s) => s.lines ?? [])
    .filter((l) => l.accountCode && !l.synthetic)
    .sort((a, b) => Math.abs(n(b.amount)) - Math.abs(n(a.amount)));
  const target = assetLines[0];
  if (target && fy) {
    const reg = await get(`/reports/accounts/${target.accountCode}/register?startDate=${fy}&endDate=${today}&limit=50`);
    // The server's signed movement; an asset is debit-normal if it sends none.
    const period = reg.periodNet !== undefined ? n(reg.periodNet) : n(reg.periodDebit) - n(reg.periodCredit);
    check(`register ${target.accountCode}: opening + movement = closing`, ties(n(reg.openingBalance) + period, reg.closingBalance));
    check(`register ${target.accountCode}: closing ties to the balance sheet`, ties(reg.closingBalance, target.amount), {
      register: reg.closingBalance,
      line: target.amount,
    });
    if (n(reg.total) > 50) {
      const page2 = await get(`/reports/accounts/${target.accountCode}/register?startDate=${fy}&endDate=${today}&limit=50&page=2`);
      const last = reg.entries[reg.entries.length - 1];
      const first = page2.entries[0];
      check('register running balance continues across a page', ties(n(last.runningBalance) + n(first.amount), first.runningBalance));
    }
    const mv = await get(
      `/reports/accounts/${target.accountCode}/movement?startDate=${fy}&endDate=${today}&compareStartDate=${fy.replace(/^\d{4}/, (y) => String(Number(y) - 1))}&compareEndDate=${today.replace(/^\d{4}/, (y) => String(Number(y) - 1))}`,
    );
    const byParty = (mv.byCounterparty ?? []).reduce((t, x) => t + n(x.change), 0);
    check('movement: the counterparty changes sum to the change', tiesWithin(byParty, mv.change, (mv.byCounterparty ?? []).length), {
      parties: Math.round(byParty * 100) / 100,
      change: mv.change,
    });
  }

  // ── Trial balance, every mode ─────────────────────────────────────────
  const start = fy || `${today.slice(0, 4)}-01-01`;
  const [tbClosing, tbWorking, tbMovement] = await Promise.all([
    get(`/reports/trial-balance?mode=closing&endDate=${today}`),
    get(`/reports/trial-balance?mode=working&startDate=${start}&endDate=${today}`),
    get(`/reports/trial-balance?mode=movement&startDate=${start}&endDate=${today}`),
  ]);
  for (const [label, t] of [
    ['closing', tbClosing],
    ['movement', tbMovement],
  ]) {
    check(`TB ${label}: debits equal credits`, ties(t.totalDebits, t.totalCredits) && t.isBalanced === true);
    for (const g of t.groups ?? []) {
      const rows = (t.rows ?? []).filter((r) => r.group === g.key);
      const dr = rows.reduce((s, r) => s + n(r.debit), 0);
      const cr = rows.reduce((s, r) => s + n(r.credit), 0);
      check(`TB ${label} ${g.label}: rows sum to the group subtotal`, tiesWithin(dr, g.debit, rows.length) && tiesWithin(cr, g.credit, rows.length), {
        rows: [Math.round(dr * 100) / 100, Math.round(cr * 100) / 100],
        group: [g.debit, g.credit],
      });
    }
  }
  // Flat per pair (`openingDebit` …) with the verdicts in `balanced`.
  const wt = tbWorking.totals ?? {};
  for (const pair of ['opening', 'period', 'closing']) {
    const dr = wt[`${pair}Debit`] ?? wt[pair]?.debit;
    const cr = wt[`${pair}Credit`] ?? wt[pair]?.credit;
    if (dr === undefined) continue;
    check(`TB working ${pair}: debits equal credits`, ties(dr, cr) && tbWorking.balanced?.[pair] !== false, { debit: dr, credit: cr });
  }
  // The closing trial balance and the balance sheet are the same ledger on the
  // same day: the asset rows' net is total assets.
  const assetNet = (tbClosing.rows ?? [])
    .filter((r) => r.accountType === 'asset')
    .reduce((t, r) => t + n(r.debit) - n(r.credit), 0);
  if ((tbClosing.rows ?? []).some((r) => r.accountType)) {
    check('TB closing assets equal the balance sheet’s total assets', tiesWithin(assetNet, bs.totalAssets, (tbClosing.rows ?? []).length), {
      trialBalance: Math.round(assetNet * 100) / 100,
      balanceSheet: bs.totalAssets,
    });
  }

  // ── Cash flow ─────────────────────────────────────────────────────────
  const cf = await get(`/reports/cash-flow?startDate=${start}&endDate=${today}`);
  for (const key of ['operating', 'investing', 'financing']) {
    const sec = cf[key] ?? { lines: [], total: 0 };
    const sum = (sec.lines ?? []).reduce((t, l) => t + n(l.amount), 0);
    check(`CF ${key}: lines sum to the section`, tiesWithin(sum, sec.total, (sec.lines ?? []).length));
  }
  check('CF sections sum to the net change', ties(n(cf.operating?.total) + n(cf.investing?.total) + n(cf.financing?.total), cf.netChange));
  if (Array.isArray(cf.accounts) && cf.accounts.length) {
    const ending = cf.accounts.reduce((t, a) => t + n(a.ending), 0);
    check('CF bank accounts sum to ending cash', tiesWithin(ending, cf.endingCash, cf.accounts.length));
  }
  const bsAtEnd = await get(`/reports/balance-sheet?asOfDate=${today}`);
  const cashAndBank = (bsAtEnd.sections ?? []).find((s) => s.key === 'cashAndBank');
  if (cashAndBank) check('CF ending cash equals the balance sheet’s cash and bank', ties(cf.endingCash, cashAndBank.subtotal));
  if (cf.cashTie) {
    check('CF states its own tie, and it holds', cf.cashTie.ties === true && ties(cf.cashTie.balanceSheetCash, cashAndBank?.subtotal ?? cf.cashTie.balanceSheetCash), cf.cashTie);
  }
  if (Array.isArray(cf.monthly) && cf.monthly.length) {
    // Cash in and out by month: each month foots to its net, the nets to the
    // statement, and the month-end cash is the trend's.
    const m = cf.monthly;
    check('CF monthly: cash in and out are never negative', m.every((x) => n(x.inflow) >= 0 && n(x.outflow) >= 0));
    check('CF monthly: in − out is each month’s net', m.every((x) => ties(n(x.inflow) - n(x.outflow), x.net)), m.filter((x) => !ties(n(x.inflow) - n(x.outflow), x.net)));
    check('CF monthly: the nets sum to the net change', tiesWithin(m.reduce((t, x) => t + n(x.net), 0), cf.netChange, m.length));
    const trend = cf.monthlyTrend ?? [];
    check('CF monthly: month-end cash is the trend’s', m.length === trend.length && m.every((x, i) => ties(x.endingCash, trend[i]?.endingCash)));
  }
  const keyed = [...(cf.operating?.lines ?? []), ...(cf.investing?.lines ?? []), ...(cf.financing?.lines ?? [])].filter((l) => l.lineKey);
  for (const l of keyed.slice(0, 4)) {
    const e = await get(`/reports/cash-flow/lines/${encodeURIComponent(l.lineKey)}/entries?startDate=${start}&endDate=${today}&limit=200`);
    if (n(e.total) <= (e.entries ?? []).length) {
      const allocated = e.entries.reduce((t, x) => t + n(x.allocatedAmount ?? x.amount), 0);
      check(`CF ${l.lineKey}: the entries sum to the line`, tiesWithin(allocated, l.amount, e.entries.length), {
        entries: Math.round(allocated * 100) / 100,
        line: l.amount,
      });
    }
  }

  // ── Financial health: numbers or null, never Infinity ─────────────────
  const health = await get(`/reports/financial-health?asOfDate=${today}`);
  const kpis = Array.isArray(health.kpis) ? health.kpis : Object.values(health.kpis ?? health);
  check(
    'every KPI is a finite number or null',
    kpis.every((k) => k && (k.value === null || Number.isFinite(Number(k.value)))),
    kpis.filter((k) => k && k.value !== null && !Number.isFinite(Number(k.value))).map((k) => k.key),
  );

  const LEVELS = ['healthy', 'watch', 'risk', 'neutral'];
  const assessed = (k) => k?.assessment && LEVELS.includes(k.assessment.level) && typeof k.assessment.guide === 'string' && k.assessment.guide.length > 0;
  if (kpis.some((k) => k?.assessment)) {
    check('every KPI carries an assessment with a guide', kpis.every(assessed), kpis.filter((k) => !assessed(k)).map((k) => k?.key));
  }

  // ── Aging insights ────────────────────────────────────────────────────
  for (const [label, path] of [
    ['AR', '/reports/ar-aging'],
    ['AP', '/reports/ap-aging'],
  ]) {
    const a = await get(path);
    if (!a.insights) continue;
    const sched = (a.insights.schedule ?? []).reduce((t, s) => t + n(s.amount), 0);
    check(`${label} schedule sums to the open total`, ties(sched, a.insights.totalOpen));
    check(`${label} open total equals the aging total`, ties(a.insights.totalOpen, a.totals?.total));
    if (a.insights.assessments) {
      const as = a.insights.assessments;
      check(
        `${label} overdue, lateness and concentration are each assessed`,
        ['overduePct', 'weightedAvgDaysOverdue', 'top5SharePct'].every((k) => assessed({ assessment: as[k] })),
        as,
      );
    }
  }

  // ── Inventory health and as-of valuation ──────────────────────────────
  const [ih, valuation, asOf] = await Promise.all([
    get(`/reports/inventory-health?asOfDate=${today}`),
    get('/reports/inventory-valuation'),
    get(`/reports/inventory-valuation?asOfDate=${today}`),
  ]);
  const deadValue = n(ih.deadStock?.totalValue ?? ih.deadStockValue);
  check('dead stock is part of the valuation, never more', deadValue <= n(valuation.totalValue) + 0.01);
  for (const series of ['byLastInbound', 'byLastOutbound']) {
    const buckets = Array.isArray(ih.aging) ? ih.aging : (ih.aging?.[series] ?? []);
    const aged = buckets.reduce((t, b) => t + n(b.value), 0);
    check(`stock aged ${series} is no more than the valuation`, aged <= n(valuation.totalValue) + 0.01, {
      aged: Math.round(aged * 100) / 100,
      valuation: valuation.totalValue,
    });
  }
  const located = (ih.byLocation ?? []).reduce((t, l) => t + n(l.value), 0);
  check('stock by location is no more than the valuation', located <= n(valuation.totalValue) + 0.01);
  if (asOf.ledgerTie) {
    check('as-of valuation states its tie to 1200', asOf.ledgerTie.gap !== undefined, asOf.ledgerTie);
  }

  // ── Owner cockpit: the series are the P&L ─────────────────────────────
  const [cockpit, pnlRange] = await Promise.all([
    get(`/reports/analytics?startDate=${start}&endDate=${today}`),
    get(`/reports/profit-loss?startDate=${start}&endDate=${today}`),
  ]);
  const series = Array.isArray(cockpit.series) ? cockpit.series : [];
  if (series.length) {
    const rev = series.reduce((t, m) => t + n(m.revenue), 0);
    const ni = series.reduce((t, m) => t + n(m.netIncome), 0);
    check('cockpit revenue by month sums to the P&L', tiesWithin(rev, pnlRange.revenue, series.length), { series: rev, pnl: pnlRange.revenue });
    check('cockpit net income by month sums to the P&L', tiesWithin(ni, pnlRange.netIncome, series.length), { series: ni, pnl: pnlRange.netIncome });
  }
  if (Array.isArray(cockpit.insights)) {
    const REPORTS = ['profitLoss', 'balanceSheet', 'cashFlow', 'arAging', 'apAging', 'inventoryValuation', 'budgets'];
    const TONES = ['negative', 'warning', 'positive', 'neutral'];
    const ins = cockpit.insights;
    check('cockpit says what stands out, at most six things', ins.length > 0 && ins.length <= 6, ins.length);
    check(
      'cockpit insights each name a real report and a tone',
      ins.every((i) => REPORTS.includes(i.report?.key) && TONES.includes(i.tone) && i.title && i.detail),
      ins.filter((i) => !REPORTS.includes(i.report?.key) || !TONES.includes(i.tone)),
    );
    const rank = ins.map((i) => TONES.indexOf(i.tone));
    check('cockpit insights lead with what needs attention', rank.every((r, i) => i === 0 || rank[i - 1] <= r), rank);
    check('cockpit KPIs each carry an assessment', (cockpit.kpis ?? []).every(assessed));
  }

  // ── The donuts' slices: top five + Other, footed by the server ─────────
  const five = await get(`/reports/analytics?startDate=${start}&endDate=${today}&expenseTop=5&customerTop=5`);
  if (Array.isArray(five.expenseByAccount) && five.insights) {
    const named = five.expenseByAccount.filter((x) => x.accountName !== 'Other');
    check('expense donut: at most five accounts and Other', named.length <= 5 && five.expenseByAccount.length <= 6);
    check(
      'expense donut: the slices sum to operating expenses',
      tiesWithin(five.expenseByAccount.reduce((t, x) => t + n(x.amount), 0), pnlRange.totalExpenses, five.expenseByAccount.length),
    );
    const sc = five.salesByCustomer ?? {};
    check('customer donut: at most five customers', (sc.customers ?? []).length <= 5);
    check(
      'customer donut: customers and Other sum to the total',
      tiesWithin((sc.customers ?? []).reduce((t, x) => t + n(x.amount), 0) + n(sc.other?.amount), sc.total, (sc.customers ?? []).length + 1),
    );
  }

  // ── Zero balances on request: lines added, nothing moved ──────────────
  const [bsZero, tbPlain, tbZero] = await Promise.all([
    get(`/reports/balance-sheet?asOfDate=${today}&includeZero=true`),
    get(`/reports/trial-balance?startDate=${start}&endDate=${today}&mode=closing`),
    get(`/reports/trial-balance?startDate=${start}&endDate=${today}&mode=closing&includeZero=true`),
  ]);
  const lineCount = (x) => (x.sections ?? []).reduce((t, s) => t + (s.lines ?? []).length, 0);
  if (lineCount(bsZero) > lineCount(bsAtEnd)) {
    check(
      'BS with zero balances keeps every total',
      ['totalAssets', 'totalLiabilities', 'totalEquity'].every((k) => ties(bsZero[k], bsAtEnd[k])) &&
        (bsZero.sections ?? []).every((s, i) => ties(s.subtotal, bsAtEnd.sections?.[i]?.subtotal)),
    );
    check('BS zero lines are zero', (bsZero.sections ?? []).flatMap((s) => s.lines).filter((l) => !(bsAtEnd.sections ?? []).some((t) => t.lines.some((x) => x.accountCode === l.accountCode && x.synthetic === l.synthetic))).every((l) => n(l.amount) === 0));
  }
  if ((tbZero.rows ?? []).length > (tbPlain.rows ?? []).length) {
    check('TB with zero rows keeps its totals', ties(tbZero.totalDebits, tbPlain.totalDebits) && ties(tbZero.totalCredits, tbPlain.totalCredits) && tbZero.isBalanced === tbPlain.isBalanced);
  }
};

main().catch((e) => {
  console.error(`\nverification could not run: ${e.message}`);
  process.exit(2);
});
