import type { ReactNode } from 'react';

import { useCapability, useIsOwner } from '@/hooks/useCapability';
import type { Capability } from '@/utils/capabilities';

interface CanProps {
  capability: Capability;
  children: ReactNode;
  /** Rendered instead when the capability is refused. Usually nothing. */
  fallback?: ReactNode;
}

/**
 * Render children only if the role may perform this action.
 *
 * Note the deliberate absence of a "disabled" mode. A greyed-out button still
 * advertises a capability the user does not have and invites them to ask why;
 * the app's rule is that a refused action is not rendered at all.
 */
export function Can({ capability, children, fallback = null }: CanProps) {
  const { allowed } = useCapability(capability);
  return <>{allowed ? children : fallback}</>;
}

/** Render children only for the company owner. */
export function OwnerOnly({
  children,
  fallback = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const isOwner = useIsOwner();
  return <>{isOwner ? children : fallback}</>;
}

export default Can;
