import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * Ported from the app's Custom-Components/CustomButton.tsx.
 *
 * Note the radius: `sm` (8px), not the card's `md` (10) or `lg` (12). The app's
 * comment is worth keeping — "a button as round as the card reads as a pill" —
 * and it is why buttons here look tighter than most Tailwind defaults.
 *
 * `secondary` is deliberately white-with-a-border rather than a second accent
 * colour. One action colour, and the primary button is it.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-sm text-label-lg whitespace-nowrap transition-colors ' +
    'disabled:pointer-events-none disabled:opacity-60 ' +
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-text-inverse hover:bg-primary-hover',
        secondary:
          'border border-border bg-surface text-text-primary hover:bg-surface-hover',
        danger: 'bg-danger text-text-inverse hover:bg-danger-hover',
        text: 'text-primary hover:bg-primary-tint',
      },
      size: {
        // The app's three sizes. `md` is form.controlHeight, so a button beside
        // an input lines up with it exactly.
        sm: 'h-9 px-md',
        md: 'h-12 px-lg',
        lg: 'h-14 px-xl',
        /** Square, for an icon alone. */
        icon: 'h-12 w-12 p-0',
      },
      full: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      full: false,
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element instead of a <button> — e.g. a router Link. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  full,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      // A <button> inside a form defaults to type="submit", which is how a
      // "Cancel" button ends up posting the form. Default to "button" and let
      // the submit button say so explicitly.
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, full }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
export default Button;
