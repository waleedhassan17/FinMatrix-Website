import { fetchAllPages, listPaginationOf } from '@/models/documentList';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';
import { listRows } from '@/serializers/inventorySerializer';

/**
 * Every row of a paged list, walked page by page — for a set that must be
 * complete: a picker's options, a payroll run's employees, a report's rows.
 *
 * These used to be "one generous fetch" (limit 200 or 500) because the
 * response envelope stripped the page count; past that many, rows silently
 * went missing. The server now sends its pagination, so every page is read.
 */
export async function getAllRows<T>(
  path: string,
  params: Record<string, unknown>,
  map: (raw: unknown) => T,
  keyOf?: (row: T) => string | undefined,
): Promise<T[]> {
  try {
    return await fetchAllPages(async (page, limit) => {
      const response = await api.get(path, { params: { ...params, page, limit } });
      const rows = listRows(unwrapEnvelope(response.data)).map(map);
      return { rows, totalPages: listPaginationOf(response.data, rows.length).totalPages };
    }, 200, keyOf);
  } catch (e) {
    throw toApiError(e);
  }
}
