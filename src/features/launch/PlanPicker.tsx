import { useQuery } from '@tanstack/react-query';

import { Select } from '@/components/ui/Select';
import { LAUNCH } from '@/config/launchStrings';
import { getOfferedPlans } from '@/networks/launch/launchNetwork';

export const UNSURE_PLAN = 'unsure';

/** The plans on sale, plus "Not sure — FinMatrix will contact me". */
export function PlanPicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const plans = useQuery({ queryKey: ['plans', 'public'], queryFn: getOfferedPlans, staleTime: 300_000 });
  const options = [
    { value: UNSURE_PLAN, label: LAUNCH.planUnsure },
    ...(plans.data ?? []).map((p) => ({ value: p.key, label: p.label })),
  ];
  return (
    <Select
      label={label ?? LAUNCH.planLabel}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

export default PlanPicker;
