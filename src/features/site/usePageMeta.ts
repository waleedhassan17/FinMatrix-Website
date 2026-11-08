// ═══════════════════════════════════════════════════════
// FinMatrix — per-page title, description and canonical
// ═══════════════════════════════════════════════════════
// The prerendered HTML already carries the right head tags for each public page
// (scripts/prerender.mjs writes them). This hook keeps them right after the app
// takes over and the visitor moves between pages without a reload.
//
// On unmount it puts back the defaults the app shell carries (the homepage's
// title and description, no canonical), so the ERP behind sign-in never inherits
// "Terms of service" or a canonical link from the last public page the user
// passed through.

import { useEffect } from 'react';

import { DEFAULT_PAGE, absoluteUrl, type PublicPage } from '@/features/site/siteMeta';

interface Meta {
  title: string;
  description: string;
  canonical: string;
  noindex?: boolean;
}

function setMeta(selector: string, attr: 'name' | 'property', key: string, value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

function setRobots(noindex: boolean) {
  const el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (noindex) {
    setMeta('meta[name="robots"]', 'name', 'robots', 'noindex');
  } else if (el) {
    el.remove();
  }
}

function apply(meta: Meta) {
  document.title = meta.title;
  const url = absoluteUrl(meta.canonical);
  setMeta('meta[name="description"]', 'name', 'description', meta.description);
  setMeta('meta[property="og:title"]', 'property', 'og:title', meta.title);
  setMeta('meta[property="og:description"]', 'property', 'og:description', meta.description);
  setMeta('meta[property="og:url"]', 'property', 'og:url', url);
  setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', meta.title);
  setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', meta.description);
  setCanonical(url);
  setRobots(Boolean(meta.noindex));
}

/** Back to what app-shell.html carries: default title, no canonical. */
function reset() {
  apply(DEFAULT_PAGE);
  document.head.querySelector('link[rel="canonical"]')?.remove();
}

/** Title, description, canonical and Open Graph for one public page. */
export function usePageMeta(page: PublicPage | Meta | undefined) {
  useEffect(() => {
    if (!page) return;
    apply(page);
    return reset;
  }, [page]);
}
