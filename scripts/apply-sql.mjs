// Applies a SQL file to the Supabase project via the Management API.
// Usage: node scripts/apply-sql.mjs <path-to-sql-file>
// Reads SUPABASE_ACCESS_TOKEN from .env (never printed).
import { readFileSync } from 'node:fs';

const PROJECT_REF = 'zukelhnhdaoiufzkkjmm';

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8');
let token = envText
  .split('\n')
  .find((l) => l.startsWith('SUPABASE_ACCESS_TOKEN='))
  ?.slice('SUPABASE_ACCESS_TOKEN='.length)
  .trim();
// Strip surrounding quotes and a redundant "Bearer " prefix if present.
token = token?.replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '');
if (!token) {
  console.error('SUPABASE_ACCESS_TOKEN not found in .env');
  process.exit(1);
}
// Presence check only — don't emit token metadata (length/prefix/charset) to
// logs. The token is an account-wide Management PAT; keep its shape out of stderr.
if (!token.startsWith('sbp_')) {
  console.error('warning: SUPABASE_ACCESS_TOKEN does not look like a Management PAT (expected sbp_ prefix)');
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error('Usage: node scripts/apply-sql.mjs <file.sql>');
  process.exit(1);
}
const query = readFileSync(sqlPath, 'utf8');

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  },
);

const body = await res.text();
console.log('HTTP', res.status);
console.log(body.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
