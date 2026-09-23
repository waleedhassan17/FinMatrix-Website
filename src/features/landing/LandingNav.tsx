// ═══════════════════════════════════════════════════════
// FinMatrix Web — Landing navigation
// ═══════════════════════════════════════════════════════
// Two states, and the type inverts between them:
//
//   at the top   transparent over the dark hero — white wordmark and links
//   scrolled     frosted white glass — dark wordmark and links
//
// The flip is legibility, not flourish. Left transparent, white links sit over
// whatever light section has scrolled beneath them. The scroll position is read
// during render (see useScrollY), so a reload part-way down the page paints the
// solid bar on its first frame rather than flashing white text over white.
//
// Scroll-spy is ONE IntersectionObserver over the section nodes, with a margin
// that makes "active" mean "crossing the middle of the viewport".
//
// The mobile menu is Radix Dialog, already a dependency: focus trap, Escape,
// scroll lock and aria-modal are four things a hand-rolled drawer gets wrong.

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowRight, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { useScrollY } from '@/components/motion/useScrollY';
import { cn } from '@/lib/cn';

/** In page order, so the spy's highlight walks left to right as you scroll. */
const LINKS = [
  { id: 'modules', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'how-it-holds-up', label: 'Assurance' },
  // BILLING-DISABLED BUILD: #pricing is no longer rendered, so the link
  // would scroll nowhere and the scroll-spy would never highlight it.
  // { id: 'pricing', label: 'Pricing' },
  { id: 'faq', label: 'FAQ' },
] as const;

function useActiveSection(): string {
  const [active, setActive] = useState('');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const nodes = LINKS.map((l) => document.getElementById(l.id)).filter(
      (n): n is HTMLElement => n !== null,
    );
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      // A band across the middle of the viewport: whatever crosses it is what
      // the reader is looking at.
      { rootMargin: '-45% 0px -55% 0px', threshold: 0 },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  return active;
}

function linkClasses(solid: boolean, current: boolean): string {
  if (solid) {
    return current
      ? 'bg-primary-50 text-primary'
      : 'text-text-secondary hover:bg-primary-50 hover:text-primary';
  }
  return current
    ? 'bg-white/15 text-text-inverse'
    : 'text-white/75 hover:bg-white/10 hover:text-text-inverse';
}

export function LandingNav() {
  const scrollY = useScrollY();
  const active = useActiveSection();
  const [open, setOpen] = useState(false);

  const solid = scrollY > 12;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,box-shadow] duration-300',
        solid ? 'glass-light border-border-light shadow-card' : 'border-transparent',
      )}
    >
      {/* The bar tightens from 72px to 60px once the page has moved. It is a
          small thing and it is the detail that most reads as a considered
          product site rather than a template: the header gives the content back
          twelve pixels the moment it stops being the thing you are looking at.
          Height is not a composited property, but this fires once per scroll
          direction rather than per frame, so it costs one layout, not sixty. */}
      <nav
        aria-label="Main"
        className={cn(
          'mx-auto flex max-w-[1280px] items-center justify-between gap-lg px-xl',
          'transition-[height] duration-300 ease-out motion-reduce:transition-none',
          solid ? 'h-[60px]' : 'h-[72px]',
        )}
      >
        <Link
          to="/"
          aria-label="FinMatrix home"
          className="flex items-center gap-sm rounded-md"
        >
          {/* The mark no longer sits in a tinted box. The box existed to give a
              borrowed icon somewhere to live; a real mark stands on its own, and
              the chrome around it was most of what read as "template". */}
          <Logo
            tone="inherit"
            className={cn(
              'transition-colors duration-300',
              solid ? 'text-primary-900' : 'text-text-inverse',
            )}
          />
        </Link>

        <ul className="hidden items-center gap-xxs md:flex">
          {LINKS.map((link) => {
            const current = active === link.id;
            return (
              <li key={link.id}>
                <a
                  href={`#${link.id}`}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'block rounded-full px-md py-xs text-label-md transition-colors',
                    linkClasses(solid, current),
                  )}
                >
                  {link.label}
                </a>
              </li>
            );
          })}
        </ul>

        <div className="hidden items-center gap-xs md:flex">
          <Button
            size="sm"
            variant="text"
            asChild
            className={solid ? undefined : 'text-text-inverse hover:bg-white/10'}
          >
            <Link to="/get-started">Sign in</Link>
          </Button>
          <Button
            size="sm"
            asChild
            className={cn(
              'px-lg',
              !solid && 'bg-surface text-primary-900 hover:bg-primary-50',
            )}
          >
            <Link to="/register">Create account</Link>
          </Button>
        </div>

        {/* Mobile */}
        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger asChild>
            <button
              type="button"
              aria-label="Open menu"
              className={cn(
                'flex size-10 items-center justify-center rounded-md transition-colors md:hidden',
                solid
                  ? 'text-text-primary hover:bg-primary-50'
                  : 'text-text-inverse hover:bg-white/10',
              )}
            >
              <Menu className="size-6" aria-hidden="true" />
            </button>
          </Dialog.Trigger>

          <Dialog.Portal>
            {/* The drawer used to appear between one frame and the next, which
                on a phone reads as a glitch rather than a panel. Radix puts
                data-state="open"/"closed" on this node and holds the exit until
                the animation finishes, so a short fade and slide is all it takes.
                Both states need an animation or the close is instant again. */}
            <Dialog.Content className="fixed inset-0 z-[60] flex flex-col overflow-y-auto surface-mesh-navy px-lg pb-xl text-text-inverse data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in motion-reduce:animate-none md:hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 pattern-grid-dark fade-mask-b"
              />

              <div className="relative flex h-[72px] shrink-0 items-center justify-between">
                <Dialog.Title asChild>
                  <Logo tone="light" />
                </Dialog.Title>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    aria-label="Close menu"
                    className="flex size-10 items-center justify-center rounded-md text-text-inverse hover:bg-white/10"
                  >
                    <X className="size-6" aria-hidden="true" />
                  </button>
                </Dialog.Close>
              </div>

              <Dialog.Description className="sr-only">
                Jump to a section, or sign in.
              </Dialog.Description>

              <ul className="relative mt-xl flex flex-col gap-xxs">
                {LINKS.map((link) => (
                  <li key={link.id}>
                    <a
                      href={`#${link.id}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center justify-between rounded-lg px-md py-md text-h3 text-text-inverse transition-colors hover:bg-white/10"
                    >
                      {link.label}
                      <ArrowRight className="size-5 text-white/40" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>

              <div className="relative mt-auto flex flex-col gap-sm pt-xxl">
                <Button
                  full
                  size="lg"
                  asChild
                  className="bg-surface text-primary-900 hover:bg-primary-50"
                >
                  <Link to="/register">Create account</Link>
                </Button>
                <Button
                  full
                  size="lg"
                  variant="text"
                  asChild
                  className="border border-white/20 bg-white/5 text-text-inverse hover:bg-white/10"
                >
                  <Link to="/get-started">Sign in</Link>
                </Button>
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </header>
  );
}

export default LandingNav;
