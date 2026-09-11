import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import { cn } from '@/lib/cn';
import {
  navForRole,
  QUICK_ACTIONS,
  type NavGroup,
  type NavItem,
} from '@/config/nav';
import { useCapability, useFeature, useRole } from '@/hooks/useCapability';
import { fetchPendingApprovalCount } from '@/networks/approvals/approvalsNetwork';
import { SIDEBAR_GRADIENT } from '@/theme/tokens';
import type { Capability } from '@/utils/capabilities';
import type { FeatureKey } from '@/types';

/**
 * The navy sidebar, structurally after the web reference's
 * components/dashboard/sidebar.tsx but driven by an RBAC-aware config rather
 * than a hardcoded list.
 *
 * Active state is a translucent white pill rather than the navy tint the app
 * uses on light grounds — on this gradient the tint would disappear.
 */

/**
 * One nav row's visibility. Both gates must pass: the role must be able to
 * perform the action, and the company's tier must include the feature. Either
 * being absent from the config means that gate does not apply.
 */
function useVisible(item: { capability?: Capability; feature?: FeatureKey }) {
  const { allowed } = useCapability(item.capability);
  const featureOn = useFeature(item.feature);
  return allowed && featureOn;
}

function NavLeaf({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const visible = useVisible(item);
  if (visible === false) return null;

  return (
    <li>
      <NavLink
        to={item.path}
        end={item.path === '/dashboard' || item.exact}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            'block rounded-lg px-sm py-xs text-body-sm transition-colors',
            isActive
              ? 'bg-white/15 font-medium text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white',
          )
        }
      >
        {collapsed ? item.title.slice(0, 1) : item.title}
      </NavLink>
    </li>
  );
}

function NavGroupRow({
  group,
  collapsed,
  expanded,
  onToggle,
  onNavigate,
  badgeCount,
}: {
  group: NavGroup;
  collapsed: boolean;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
  badgeCount?: number;
}) {
  const location = useLocation();
  const featureOn = useFeature(group.feature);
  const Icon = group.icon;

  if (!featureOn) return null;

  const badge =
    group.badge === 'approvals' && badgeCount && badgeCount > 0 ? (
      <span className="ml-auto rounded-full bg-warning px-[6px] py-[1px] text-label-sm text-white tabular">
        {badgeCount > 99 ? '99+' : badgeCount}
      </span>
    ) : null;

  // ── A single link ────────────────────────────────────────────────────
  if (group.path) {
    return (
      <li>
        <NavLink
          to={group.path}
          end={group.path === '/dashboard'}
          onClick={onNavigate}
          title={collapsed ? group.title : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-sm rounded-lg px-sm py-[10px] text-label-md transition-colors',
              isActive
                ? 'bg-white/15 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white',
            )
          }
        >
          <Icon className="size-5 shrink-0" />
          {!collapsed && <span className="flex-1">{group.title}</span>}
          {!collapsed && badge}
        </NavLink>
      </li>
    );
  }

  // ── An accordion ─────────────────────────────────────────────────────
  const parentActive =
    group.items?.some((i) => location.pathname.startsWith(i.path)) ?? false;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        title={collapsed ? group.title : undefined}
        className={cn(
          'flex w-full items-center gap-sm rounded-lg px-sm py-[10px] text-label-md transition-colors',
          parentActive
            ? 'bg-white/15 text-white'
            : 'text-white/70 hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon className="size-5 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{group.title}</span>
            <ChevronDown
              className={cn(
                'size-4 transition-transform',
                expanded ? 'rotate-0' : '-rotate-90',
              )}
            />
          </>
        )}
      </button>

      {!collapsed && expanded && group.items && (
        <ul className="mt-xxs ml-md space-y-[2px] border-l border-white/10 pl-md">
          {group.items.map((item) => (
            <NavLeaf
              key={item.path}
              item={item}
              collapsed={false}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function QuickAction({
  action,
  onNavigate,
}: {
  action: (typeof QUICK_ACTIONS)[number];
  onNavigate: () => void;
}) {
  const visible = useVisible(action);
  const { needsApproval } = useCapability(action.capability);
  if (!visible) return null;
  const Icon = action.icon;

  return (
    <Link
      to={action.path}
      onClick={onNavigate}
      className="flex items-center gap-xs rounded-lg px-sm py-xs text-body-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{action.title}</span>
      {/* Staff are told what this button will actually do before they click. */}
      {action.capability && needsApproval && (
        <span className="text-label-sm text-white/40">approval</span>
      )}
    </Link>
  );
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
}: {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}) {
  const role = useRole();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const nav = useMemo(() => navForRole(role), [role]);

  const [expanded, setExpanded] = useState<string[]>(() =>
    // Open whichever group contains the current route, so a reload on
    // /invoices does not present a wall of closed accordions.
    nav
      .filter((g) => g.items?.some((i) => location.pathname.startsWith(i.path)))
      .map((g) => g.title),
  );

  const { data: pendingCount } = useQuery({
    queryKey: ['approvals', 'pending-count'],
    queryFn: fetchPendingApprovalCount,
    refetchInterval: 60_000,
  });

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    onCloseMobile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggle = (title: string) =>
    setExpanded((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );

  const content = (
    <>
      <div className="flex h-16 items-center justify-between border-b border-white/10 px-md">
        <Link to="/dashboard" className="flex items-center gap-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <BarChart3 className="size-5 text-white" />
          </span>
          {!collapsed && <span className="text-h4 text-white">FinMatrix</span>}
        </Link>
        <button
          type="button"
          onClick={onCloseMobile}
          className="rounded-lg p-xs text-white hover:bg-white/10 lg:hidden"
          aria-label="Close menu"
        >
          <X className="size-5" />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-sm py-md">
        <ul className="space-y-[2px]">
          {nav.map((group) => (
            <NavGroupRow
              key={group.title}
              group={group}
              collapsed={collapsed}
              expanded={expanded.includes(group.title)}
              onToggle={() => toggle(group.title)}
              onNavigate={onCloseMobile}
              badgeCount={pendingCount}
            />
          ))}
        </ul>
      </nav>

      {!collapsed && (
        <div className="border-t border-white/10 p-md">
          <p className="mb-sm text-overline text-white/50">Quick actions</p>
          <div className="space-y-[2px]">
            {QUICK_ACTIONS.map((action) => (
              <QuickAction
                key={action.path}
                action={action}
                onNavigate={onCloseMobile}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="absolute -right-3 top-20 hidden size-6 items-center justify-center rounded-full border-2 border-border bg-[color:var(--color-sidebar-from)] text-white shadow-md lg:flex"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="size-3" />
        ) : (
          <ChevronLeft className="size-3" />
        )}
      </button>
    </>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Desktop spacer: the aside is fixed, so the main column needs width
          reserved for it. */}
      <div
        className={cn(
          'hidden shrink-0 transition-all duration-300 lg:block',
          collapsed ? 'w-[72px]' : 'w-64',
        )}
      />

      <aside
        style={{ background: SIDEBAR_GRADIENT }}
        className={cn(
          'fixed left-0 top-0 z-50 flex h-screen w-72 flex-col text-white shadow-xl transition-all duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          collapsed ? 'lg:w-[72px]' : 'lg:w-64',
        )}
      >
        {content}
      </aside>
    </>
  );
}

export default Sidebar;
