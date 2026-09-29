import { Button } from '@/components/ui/Button';

/**
 * The foot of a paged list: how much of it is showing, and the way to the rest.
 * Nothing when everything has loaded — a list that simply ends is complete.
 */
export function LoadMore({
  shown,
  total,
  hasMore,
  loading,
  onMore,
}: {
  shown: number;
  total: number;
  hasMore: boolean;
  loading: boolean;
  onMore: () => void;
}) {
  if (!hasMore) return null;
  return (
    <div className="flex flex-col items-center gap-xs">
      <p className="text-caption text-text-tertiary tabular">
        Showing {shown} of {total}
      </p>
      <Button variant="secondary" size="sm" onClick={onMore} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  );
}
