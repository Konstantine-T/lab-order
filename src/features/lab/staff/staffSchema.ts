import { z } from 'zod';

/**
 * Normalizes a user-typed phone to a compact E.164-ish form:
 * strips spaces/dashes/dots/parentheses, converts a leading "00" to "+",
 * and applies a Georgian default prefix so a bare local mobile as locals type
 * it (e.g. 555123456 or 0555123456) becomes +995555123456. Numbers already in
 * international form (leading "+") or a non-Georgian shape are left untouched —
 * full validation happens against E164_RE below.
 */
export function normalizePhone(raw: string): string {
  let p = raw.replace(/[\s\-().]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (p.startsWith('+')) return p;
  // Georgian mobile: 9 digits starting with 5, optionally a national "0" trunk.
  if (/^0?5\d{8}$/.test(p)) p = `+995${p.replace(/^0/, '')}`;
  return p;
}

/** E.164: "+" then 8–15 digits, first digit non-zero. */
const E164_RE = /^\+[1-9]\d{7,14}$/;

export const staffSchema = z.object({
  first_name: z.string().trim().min(2),
  last_name: z.string().trim().min(2),
  phone: z
    .string()
    .trim()
    .min(1)
    .transform(normalizePhone)
    // -> zod "invalid_string" => errors:zod.invalid_string ("Invalid format.")
    .pipe(z.string().regex(E164_RE)),
  email: z.string().trim().email().optional().or(z.literal('')),
});

export type StaffInput = z.infer<typeof staffSchema>;
