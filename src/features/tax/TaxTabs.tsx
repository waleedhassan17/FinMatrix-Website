import { NavLink } from 'react-router-dom';

import { useAdminOnly } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';

/**
 * Liability · Payments · Rates.
 *
 * Staff see the liability and nothing else — the other two tabs are simply not
 * rendered for them, rather than shown and then redirected. Their routes are
 * absent from the staff nav as well, so a typed URL is refused too.
 */
export function TaxTabs() {
  const canManage = useAdminOnly('tax.recordPayment');

  const tabs: [string, string][] = [
    ['/tax/liability', 'Liability'],
    ...(canManage
      ? ([
          ['/tax/payments', 'Payments'],
          ['/tax/rates', 'Rates'],
        ] as [string, string][])
      : []),
  ];

  if (tabs.length === 1) return null;

  return (
    <nav aria-label="Tax" className="flex gap-xxs border-b border-border print:hidden">
      {tabs.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
          end={to !== '/tax/payments'}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-md py-sm text-label-md transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export default TaxTabs;
