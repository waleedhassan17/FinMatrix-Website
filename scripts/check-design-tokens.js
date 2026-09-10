#!/usr/bin/env node
/**
 * Fails the build on hardcoded type or colour in the UI.
 *
 * Ported from the app's scripts/check-design-tokens.js. It matters more here
 * than it did there: this console and the mobile app are used side by side by
 * the same company, so a colour written by hand in one of them is a place where
 * the two products visibly disagree. Without a gate, that drift is inevitable —
 * it is always faster to type a hex than to look up the token.
 *
 * What it bans across src/, in .ts and .tsx:
 *   '#0F766E' / "#0F766E"    -> a colour token          (colors.primary)
 *   bg-[#1F4E79]             -> a themed utility        (bg-primary)
 *   text-[22px]              -> a typography role       (text-h2)
 *   fontSize: 14             -> a typography role
 *   fontWeight: 600          -> a role
 *   fontFamily: 'Roboto'     -> FONT_STACK / the font-sans utility
 *
 * Tailwind's NAMED weight utilities (font-medium, font-normal…) are allowed:
 * the summary panel legitimately renders an h5 role at body weight, and the app
 * does the same. It is the *values* that must come from the system, not every
 * adjustment to them.
 *
 * ALLOWED lists the files that define tokens rather than consume them. Each
 * needs a reason.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOTS = ['src'];

const ALLOWED = new Map([
  ['src/theme/tokens.ts', 'defines the palette, type scale and elevation'],
  ['src/theme/status.ts', 'defines the status tiers'],
]);

const RULES = [
  {
    re: /'#[0-9A-Fa-f]{3,8}'/g,
    msg: 'hardcoded colour — use a colour token',
  },
  {
    // Both quote styles. Matching only single quotes lets every JSX attribute
    // through, which is exactly how off-system colours reach a codebase.
    re: /"#[0-9A-Fa-f]{3,8}"/g,
    msg: 'hardcoded colour — use a colour token',
  },
  {
    // Tailwind arbitrary colour: bg-[#1F4E79], text-[#DC2626], border-[#...].
    // These hide inside a quoted className, so the two rules above miss them.
    re: /\[#[0-9A-Fa-f]{3,8}\]/g,
    msg: 'hardcoded colour in a Tailwind arbitrary value — use a themed utility',
  },
  {
    // Tailwind arbitrary type size: text-[22px], text-[1.375rem].
    re: /\btext-\[\d*\.?\d+(px|rem|em)\]/g,
    msg: 'hardcoded font size — use a typography role (text-h2, text-body-md…)',
  },
  {
    re: /fontSize:\s*\d/g,
    msg: 'hardcoded fontSize — use a typography role',
  },
  {
    re: /fontWeight:\s*['"]?\d00['"]?/g,
    msg: 'hardcoded fontWeight — use a typography role',
  },
  {
    re: /fontFamily:\s*['"][^'"]+['"]/g,
    msg: 'hardcoded fontFamily — use FONT_STACK or the font-sans utility',
  },
];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'assets') walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const findings = [];
for (const root of ROOTS) {
  if (!fs.existsSync(root)) continue;
  for (const file of walk(root)) {
    if (ALLOWED.has(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      // A commented-out line is not shipped code.
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      for (const { re, msg } of RULES) {
        re.lastIndex = 0;
        if (re.test(line)) {
          findings.push({ file, line: i + 1, msg, text: line.trim() });
        }
      }
    });
  }
}

if (findings.length === 0) {
  console.log('Design tokens: clean.');
  process.exit(0);
}

console.error(`Design tokens: ${findings.length} hardcoded value(s).\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  ${f.msg}`);
  console.error(`    ${f.text.slice(0, 100)}`);
}
console.error(
  '\nEvery value comes from src/theme/tokens.ts. See the ROLE MAP comment there\n' +
    'for which token a given piece of UI takes. If a value genuinely belongs\n' +
    'outside the system, add the file to ALLOWED in this script with a reason.',
);
process.exit(1);
