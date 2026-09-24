import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * The one menu: the top bar's notification and account menus, row menus, and
 * a page's "More actions". Radix supplies the keyboard model (arrow keys,
 * typeahead, Escape) and focus return; this file supplies the look.
 */
export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export function DropdownMenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Content>) {
  return (
    <Menu.Portal>
      <Menu.Content
        align={align}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 min-w-52 rounded-lg border border-border bg-surface p-xxs shadow-md',
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  destructive = false,
  icon,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Item> & {
  destructive?: boolean;
  icon?: ReactNode;
}) {
  return (
    <Menu.Item
      className={cn(
        'flex cursor-pointer select-none items-center gap-xs rounded-md px-sm py-xs text-body-sm outline-none',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        destructive
          ? 'text-danger data-[highlighted]:bg-danger-lighter'
          : 'text-text-primary data-[highlighted]:bg-surface-hover',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {/* Only wrapped when there IS an icon. With `asChild`, Radix's Slot needs
          exactly one element child, and React counts an absent icon rendered
          beside it as a second node — every link item threw on open. An
          asChild item carries its icon inside the child instead. */}
      {icon ? (
        <>
          {icon}
          {children}
        </>
      ) : (
        children
      )}
    </Menu.Item>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Separator>) {
  return <Menu.Separator className={cn('my-xxs h-px bg-border-light', className)} {...props} />;
}

export function DropdownMenuLabel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Menu.Label>) {
  return (
    <Menu.Label
      className={cn('px-sm pt-xs pb-xxs text-overline text-text-tertiary', className)}
      {...props}
    />
  );
}

export default DropdownMenu;
