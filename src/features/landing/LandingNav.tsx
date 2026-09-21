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
import { ArrowRight, BarChart3, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/Button';
import { useScrollY } from '@/components/motion/useScrollY';
import { cn } from '@/lib/cn';

/** In page order, so the spy's highlight walks left to right as you scroll. */
const LINKS = [
  { id: 'modules', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
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
      <nav
        aria-label="Main"
        className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-lg px-lg"
      >
        <Link
          to="/"
          aria-label="FinMatrix home"
          className="flex items-center gap-sm rounded-md"
        >
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-lg transition-colors duration-300',
              solid ? 'bg-primary shadow-md' : 'bg-white/10 ring-1 ring-inset ring-white/20',
            )}
          >
            <BarChart3 className="size-5 text-text-inverse" aria-hidden="true" />
          </span>
          <span
            className={cn(
              'text-h3 transition-colors duration-300',
              solid ? 'text-text-primary' : 'text-text-inverse',
            )}
          >
            FinMatrix
          </span>
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
            <Dialog.Content className="fixed inset-0 z-[60] flex flex-col overflow-y-auto surface-mesh-navy px-lg pb-xl text-text-inverse md:hidden">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 pattern-grid-dark fade-mask-b"
              />

              <div className="relative flex h-[72px] shrink-0 items-center justify-between">
                <Dialog.Title className="flex items-center gap-sm text-h3 text-text-inverse">
                  <span className="flex size-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-inset ring-white/20">
                    <BarChart3 className="size-5" aria-hidden="true" />
                  </span>
                  FinMatrix
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
