import { cn } from '@/lib/cn';

/** Readiness: decided rows + confident mappings + passed checks. Import needs 100%. */
export function ReadinessScore({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.floor(value)));
  const tone = v === 100 ? 'bg-success' : v >= 75 ? 'bg-warning' : 'bg-danger';
  return (
    <div className="flex min-w-[12rem] flex-col gap-xs" aria-label={`Readiness ${v} percent`}>
      <div className="flex items-baseline justify-between">
        <span className="text-caption text-text-secondary">Readiness</span>
        <span className="text-label-md text-text-primary tabular">{v}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v}>
        <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export default ReadinessScore;
