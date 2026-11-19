import { Clock } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { busiestHour, hourTick, hourWindow } from '@/models/daySummary';
import type { DayHourRow } from '@/serializers/daySummarySerializer';
import { compactMoney, formatMoney } from '@/utils/money';

/**
 * When the day happened: sales and receipts by the hour they were entered.
 * A shop sees its rush hours; an owner sees whether the counter went quiet.
 * Drawn with plain bars — two thin ones an hour, sales and money received —
 * each naming its hour and figures on hover.
 */
export function HourlyActivity({ hourly }: { hourly: DayHourRow[] }) {
  const hours = hourWindow(hourly);
  const max = Math.max(...hours.map((h) => Math.max(h.sales, h.received)), 0);
  const peak = busiestHour(hourly);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-sm border-b border-border-light px-lg py-sm">
        <div className="flex items-center gap-xs">
          <Clock className="size-4 text-text-tertiary" aria-hidden="true" />
          <div>
            <h2 className="text-label-lg text-text-primary">Activity by hour</h2>
            <p className="text-caption text-text-tertiary">
              {peak
                ? `Busiest at ${hourTick(peak.hour)} · ${compactMoney(peak.sales)} sales, ${compactMoney(peak.received)} received`
                : 'When sales and receipts were entered'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-md text-caption text-text-secondary">
          <span className="inline-flex items-center gap-xxs">
            <span className="size-2.5 rounded-xs bg-primary" aria-hidden="true" />
            Sales
          </span>
          <span className="inline-flex items-center gap-xxs">
            <span className="size-2.5 rounded-xs bg-success" aria-hidden="true" />
            Received
          </span>
        </div>
      </div>

      {max === 0 ? (
        <p className="px-lg py-xl text-center text-body-sm text-text-secondary">
          No sales or receipts were entered on this day.
        </p>
      ) : (
        <div className="px-lg pb-sm pt-md" role="img" aria-label="Sales and money received by hour">
          <div className="relative flex h-40 items-end gap-xxs border-b border-border-light">
            {/* Faint guide lines at a half and the top. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border-light" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border-light" />
            {hours.map((h) => (
              <div
                key={h.hour}
                className="group relative flex h-full flex-1 items-end justify-center gap-[2px]"
                title={`${hourTick(h.hour)}: ${formatMoney(h.sales)} sales (${h.salesCount}), ${formatMoney(h.received)} received (${h.receivedCount})`}
              >
                <div
                  className="w-full max-w-[14px] rounded-t-xs bg-primary transition-opacity group-hover:opacity-80"
                  style={{ height: `${max ? (h.sales / max) * 100 : 0}%` }}
                />
                <div
                  className="w-full max-w-[14px] rounded-t-xs bg-success transition-opacity group-hover:opacity-80"
                  style={{ height: `${max ? (h.received / max) * 100 : 0}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-xxs flex gap-xxs">
            {hours.map((h) => (
              <span key={h.hour} className="flex-1 text-center text-caption text-text-tertiary">
                {h.hour % 3 === 0 ? hourTick(h.hour) : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

export default HourlyActivity;
