#!/usr/bin/env node
/**
 * Regenerate the Material Symbols Rounded subset.
 *
 * The full font is 5.2 MB; we ship only the glyphs listed in
 * scripts/icon-names.txt (currently ~55 KB). Run this after adding a name:
 *
 *   npm run icons:fetch
 *
 * Writes src/assets/fonts/material-symbols-rounded-subset.woff2.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const listPath = resolve(here, 'icon-names.txt');
const outPath = resolve(here, '../src/assets/fonts/material-symbols-rounded-subset.woff2');
const cssPath = resolve(here, '../src/assets/fonts/material-symbols.css');

// Google serves woff2 only to browsers that advertise support.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// `\r?`: on a CRLF checkout the comment regex below would otherwise stop at
// the `\r` and leave the comment line in the list, which Google answers with
// a 400 for the whole request.
const names = readFileSync(listPath, 'utf8')
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*$/, '').trim())
  .filter(Boolean)
  .sort();

if (names.length === 0) {
  console.error('scripts/icon-names.txt is empty — refusing to build an empty font.');
  process.exit(1);
}

const cssUrl =
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0' +
  `&icon_names=${names.join(',')}`;

const css = await fetch(cssUrl, { headers: { 'User-Agent': UA } }).then((r) => {
  if (!r.ok) throw new Error(`Google Fonts CSS request failed: ${r.status}`);
  return r.text();
});

const fontUrl = css.match(/https:\/\/fonts\.gstatic\.com[^)]+/)?.[0];
if (!fontUrl) {
  throw new Error('No font URL in the returned CSS. Did the icon list contain an invalid name?');
}

const buf = await fetch(fontUrl).then((r) => {
  if (!r.ok) throw new Error(`Font download failed: ${r.status}`);
  return r.arrayBuffer();
});

writeFileSync(outPath, Buffer.from(buf));

// Stamp the subset's hash into the CSS url. The dev server serves the font
// under a fixed name, so a browser that has it cached keeps the OLD subset
// after a rebuild and renders every new icon as its literal name — until
// someone thinks of a hard refresh. A changed query string is a new URL.
const hash = createHash('sha256').update(Buffer.from(buf)).digest('hex').slice(0, 8);
const stamped = readFileSync(cssPath, 'utf8').replace(
  /material-symbols-rounded-subset\.woff2(\?v=[0-9a-f]+)?/,
  `material-symbols-rounded-subset.woff2?v=${hash}`,
);
writeFileSync(cssPath, stamped);

console.log(
  `${names.length} icons → ${outPath} (${(buf.byteLength / 1024).toFixed(1)} KB), css v=${hash}`,
);
