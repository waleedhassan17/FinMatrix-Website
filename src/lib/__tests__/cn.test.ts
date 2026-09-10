import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/cn';

/**
 * tailwind-merge only knows Tailwind's default scales. Before src/lib/cn.ts was
 * taught this project's, every `text-<role>` was filed as a text colour and
 * deleted whenever a real colour followed it — so every Button lost its 600
 * weight and every eyebrow lost its uppercase overline, silently, app-wide.
 *
 * These pin both halves: the roles survive, and genuine conflicts still resolve.
 */

const ROLES = [
  'display-xl',
  'display-lg',
  'display-md',
  'display-sm',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'body-lg',
  'body-md',
  'body-sm',
  'label-lg',
  'label-md',
  'label-sm',
  'caption',
  'overline',
];

const classes = (value: string) => value.split(/\s+/);

describe('type roles survive a text colour', () => {
  it.each(ROLES)('keeps text-%s', (role) => {
    const out = classes(cn(`text-${role}`, 'text-text-inverse'));
    expect(out).toContain(`text-${role}`);
    expect(out).toContain('text-text-inverse');
  });

  it('keeps the Button label role when a caller recolours it', () => {
    // Exactly the shape buttonVariants + a className override produces.
    const out = classes(
      cn(
        'rounded-sm text-label-lg bg-primary text-text-inverse',
        'bg-surface text-primary-900',
      ),
    );
    expect(out).toContain('text-label-lg');
    expect(out).toContain('bg-surface');
    expect(out).toContain('text-primary-900');
    expect(out).not.toContain('bg-primary');
    expect(out).not.toContain('text-text-inverse');
  });

  it('keeps an eyebrow an overline when it is coloured', () => {
    expect(classes(cn('text-overline', 'text-accent-teal'))).toEqual([
      'text-overline',
      'text-accent-teal',
    ]);
  });

  it('keeps responsive roles beside a colour', () => {
    expect(
      classes(cn('text-display-md lg:text-display-xl', 'text-white')),
    ).toEqual(['text-display-md', 'lg:text-display-xl', 'text-white']);
  });
});

describe('real conflicts still resolve to the last class', () => {
  it('two type roles', () => {
    expect(cn('text-h1', 'text-h2')).toBe('text-h2');
  });

  it('two text colours', () => {
    expect(cn('text-primary', 'text-danger')).toBe('text-danger');
  });

  it('named spacing', () => {
    expect(cn('p-xl', 'p-lg')).toBe('p-lg');
    expect(cn('py-xxxxl', 'py-section')).toBe('py-section');
  });

  it('the card shadow against the elevation ramp', () => {
    expect(cn('shadow-card', 'shadow-md')).toBe('shadow-md');
  });
});
