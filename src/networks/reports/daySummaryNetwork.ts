// ═══════════════════════════════════════════════════════
// FinMatrix Web — Day Summary
// ═══════════════════════════════════════════════════════

import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import {
  dayEntriesSerializer,
  daySummarySerializer,
  dayScheduleSerializer,
  type DayEntriesPage,
  type DayEntryFilter,
  type DayEntrySort,
  type DaySummary,
  type DaySummarySchedule,
} from '@/serializers/daySummarySerializer';

/**
 * One day of business: counts and totals per document type, money in and out
 * by method, top customers and items, the team, and what needs a look.
 *
 * `date` omitted means the company's business day today (the server decides,
 * in the company's time zone). Staff always get their own documents only,
 * whatever `createdBy` says; an owner may narrow to one member.
 */
export const getDaySummary = async (params: {
  date?: string | null;
  createdBy?: string | null;
}): Promise<DaySummary> => {
  try {
    const response = await api.get('/reports/day-summary', {
      params: {
        ...(params.date ? { date: params.date } : {}),
        ...(params.createdBy ? { createdBy: params.createdBy } : {}),
      },
    });
    return daySummarySerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export interface DayEntriesQuery {
  date: string;
  type?: DayEntryFilter;
  createdBy?: string | null;
  /** Document number or party name. */
  q?: string | null;
  sort?: DayEntrySort;
  page?: number;
  limit?: number;
}

/** One page of the day's documents — the Day Book. */
export const getDayEntries = async (params: DayEntriesQuery): Promise<DayEntriesPage> => {
  try {
    const response = await api.get('/reports/day-summary/entries', {
      params: {
        date: params.date,
        ...(params.type && params.type !== 'all' ? { type: params.type } : {}),
        ...(params.createdBy ? { createdBy: params.createdBy } : {}),
        ...(params.q ? { q: params.q } : {}),
        ...(params.sort && params.sort !== 'newest' ? { sort: params.sort } : {}),
        page: params.page ?? 1,
        limit: params.limit ?? 50,
      },
    });
    return dayEntriesSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/** The owner's end-of-day digest settings. Owner only. */
export const getDaySummarySchedule = async (): Promise<DaySummarySchedule> => {
  try {
    const response = await api.get('/reports/day-summary/schedule');
    return dayScheduleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

export const saveDaySummarySchedule = async (
  patch: Partial<Pick<DaySummarySchedule, 'enabled' | 'hour' | 'email'>>,
): Promise<DaySummarySchedule> => {
  try {
    const response = await api.put('/reports/day-summary/schedule', patch);
    return dayScheduleSerializer(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};

/**
 * Every row of a Day Book view, for an export: pages of 1,000 until the view
 * is complete or `cap` rows are in hand. `truncated` says the cap was hit.
 */
export const getAllDayEntries = async (
  params: Omit<DayEntriesQuery, 'page' | 'limit'>,
  cap = 10000,
): Promise<{ items: DayEntriesPage['items']; total: number; truncated: boolean }> => {
  const items: DayEntriesPage['items'] = [];
  let total = 0;
  for (let page = 1; items.length < cap; page++) {
    const p = await getDayEntries({ ...params, page, limit: 1000 });
    total = p.total;
    items.push(...p.items);
    if (p.items.length === 0 || items.length >= p.total) break;
  }
  return { items: items.slice(0, cap), total, truncated: total > cap };
};
