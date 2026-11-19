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

/** The day's documents, newest first — the Day Book. */
export const getDayEntries = async (params: {
  date: string;
  type?: DayEntryFilter;
  createdBy?: string | null;
  page?: number;
  limit?: number;
}): Promise<DayEntriesPage> => {
  try {
    const response = await api.get('/reports/day-summary/entries', {
      params: {
        date: params.date,
        ...(params.type && params.type !== 'all' ? { type: params.type } : {}),
        ...(params.createdBy ? { createdBy: params.createdBy } : {}),
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
