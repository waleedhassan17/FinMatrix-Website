import { ChevronDown, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { QUICK_ACTIONS } from '@/config/nav';
import { useCapability, useFeature } from '@/hooks/useCapability';

function NewMenuItem({ action }: { action: (typeof QUICK_ACTIONS)[number] }) {
  const { allowed, needsApproval } = useCapability(action.capability);
  const featureOn = useFeature(action.feature);
  if (!allowed || !featureOn) return null;

  const Icon = action.icon;
  return (
    <DropdownMenuItem asChild>
      <Link to={action.path}>
        <Icon aria-hidden="true" className="text-text-tertiary" />
        <span className="flex-1">{action.title}</span>
        {/* Say what will actually happen before they click, not after. */}
        {needsApproval && (
          <span className="text-caption text-warning">Needs approval</span>
        )}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * The page's one primary action: start a document.
 *
 * It was a Quick Actions card taking a third of the dashboard's top row, holding
 * the same four links the sidebar already lists under the same heading. A menu
 * in the header keeps them one click away without spending the most valuable
 * space on the page on a second copy.
 */
export function NewDocumentMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New
          <ChevronDown className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {QUICK_ACTIONS.map((action) => (
          <NewMenuItem key={action.path} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NewDocumentMenu;
