import { keepPreviousData, useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { DocumentPage } from '@/models/documentList';

/**
 * A list the SERVER pages, searches and filters: "Load more" fetches the next
 * page, and the counts and figures come from the server's summary — over every
 * row the filters match, not the rows loaded so far.
 *
 * `queryKey` must hold every filter (search, tab, dates) so a change starts
 * over from page one; `fetchPage` asks for one page with those filters.
 */
export function usePagedList<T>(
  queryKey: QueryKey,
  fetchPage: (page: number) => Promise<DocumentPage<T>>,
  options: { enabled?: boolean } = {},
) {
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.rows) ?? [], [query.data]);
  const first = query.data?.pages[0];
  return {
    rows,
    summary: first?.summary ?? null,
    extras: first?.extras ?? {},
    /** Rows the filters match in all — may exceed what has loaded. */
    total: first?.total ?? rows.length,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => void query.fetchNextPage(),
  };
}
