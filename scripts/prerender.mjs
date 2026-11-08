#!/usr/bin/env node
/**
 * Turns the public pages into static HTML, after `vite build`.
 *
 * WHY. FinMatrix is a single-page app: every address used to be served the
 * same index.html with an empty <div id="root">, filled in by JavaScript. A
 * crawler or reviewer that does not run JavaScript (Meta's business review,
 * many link previewers, some search bots) saw a blank page and the homepage's
 * title on every URL. Now each public page is a real HTML file with its own
 * title, description, canonical link and content.
 *
 * WHAT IT WRITES into dist/:
 *   app-shell.html      Vite's original index.html, untouched except that it
 *                       has no canonical link. vercel.json serves it for every
 *                       app address (/dashboard, /invoices/…), exactly as
 *                       index.html was served before.
 *   index.html          the homepage, prerendered.
 *   about.html, contact.html, privacy-policy.html, privacy.html,
 *   terms-of-service.html, acceptable-use-policy.html, data-deletion.html
 *                       the other public pages; vercel.json maps /about to
 *                       about.html and so on.
 *   sitemap.xml         from PUBLIC_PAGES in src/features/site/siteMeta.ts.
 *
 * It fails the build if a page renders without its <h1> or canonical link, so
 * a broken prerender can never ship an empty page.
 *
 * Inputs: dist/ from `vite build`, and the SSR bundle of src/prerender/entry.tsx
 * that `npm run build` writes to .prerender/ (deleted again at the end).
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const SSR_DIR = path.join(ROOT, '.prerender');

const fail = (msg) => {
  console.error(`\n[prerender] ${msg}\n`);
  process.exit(1);
};

const entryFile = ['entry.js', 'entry.mjs'].map((f) => path.join(SSR_DIR, f)).find((f) => fs.existsSync(f));
if (!entryFile) fail(`SSR bundle not found in ${SSR_DIR}. Run "npm run build".`);
const templatePath = path.join(DIST, 'index.html');
if (!fs.existsSync(templatePath)) fail('dist/index.html not found. Run "vite build" first.');

const { render, PUBLIC_PAGES, PRERENDER_PATHS, absoluteUrl } = await import(pathToFileURL(entryFile).href);

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Replace one tag's attribute value; fail loudly if the tag is missing. */
function setTag(html, pattern, replacement, what) {
  if (!pattern.test(html)) fail(`index.html has no ${what} to rewrite.`);
  return html.replace(pattern, replacement);
}

function headFor(template, page) {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const url = absoluteUrl(page.canonical);
  let html = template;
  html = setTag(html, /<title>[\s\S]*?<\/title>/, `<title>${title}</title>`, '<title>');
  html = setTag(html, /<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`, 'meta description');
  html = setTag(html, /<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${url}" />`, 'canonical link');
  html = setTag(html, /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`, 'og:title');
  html = setTag(html, /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`, 'og:description');
  html = setTag(html, /<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${url}" />`, 'og:url');
  html = setTag(html, /<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`, 'twitter:title');
  html = setTag(html, /<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`, 'twitter:description');
  return html;
}

/** dist file for a public path: / → index.html, /about → about.html. */
const fileFor = (p) => (p === '/' ? 'index.html' : `${p.slice(1)}.html`);

const template = fs.readFileSync(templatePath, 'utf8');
if (!template.includes('<div id="root"></div>')) fail('index.html has no empty <div id="root"></div>.');

// 1. The app shell: what every non-public address gets, as before. No canonical:
//    a signed-in screen must not claim to be the homepage.
const shell = template.replace(/\s*<link rel="canonical" href="[^"]*" \/>/, '');
fs.writeFileSync(path.join(DIST, 'app-shell.html'), shell);

// 2. Every public page.
const registered = new Set(PRERENDER_PATHS);
for (const page of PUBLIC_PAGES) {
  if (!registered.has(page.path)) fail(`${page.path} is in PUBLIC_PAGES but has no element in src/prerender/entry.tsx.`);
  const markup = await render(page.path);

  const h1 = markup.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const h1Text = h1 ? h1[1].replace(/<[^>]+>/g, '').trim() : '';
  if (!h1Text) fail(`${page.path} rendered without an <h1>.`);

  const kind = page.path === '/' ? 'landing' : 'page';
  const html = headFor(template, page).replace(
    '<div id="root"></div>',
    `<div id="root"><div data-prerendered="${kind}">${markup}</div></div>`,
  );
  if (!html.includes(`<link rel="canonical" href="${absoluteUrl(page.canonical)}" />`)) {
    fail(`${page.path} is missing its canonical link.`);
  }
  fs.writeFileSync(path.join(DIST, fileFor(page.path)), html);
  console.log(`[prerender] ${page.path.padEnd(24)} → dist/${fileFor(page.path).padEnd(28)} h1: ${h1Text.slice(0, 60)}`);
}

// 3. The sitemap.
const urls = PUBLIC_PAGES.filter((p) => p.inSitemap)
  .map((p) => `  <url>\n    <loc>${absoluteUrl(p.path)}</loc>\n    <lastmod>${p.updated}</lastmod>\n  </url>`)
  .join('\n');
fs.writeFileSync(
  path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
);
console.log(`[prerender] sitemap.xml with ${PUBLIC_PAGES.filter((p) => p.inSitemap).length} URLs; app-shell.html written`);

// 4. The SSR bundle was only a means to this end.
fs.rmSync(SSR_DIR, { recursive: true, force: true });
