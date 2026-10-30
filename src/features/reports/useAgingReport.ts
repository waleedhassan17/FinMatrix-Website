import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useReportParams, readEnum } from '@/features/reports/useReportParams';
import {
  AGING_QUICK_FILTERS,
  defaultAgingSort,
  resolveSelectedBucket,
  type AgingQuickFilter,
  type AgingSort,
} from '@/models/reportAging';
import { saveAgingPreference, type AgingParams } from '@/networks/reports/agingNetwork';
import { LEGACY_AGING_BUCKETS, type AgingPresetKey, type AgingReport } from '@/serializers/reportSerializers';

/**
 * Everything both aging pages need: the query, the bucket choice, the filters —
 * and all of it in the URL, so a filtered view can be linked to or reached
 * with Back.
 *
 * The preset starts absent, meaning "whatever this company's default is".
 * The server resolves the saved preference when the request names no preset and
 * echoes back the one it used, so the page opens on the company default without
 * a separate settings round trip — and the chips can show it without a
 * setState-in-effect, by falling through to what the response reported.
 *
 * Which party rows are open stays in memory: it is a moment's reading, not a
 * view anyone links to.
 */
export const useAgingReport = (
  key: string,
  fetcher: (params: AgingParams) => Promise<AgingReport>,
) => {
  const { params: url, update } = useReportParams();
  const PRESETS: readonly AgingPresetKey[] = ['days3', 'weekly', 'biweekly', 'monthly', 'custom'];
  const preset = url.get('preset') && PRESETS.includes(url.get('preset') as AgingPresetKey)
    ? (url.get('preset') as AgingPresetKey)
    : null;
  const customBuckets = url.get('buckets') ?? '3,6,9,12';
  const selectedBucketRaw = url.get('bucket');
  // Absent means "follow the default for the current selection", which is
  // what lets the order switch to oldest-first when a bucket is picked.
  const sortRaw = readEnum<AgingSort | 'auto'>(url.get('sort'), ['oldest', 'total', 'name'], 'auto');
  const search = url.get('q') ?? '';
  const quickFilter = AGING_QUICK_FILTERS.includes(url.get('only') as AgingQuickFilter)
    ? (url.get('only') as AgingQuickFilter)
    : null;
  const columnsView = url.get('cols') === 'account' ? 'account' : 'buckets';
  const chartView = url.get('chart') === 'schedule' ? 'schedule' : 'age';
  const ageChart = url.get('ageChart') === 'bars' ? 'bars' : 'donut';
  const page = Math.max(1, Number(url.get('page')) || 1);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // A custom preset with no boundaries is not sent: the server rejects it, and
  // the user is mid-edit rather than mistaken.
  const params: AgingParams =
    preset === 'custom'
      ? customBuckets.trim()
        ? { preset: 'custom', buckets: customBuckets.trim() }
        : {}
      : preset
        ? { preset }
        : {};

  const query = useQuery({
    queryKey: ['reports', key, params],
    queryFn: () => fetcher(params),
    // Picking another bucket set keeps the current report on screen, dimmed,
    // until the new one lands. Without this the new key starts with no data
    // and the whole page drops to "Loading…" for the length of the request.
    placeholderData: keepPreviousData,
  });

  // A bucket key only means something within the bucket set that produced it:
  // `d31to60` exists under `monthly` and does not exist under `days3`. Validating
  // against the live payload is what stops a stale selection from filtering the
  // table to nothing beneath a chip naming a column that is not on screen.
  const selectedBucket = resolveSelectedBucket(
    selectedBucketRaw,
    query.data?.buckets ?? LEGACY_AGING_BUCKETS,
  );

  // Changing the bucket set invalidates any selection made under the old one,
  // and the order that selection implied. Open panels go too: their documents
  // were bucketed by the spec being replaced.
  const resetInvestigation = { bucket: null, sort: null, page: null };

  return {
    query,
    // Falls through to the server's answer on the first load, when we asked for
    // nothing and it applied the company default.
    preset: preset ?? query.data?.preset ?? null,
    customBuckets,
    onPickPreset: (next: AgingPresetKey) => {
      update({ preset: next, ...resetInvestigation });
      setExpanded({});
      void saveAgingPreference({ preset: next, buckets: customBuckets });
    },
    onApplyCustom: (buckets: string) => {
      update({ preset: 'custom', buckets, ...resetInvestigation });
      setExpanded({});
      void saveAgingPreference({ preset: 'custom', buckets });
    },
    selectedBucket,
    onSelectBucket: (next: string | null) => {
      // A drill-in from the chart: its own history entry, so Back returns to
      // the whole book rather than leaving the report.
      update({ bucket: next, page: null }, { push: true });
      // The open panels were fetched for a different bucket filter, so their
      // contents no longer match the row they sit under.
      setExpanded({});
    },
    sort: sortRaw === 'auto' ? defaultAgingSort(selectedBucket) : sortRaw,
    onChangeSort: (next: AgingSort) => update({ sort: next, page: null }),
    search,
    onChangeSearch: (next: string) => update({ q: next || null, page: null }),
    expanded,
    onToggleParty: (partyId: string) =>
      setExpanded((prev) => ({ ...prev, [partyId]: !prev[partyId] })),
    onOpenParty: (partyId: string) => setExpanded({ [partyId]: true }),
    // What the drill-down must be told, so its buckets are the report's
    // buckets. `selectedBucket` is validated against the live payload above.
    detailParams: { ...params, ...(selectedBucket ? { bucket: selectedBucket } : {}) },
    quickFilter,
    onQuickFilter: (next: AgingQuickFilter | null) => update({ only: next, page: null }),
    columnsView: columnsView as 'buckets' | 'account',
    onColumnsView: (next: 'buckets' | 'account') => update({ cols: next === 'account' ? 'account' : null }),
    chartView: chartView as 'age' | 'schedule',
    onChartView: (next: 'age' | 'schedule') => update({ chart: next === 'schedule' ? 'schedule' : null }),
    ageChart: ageChart as 'donut' | 'bars',
    onAgeChart: (next: 'donut' | 'bars') => update({ ageChart: next === 'bars' ? 'bars' : null }),
    page,
    onPage: (next: number) => update({ page: next > 1 ? String(next) : null }),
  };
};
