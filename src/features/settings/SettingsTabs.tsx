import { NavLink } from 'react-router-dom';

import { useFeature } from '@/hooks/useCapability';
import { cn } from '@/lib/cn';
import { useAppSelector } from '@/store/store';
import { selectFeatures } from '@/store/authSlice';

/**
 * Company · Team. Owner only — the whole of /settings is absent from the staff
 * nav. Team is also tier-gated (`multiUser`), and the server 403s without it.
 */
export function SettingsTabs() {
  const multiUser = useFeature('multiUser');
  // FinMatrix Connect, read strictly: useFeature treats an absent key as on.
  const whatsapp = useAppSelector(selectFeatures)?.whatsappConnect === true;
  const tabs: Array<[string, string]> = [
    ['/settings/company', 'Company'],
    ...(multiUser ? ([['/settings/users', 'Team']] as Array<[string, string]>) : []),
    ...(whatsapp ? ([['/settings/whatsapp', 'WhatsApp']] as Array<[string, string]>) : []),
    ['/settings/backup', 'Backup & export'],
    ['/settings/migration', 'Move to FinMatrix'],
  ];

  return (
    <nav className="flex gap-xs border-b border-border-light" aria-label="Settings sections">
      {tabs.map(([to, label]) => (
        <NavLink
          key={to}
          to={to}
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

export default SettingsTabs;
