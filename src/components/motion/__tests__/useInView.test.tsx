// @vitest-environment jsdom

// ═══════════════════════════════════════════════════════
// The guard the whole test suite quietly depends on
// ═══════════════════════════════════════════════════════
// src/test/setup.ts stubs IntersectionObserver with a mock that never fires and
// stubs matchMedia to report matches:false. So in every component test in this
// repo, the two obvious bails in useInView — "no observer" and "reduced motion"
// — are dead code.
//
// What actually keeps 1100+ tests green is the THIRD bail: an element whose
// rect is already inside the viewport is left alone. jsdom gives every element
// an all-zero rect against an innerHeight of 768, so that is true everywhere and
// the hook returns its seed: armed false, inView true, nothing hidden.
//
// Remove that line and nothing throws. The observer is handed a node it will
// never report on, inView stays false forever, and every <Reveal> on the landing
// page renders at opacity 0 — a blank marketing page, in tests and in any
// browser where an element happens to start on screen.
//
// These tests exist so that deletion fails loudly instead.

import { act, render } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useInView } from '@/components/motion/useInView';

type Seen = { armed: boolean; inView: boolean };

/** Render the hook on a real node and report what it decided. */
function Probe({
  onState,
  playOnMount = false,
}: {
  onState: (s: Seen) => void;
  playOnMount?: boolean;
}) {
  const { ref, armed, inView } = useInView<HTMLDivElement>({ playOnMount });

  useEffect(() => {
    onState({ armed, inView });
  }, [armed, inView, onState]);

  return <div ref={ref}>probe</div>;
}

/** Force every element to measure as sitting below the fold. */
const putBelowFold = () =>
  vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ top: 5000, bottom: 5100, height: 100 } as DOMRect);

describe('useInView', () => {
  it('seeds to the finished state, so a caller that never animates is correct', () => {
    const states: Seen[] = [];
    render(<Probe onState={(s) => states.push(s)} />);

    // armed false means no transition is attached at all; inView true means the
    // element is at its end state. Together: renders exactly as it would have
    // with none of this code present.
    expect(states[0]).toEqual({ armed: false, inView: true });
  });

  it('leaves content already on screen completely alone', () => {
    // This is the jsdom case, and the one the suite depends on. An all-zero rect
    // reads as on-screen, so the hook must not arm.
    const states: Seen[] = [];
    render(<Probe onState={(s) => states.push(s)} />);

    expect(states.every((s) => s.armed === false)).toBe(true);
    expect(states.every((s) => s.inView === true)).toBe(true);
  });

  it('arms and hides only once it knows the element is below the fold', () => {
    const spy = putBelowFold();
    const states: Seen[] = [];

    render(<Probe onState={(s) => states.push(s)} />);

    // Now it may animate: armed, and waiting for the observer that the test
    // setup's stub will never fire.
    expect(states.at(-1)).toEqual({ armed: true, inView: false });
    spy.mockRestore();
  });

  it('plays on mount regardless of the fold, for above-the-fold callers', async () => {
    // The hero chart and the KPI counters sit above the fold. Without this
    // option the rect check would bail and they would never animate at all on a
    // desktop load — the two best effects on the page, never once seen.
    const states: Seen[] = [];

    render(<Probe playOnMount onState={(s) => states.push(s)} />);

    expect(states.at(-1)?.armed).toBe(true);

    // It arms hidden, then releases across two frames so the browser has a
    // painted start state to transition away from.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(states.at(-1)?.inView).toBe(true);
  });

  it('does not animate when the visitor asked not to', () => {
    const spy = putBelowFold();
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));

    const states: Seen[] = [];
    render(<Probe onState={(s) => states.push(s)} />);

    // Below the fold AND reduced motion: still never armed, still complete.
    expect(states.every((s) => s.armed === false)).toBe(true);
    expect(states.every((s) => s.inView === true)).toBe(true);

    spy.mockRestore();
    vi.unstubAllGlobals();
  });
});
