// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The brand lockup has to survive being cloned
// ═══════════════════════════════════════════════════════
// `Logo` is used as a Radix `Dialog.Title` with `asChild` in the landing page's
// mobile drawer. asChild clones the child and hands it the props the primitive
// would otherwise have rendered — for Dialog.Title that is the `id` the
// dialog's aria-labelledby points at.
//
// The first version of this component destructured only its own named props.
// The id went nowhere, aria-labelledby referenced an element that did not
// exist, and the drawer had NO accessible name. Nothing threw, nothing rendered
// wrong, and every existing test still passed — it was visible only in the
// accessibility tree.
//
// So the contract is pinned here: whatever a parent hands Logo reaches the DOM.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Logo, LogoMark } from '@/components/brand/Logo';

describe('Logo', () => {
  it('forwards an id to the DOM, which is what asChild depends on', () => {
    render(<Logo id="drawer-title" />);

    const el = document.getElementById('drawer-title');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('FinMatrix');
  });

  it('forwards arbitrary attributes, not just the ones it names', () => {
    render(<Logo data-testid="lockup" aria-label="FinMatrix home" />);

    const el = screen.getByTestId('lockup');
    expect(el).toHaveAttribute('aria-label', 'FinMatrix home');
  });

  it('keeps its own classes when a caller adds one', () => {
    render(<Logo data-testid="lockup" className="text-text-inverse" />);

    const el = screen.getByTestId('lockup');
    expect(el.className).toContain('text-text-inverse');
    expect(el.className).toContain('items-center');
  });

  it('carries the wordmark so a dialog titled with it has a name', () => {
    render(<Logo />);
    expect(screen.getByText('FinMatrix')).toBeInTheDocument();
  });

  it('hides the bare mark from assistive technology', () => {
    // The mark alone says nothing a screen reader needs; wherever it stands
    // without the wordmark, the LABEL is the caller's job (the sidebar passes
    // one on the link). If this ever stops being aria-hidden, collapsed
    // navigation starts announcing a decorative glyph.
    const { container } = render(<LogoMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
