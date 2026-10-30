// ═══════════════════════════════════════════════════════
// FinMatrix Web — Report view state in the URL
// ═══════════════════════════════════════════════════════
// Every view a report can show — its period, mode, comparison, filters and
// the account open in the investigate panel — lives in the query string, so
// any view can be linked to, reloaded, or reached with Back.
//
// Two rules the pages rely on:
//   - A value equal to the default is REMOVED rather than written, so the
//     plain URL is the default view and links stay short.
//   - Filters REPLACE the history entry (stepping back through every period
//     tried is not what Back is for); opening a drill-down PUSHES one, so Back
//     closes the panel and returns to the statement.

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { ReportRange } from '@/models/reportPeriod';

export type ParamPatch = Record<string, string | null | undefined>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A real `YYYY-MM-DD`, or null. "2026-13-01" is rejected, not rolled over. */
export const readIso = (value: string | null): string | null => {
  if (!value || !ISO.test(value)) return null;
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const [y, m, day] = value.split('-').map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day ? value : null;
};

/** One of `allowed`, or the fallback. */
export const readEnum = <T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T => (value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback);

/**
 * `?from=&to=`, used only when both are real dates in order; anything else
 * falls back whole — half a range from the URL beside half a default one is a
 * period nobody asked for.
 */
export const readRange = (
  params: URLSearchParams,
  fallback: () => ReportRange,
  keys: [string, string] = ['from', 'to'],
): ReportRange => rangeFrom(params.get(keys[0]), params.get(keys[1]), fallback);

const rangeFrom = (
  fromRaw: string | null,
  toRaw: string | null,
  fallback: () => ReportRange,
): ReportRange => {
  const from = readIso(fromRaw);
  const to = readIso(toRaw);
  return from && to && from <= to ? { startDate: from, endDate: to } : fallback();
};

/**
 * `readRange` as a stable object: the same range keeps the same identity from
 * render to render, so memos and query keys built on it do not churn.
 */
export const useRangeParam = (
  params: URLSearchParams,
  fallback: () => ReportRange,
): ReportRange => {
  const from = params.get('from');
  const to = params.get('to');
  // `fallback` is a module-level function (the YTD default); it never changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => rangeFrom(from, to, fallback), [from, to]);
};

export function useReportParams() {
  const [params, setParams] = useSearchParams();

  const update = useCallback(
    (patch: ParamPatch, opts: { push?: boolean; state?: unknown } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === undefined || value === '') next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace: !opts.push, state: opts.state },
      );
    },
    [setParams],
  );

  return { params, update };
}
