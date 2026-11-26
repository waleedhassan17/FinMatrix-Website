import { useQuery } from '@tanstack/react-query';

import { Select } from '@/components/ui/Select';
import { pick, useLang } from '@/i18n/lang';
import { LAUNCH } from '@/i18n/launchStrings';
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
  const lang = useLang();
  const plans = useQuery({ queryKey: ['plans', 'public'], queryFn: getOfferedPlans, staleTime: 300_000 });
  const options = [
    { value: UNSURE_PLAN, label: pick(LAUNCH.planUnsure, lang) },
    ...(plans.data ?? []).map((p) => ({ value: p.key, label: p.label })),
  ];
  return (
    <Select
      label={label ?? pick(LAUNCH.planLabel, lang)}
      value={value}
      onChange={onChange}
      options={options}
    />
  );
}

export default PlanPicker;
