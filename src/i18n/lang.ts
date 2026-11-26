// ═══════════════════════════════════════════════════════
// FinMatrix Web — the reader's language (English / اردو)
// ═══════════════════════════════════════════════════════
// The web had no i18n library, and the launch screens are the first to be
// bilingual, so this stays deliberately small: one stored choice, a hook, and
// `pick()` for a { en, ur } pair. Strings live next to the feature that uses
// them (src/i18n/launchStrings.ts), not in one global catalogue.

import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'ur';
export interface Bilingual {
  en: string;
  ur: string;
}

const KEY = 'fm.lang';
const listeners = new Set<() => void>();

const readStored = (): Lang | null => {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === 'en' || v === 'ur' ? v : null;
  } catch {
    return null;
  }
};

/** Stored choice, else the browser's language (Urdu → ur), else English. */
export const currentLang = (): Lang => {
  const stored = readStored();
  if (stored) return stored;
  if (typeof navigator !== 'undefined' && /^ur\b/i.test(navigator.language ?? '')) return 'ur';
  return 'en';
};

export const setLang = (lang: Lang): void => {
  try {
    window.localStorage.setItem(KEY, lang);
  } catch {
    /* private mode: the choice lasts for this page only */
  }
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The reader's language; re-renders when it changes. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, currentLang, () => 'en');
}

/** One side of a bilingual pair. */
export const pick = (text: Bilingual, lang: Lang): string => text[lang] || text.en;

/** Direction attributes for a block of text in `lang`. */
export const dirProps = (lang: Lang) =>
  lang === 'ur' ? ({ dir: 'rtl', lang: 'ur' } as const) : ({ dir: 'ltr', lang: 'en' } as const);
