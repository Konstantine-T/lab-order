// One-time interactive Telegram login for the platform userbot.
//
// WHAT THIS DOES
//   Logs the dedicated platform Telegram account in via MTProto and prints a
//   reusable "session string". That string lets the server-side Edge Function
//   act as this account WITHOUT ever needing the phone number or SMS code again.
//   You run this ONCE (or again only if the session is revoked).
//
// PREREQUISITES (human, see docs/SPEC-lab-staff-telegram.md §Runbook)
//   1. A dedicated Telegram account (its own phone number — NOT your personal one).
//   2. api_id + api_hash from https://my.telegram.org → "API development tools".
//
// RUN
//   npm i telegram            # GramJS — only needed locally for this script
//   TG_API_ID=123456 TG_API_HASH=abcdef... node scripts/tg-login.mjs
//   → follow the prompts (phone, the code Telegram texts you, 2FA password if set)
//   → copy the "TG_SESSION=..." line it prints at the end.
//
// Then set the three secrets on Supabase (see the runbook), and you never run
// this again.

import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error(
    '\nMissing TG_API_ID / TG_API_HASH.\n' +
      'Get them at https://my.telegram.org → API development tools, then run:\n' +
      '  TG_API_ID=123456 TG_API_HASH=your_hash node scripts/tg-login.mjs\n',
  );
  process.exit(1);
}

let TelegramClient, StringSession;
try {
  ({ TelegramClient } = await import('telegram'));
  ({ StringSession } = await import('telegram/sessions/index.js'));
} catch {
  console.error(
    "\nGramJS is not installed. Install it locally first:\n  npm i telegram\n",
  );
  process.exit(1);
}

const rl = createInterface({ input, output });
const ask = (q) => rl.question(q);

const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
  connectionRetries: 5,
});

console.log('\nLogging in the platform userbot. Answer the prompts below.\n');

await client.start({
  phoneNumber: () => ask('Phone number (with country code, e.g. +9955...): '),
  password: () => ask('2FA password (leave blank if none): '),
  phoneCode: () => ask('Login code Telegram just sent you: '),
  onError: (err) => console.error('Login error:', err?.message ?? err),
});

const session = client.session.save();
const me = await client.getMe();

console.log('\n✅ Logged in as:', `${me.firstName ?? ''} ${me.lastName ?? ''}`.trim(), me.username ? `(@${me.username})` : '');
console.log('\nAdd these three secrets to Supabase (see the runbook):\n');
console.log(`TG_API_ID=${apiId}`);
console.log(`TG_API_HASH=${apiHash}`);
console.log(`TG_SESSION=${session}`);
console.log(
  '\n⚠️  The session string is a full login credential — treat it like a password.' +
    '\n    Never commit it. Set it only via `supabase secrets set`.\n',
);

await client.disconnect();
await rl.close();
process.exit(0);
