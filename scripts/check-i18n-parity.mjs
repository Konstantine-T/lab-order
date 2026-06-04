// Checks that every locale has the same keys for every namespace.
// Exits 1 and prints a diff if any locale is missing keys the others have.
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const localesDir = join(__dirname, '..', 'src', 'locales');

const locales = readdirSync(localesDir);
const namespaces = readdirSync(join(localesDir, locales[0])).map(f => f.replace('.json', ''));

function flatKeys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) => {
    const full = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flatKeys(v, full) : [full];
  });
}

let failed = false;

for (const ns of namespaces) {
  const byLocale = {};
  for (const locale of locales) {
    const file = join(localesDir, locale, `${ns}.json`);
    byLocale[locale] = flatKeys(JSON.parse(readFileSync(file, 'utf8')));
  }

  const allKeys = [...new Set(Object.values(byLocale).flat())].sort();

  for (const locale of locales) {
    const missing = allKeys.filter(k => !byLocale[locale].includes(k));
    if (missing.length) {
      console.error(`[${ns}] ${locale} is missing keys:`);
      missing.forEach(k => console.error(`  - ${k}`));
      failed = true;
    }
  }
}

if (!failed) {
  console.log('All locales are in parity.');
}
process.exit(failed ? 1 : 0);
