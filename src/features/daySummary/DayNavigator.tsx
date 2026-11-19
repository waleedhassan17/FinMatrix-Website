import {
  addDays as addDaysFns,
  addMonths,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { cn } from '@/lib/cn';
import { addDays, isoDate } from '@/models/document';
import { relativeDayName } from '@/models/daySummary';

const parse = (iso: string) => new Date(`${iso}T00:00:00`);

/**
 * The day being looked at, and every way to move it: a day back, a day on
 * (never past today — tomorrow has nothing in it), and a calendar with the
 * days an owner jumps to most — today, yesterday, the same day last week.
 *
 * The calendar is drawn here rather than left to `<input type="date">`: the
 * native picker opens only from its own small icon, so a button that wraps
 * a hidden one does nothing when clicked — which is how this used to work.
 */
export function DayNavigator({
  date,
  today,
  onDate,
}: {
  date: string;
  today: string;
  onDate: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parse(date)));
  const yesterday = addDays(today, -1);
  const atLatest = date >= today;

  const pick = (iso: string) => {
    onDate(iso > today ? today : iso);
    setOpen(false);
  };

  // Six rows from the Monday on or before the 1st, so the grid never jumps.
  const days = useMemo(() => {
    const first = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    return Array.from({ length: 42 }, (_, i) => addDaysFns(first, i));
  }, [month]);

  const canNextMonth = startOfMonth(addMonths(month, 1)) <= parse(today);
  const quick: Array<[string, string]> = [
    ['Today', today],
    ['Yesterday', yesterday],
    ['Same day last week', addDays(date, -7)],
  ];

  return (
    <div className="flex min-w-0 items-center gap-xs">
      <Button
        variant="secondary"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={() => onDate(addDays(date, -1))}
        aria-label="Previous day"
        title="Previous day (←)"
      >
        <ChevronLeft className="size-5" />
      </Button>

      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next) setMonth(startOfMonth(parse(date)));
          setOpen(next);
        }}
        align="start"
        className="w-[min(20rem,calc(100vw-2rem))] p-sm"
        trigger={
          <button
            type="button"
            aria-label="Pick a day"
            className={cn(
              'flex h-10 min-w-0 items-center gap-sm rounded-md border border-border bg-surface px-sm text-left transition-colors',
              'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus',
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block truncate text-label-md text-text-primary">
                {relativeDayName(date, today, yesterday)}
                <span className="text-text-tertiary"> · </span>
                <span className="text-text-secondary">{format(parse(date), 'EEE d MMM yyyy')}</span>
              </span>
            </span>
            <ChevronDown className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          </button>
        }
      >
        <div className="flex flex-wrap gap-xxs">
          {quick.map(([label, iso]) => (
            <button
              key={label}
              type="button"
              onClick={() => pick(iso)}
              className={cn(
                'rounded-full border px-sm py-[3px] text-label-sm transition-colors',
                iso === date
                  ? 'border-primary bg-primary-tint text-primary'
                  : 'border-border-light text-text-secondary hover:bg-surface-hover',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-sm flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover"
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <p className="text-label-lg text-text-primary">{format(month, 'MMMM yyyy')}</p>
          <button
            type="button"
            onClick={() => canNextMonth && setMonth((m) => addMonths(m, 1))}
            disabled={!canNextMonth}
            className="flex size-8 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-xs grid grid-cols-7 gap-[2px] text-center" role="grid" aria-label={format(month, 'MMMM yyyy')}>
          {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
            <span key={d} className="py-xxs text-overline text-text-tertiary">
              {d}
            </span>
          ))}
          {days.map((d) => {
            const iso = isoDate(d);
            const future = iso > today;
            const selected = iso === date;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                role="gridcell"
                disabled={future}
                aria-selected={selected}
                aria-label={format(d, 'EEEE d MMMM yyyy')}
                onClick={() => pick(iso)}
                className={cn(
                  'flex h-9 items-center justify-center rounded-md text-body-sm tabular transition-colors',
                  !isSameMonth(d, month) && 'text-text-tertiary',
                  isSameMonth(d, month) && !selected && 'text-text-primary',
                  !selected && !future && 'hover:bg-surface-hover',
                  isToday && !selected && 'ring-1 ring-inset ring-primary text-primary',
                  selected && 'bg-primary text-text-inverse',
                  future && 'cursor-not-allowed opacity-30',
                )}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      </Popover>

      <Button
        variant="secondary"
        size="icon"
        className="h-10 w-10 shrink-0"
        onClick={() => onDate(addDays(date, 1))}
        disabled={atLatest}
        aria-label="Next day"
        title={atLatest ? 'This is the latest day' : 'Next day (→)'}
      >
        <ChevronRight className="size-5" />
      </Button>

      {!atLatest && (
        <Button variant="text" size="sm" className="shrink-0" onClick={() => onDate(today)}>
          Today
        </Button>
      )}
    </div>
  );
}

export default DayNavigator;
