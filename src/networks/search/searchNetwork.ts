// ═══════════════════════════════════════════════════════
// FinMatrix Web — Global search network
// ═══════════════════════════════════════════════════════

import { parseSearchResults, type SearchHit } from '@/models/search';
import { api, toApiError, unwrapEnvelope } from '@/networks/network/apiHelpers';

/**
 * `GET /search?q=` across customers, vendors, invoices, bills and inventory.
 *
 * Errors are thrown, not swallowed into an empty list: a search that failed has
 * to look different from one that genuinely found nothing.
 */
export const searchAll = async (query: string, signal?: AbortSignal): Promise<SearchHit[]> => {
  try {
    const response = await api.get('/search', { params: { q: query }, signal });
    return parseSearchResults(unwrapEnvelope(response.data));
  } catch (e) {
    throw toApiError(e);
  }
};
