import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import { Popover } from '@/components/ui/Popover';
import { Select } from '@/components/ui/Select';
import { cn } from '@/lib/cn';
import { DIGEST_HOURS, hourLabel, zoneLabel } from '@/models/daySummary';
import {
  getDaySummarySchedule,
  saveDaySummarySchedule,
} from '@/networks/reports/daySummaryNetwork';

const digestKey = ['reports', 'day-summary', 'schedule'] as const;

/**
 * The owner's end-of-day digest, set where it is read: on or off, when it goes
 * out (company time), and whether it is emailed as well as put in the bell.
 * An evening time sends that day; a morning time recaps the day before.
 */
export function DigestSettings() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const schedule = useQuery({ queryKey: digestKey, queryFn: getDaySummarySchedule });
  // Until the saved settings are in hand the form has nothing true to show, and
  // saving it would overwrite them with defaults — so it waits, or offers a retry.
  const ready = Boolean(schedule.data);
  const [enabled, setEnabled] = useState(false);
  const [hour, setHour] = useState(21);
  const [email, setEmail] = useState(true);

  // Each time it opens, the form starts from what is saved.
  const openChange = (next: boolean) => {
    if (next && !schedule.data && schedule.isError) void schedule.refetch();
    if (next && schedule.data) {
      setEnabled(schedule.data.enabled);
      setHour(schedule.data.hour);
      setEmail(schedule.data.email);
    }
    setOpen(next);
  };

  const save = useMutation({
    mutationFn: () => saveDaySummarySchedule({ enabled, hour, email }),
    onSuccess: (saved) => {
      queryClient.setQueryData(digestKey, saved);
      setOpen(false);
      toast.success(
        saved.enabled ? `Daily summary on — ${hourLabel(saved.hour)} every day` : 'Daily summary turned off',
      );
    },
    onError: () =>
      toast.error('Could not save the daily summary', {
        description: 'Nothing was changed. Check the connection and try again.',
      }),
  });

  const on = schedule.data?.enabled ?? false;
  const options = DIGEST_HOURS.some((o) => o.hour === hour)
    ? DIGEST_HOURS
    : [...DIGEST_HOURS, { hour, label: hourLabel(hour) }];

  return (
    <Popover
      open={open}
      onOpenChange={openChange}
      align="end"
      trigger={
        <Button variant="secondary" size="sm" disabled={schedule.isLoading} aria-label="Daily summary settings">
          <BellRing className="size-4" />
          <span className="hidden sm:inline">Daily summary</span>
          <span
            className={cn(
              'inline-flex items-center gap-[3px] rounded-full px-[6px] py-[1px] text-label-sm',
              on ? 'bg-success-lighter text-success' : 'bg-surface-2 text-text-tertiary',
            )}
          >
            <span className={cn('size-1.5 rounded-full', on ? 'bg-success' : 'bg-text-tertiary')} aria-hidden="true" />
            {!ready ? '—' : on ? hourLabel(schedule.data?.hour ?? 21) : 'Off'}
          </span>
        </Button>
      }
    >
      <p className="text-label-lg text-text-primary">Daily summary</p>
      <p className="mt-xxs text-body-sm text-text-secondary">
        Every owner gets this page’s headline in the bell at the time you choose
        {schedule.data?.timezone ? ` (${zoneLabel(schedule.data.timezone)})` : ''}.
      </p>

      {!ready ? (
        <div className="mt-md flex flex-col items-start gap-sm" role="status">
          <p className="text-body-sm text-text-secondary">
            {schedule.isError ? 'Your current settings could not be loaded.' : 'Loading your settings…'}
          </p>
          {schedule.isError && (
            <Button variant="secondary" size="sm" onClick={() => void schedule.refetch()}>
              Try again
            </Button>
          )}
        </div>
      ) : (
        <>

      <label className="mt-md flex items-center gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          className="size-4 accent-[color:var(--color-primary)]"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Send me the day’s summary
      </label>

      <Select
        label="When"
        compact
        containerClassName="mt-sm"
        disabled={!enabled}
        value={String(hour)}
        onChange={(v) => setHour(Number(v))}
        options={options.map((o) => ({ value: String(o.hour), label: o.label }))}
      />

      <label className="mt-sm flex items-center gap-sm text-body-sm text-text-primary">
        <input
          type="checkbox"
          className="size-4 accent-[color:var(--color-primary)]"
          checked={email}
          disabled={!enabled}
          onChange={(e) => setEmail(e.target.checked)}
        />
        Email it to owners too
      </label>

      <div className="mt-md flex justify-end gap-xs">
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </div>
        </>
      )}
    </Popover>
  );
}

export default DigestSettings;
