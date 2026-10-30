import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useReportParams } from '@/features/reports/useReportParams';

/** Marks the history entry the panel pushed, so closing knows it may step back over it. */
const PUSHED = 'reportPanelPushed';

/**
 * The drill-down open on a report, held in the URL under `key`.
 *
 * Opening PUSHES a history entry, so the browser's Back closes the panel and
 * leaves the reader on the statement where they were. Closing with the ✕ or
 * Escape steps back over that same entry when this page pushed it — otherwise
 * Back would land on an identical URL and seem to do nothing — and only
 * clears the parameter when the panel arrived with the link itself.
 */
export function useInspectParam(key = 'inspect') {
  const { params, update } = useReportParams();
  const navigate = useNavigate();
  const location = useLocation();
  const value = params.get(key);
  const pushedHere = Boolean((location.state as Record<string, unknown> | null)?.[PUSHED]);

  const open = useCallback(
    (next: string, extra: Record<string, string | null> = {}) => {
      update({ [key]: next, ...extra }, { push: true, state: { [PUSHED]: true } });
    },
    [key, update],
  );

  const close = useCallback(() => {
    if (pushedHere) navigate(-1);
    else update({ [key]: null });
  }, [key, navigate, pushedHere, update]);

  return { value, open, close };
}
