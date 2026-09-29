import { describe, expect, it } from 'vitest';

import {
  backLabelFor,
  createNavHistory,
  SHELL_ROUTE_ID,
  type NavState,
} from '@/features/shell/navHistory';

const inShell = [{ route: { id: 'root' } }, { route: { id: SHELL_ROUTE_ID } }];
const outside = [{ route: { id: 'root' } }, { route: { id: 'login' } }];

const at = (
  historyAction: 'PUSH' | 'REPLACE' | 'POP',
  key: string,
  pathname: string,
  opts: { search?: string; shell?: boolean; navigating?: boolean } = {},
): NavState => ({
  historyAction,
  location: { key, pathname, search: opts.search ?? '' },
  matches: opts.shell === false ? outside : inShell,
  navigation: { state: opts.navigating ? 'loading' : 'idle' },
});

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe('navHistory', () => {
  it('records the page a pushed page was opened from', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'd', '/dashboard'));
    h.track(at('PUSH', 'f', '/invoices/new'));
    expect(h.originOf('f')).toEqual({ key: 'd', pathname: '/dashboard', search: '' });
  });

  it('keeps the query string, so a filtered page comes back filtered', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'gl', '/reports/general-ledger', { search: '?account=1000&page=2' }));
    h.track(at('PUSH', 'je', '/journal-entries/42'));
    expect(h.originOf('je')?.search).toBe('?account=1000&page=2');
  });

  it('a replace inherits the origin of the entry it replaced', () => {
    // Dashboard → New invoice → save (replace with the invoice): Back from the
    // invoice goes to the Dashboard, not to the form.
    const h = createNavHistory(null);
    h.track(at('POP', 'd', '/dashboard'));
    h.track(at('PUSH', 'f', '/invoices/new'));
    h.track(at('REPLACE', 'i', '/invoices/7'));
    expect(h.originOf('i')?.pathname).toBe('/dashboard');
  });

  it('a replace of a page opened cold stays without an origin', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'f', '/invoices/new'));
    h.track(at('REPLACE', 'i', '/invoices/7'));
    expect(h.originOf('i')).toBeNull();
  });

  it('moving through history changes nothing', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'e', '/estimates/3'));
    h.track(at('PUSH', 'i', '/invoices/9'));
    h.track(at('POP', 'e', '/estimates/3'));
    h.track(at('POP', 'i', '/invoices/9'));
    expect(h.originOf('e')).toBeNull();
    expect(h.originOf('i')?.pathname).toBe('/estimates/3');
  });

  it('a page outside the app shell is never a Back target', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'l', '/login', { shell: false }));
    h.track(at('PUSH', 'd', '/dashboard'));
    expect(h.originOf('d')).toBeNull();
  });

  it('ignores the intermediate states of a navigation', () => {
    const h = createNavHistory(null);
    h.track(at('POP', 'a', '/dashboard'));
    h.track(at('PUSH', 'b', '/invoices', { navigating: true }));
    h.track(at('PUSH', 'b', '/invoices'));
    expect(h.originOf('b')?.pathname).toBe('/dashboard');
  });

  it('survives a reload through storage', () => {
    const storage = memoryStorage();
    const before = createNavHistory(storage);
    before.track(at('POP', 'd', '/dashboard'));
    before.track(at('PUSH', 'f', '/bills/new'));

    const after = createNavHistory(storage);
    expect(after.originOf('f')?.pathname).toBe('/dashboard');
  });

  it('starts empty on unreadable storage rather than throwing', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const h = createNavHistory(broken);
    h.track(at('POP', 'd', '/dashboard'));
    expect(() => h.track(at('PUSH', 'f', '/bills/new'))).not.toThrow();
    expect(h.originOf('f')?.pathname).toBe('/dashboard');
  });

  it('ignores malformed stored entries', () => {
    const storage = memoryStorage();
    storage.setItem('finmatrix:nav-origins', JSON.stringify([['x', { key: 1 }], 'junk', ['y', { key: 'a', pathname: '/dashboard', search: '' }]]));
    const h = createNavHistory(storage);
    expect(h.originOf('x')).toBeNull();
    expect(h.originOf('y')?.pathname).toBe('/dashboard');
  });
});

describe('backLabelFor', () => {
  it('names a list or report by its nav title', () => {
    expect(backLabelFor('/dashboard')).toBe('Dashboard');
    expect(backLabelFor('/reports/general-ledger')).toBe('General Ledger');
    expect(backLabelFor('/customers')).toBe('Customers');
    expect(backLabelFor('/payments')).toBe('Payments');
  });

  it('names a record by its kind', () => {
    expect(backLabelFor('/estimates/abc')).toBe('Estimate');
    expect(backLabelFor('/journal-entries/42')).toBe('Journal entry');
    expect(backLabelFor('/payroll/runs/9')).toBe('Payroll run');
    expect(backLabelFor('/reports/inventory-valuation/item-1')).toBe('Item report');
  });

  it('names a form', () => {
    expect(backLabelFor('/invoices/new')).toBe('New invoice');
    expect(backLabelFor('/bills/7/edit')).toBe('Edit bill');
  });

  it('prefers a nav entry over the record pattern it also matches', () => {
    expect(backLabelFor('/deliveries/completions')).toBe('Completions');
    expect(backLabelFor('/bills/pay')).toBe('Pay Bills');
  });

  it('falls back to "Back" for anything it does not know', () => {
    expect(backLabelFor('/somewhere/else')).toBe('Back');
  });
});
