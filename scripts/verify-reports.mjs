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
  check(
    'net income matches the balance sheet equity line',
    equityNetIncome !== undefined && ties(equityNetIncome.amount, pnl.netIncome),
    { pnl: pnl.netIncome, balanceSheet: equityNetIncome?.amount ?? null },
  );

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
  // Cash and Bank occupy 1000-1099 in the seeded chart.
  const bsCash = (bs.assets ?? [])
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

  console.log(
    `\n${passed} passed, ${failures.length} failed` +
      (failures.length ? `\n  ${failures.join('\n  ')}` : ''),
  );
  process.exit(failures.length === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(`\nverification could not run: ${e.message}`);
  process.exit(2);
});
