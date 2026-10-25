import type { TFunction } from 'i18next';

/**
 * The codes the ordering RPCs raise for a lab buying from a lab (0048), as
 * keys of `errors:labBuying.*`. Two of them can reach a doctor too: a doctor
 * submitting or editing with no patient, and a doctor or clinic sending the
 * LAB invoice recipient. Never show the raw message: it is English-only.
 */
const CODES = [
  'lab_cannot_buy',
  'cannot_order_from_own_lab',
  'patient_required',
  'invoice_recipient_not_allowed',
] as const;

export type BuyerErrorCode = (typeof CODES)[number];

export function buyerErrorCode(err: unknown): BuyerErrorCode | null {
  const msg = String((err as { message?: unknown } | null)?.message ?? '').toLowerCase();
  return CODES.find((c) => msg.includes(c)) ?? null;
}

/**
 * The sentence for `err` when it is one of the codes above, else null so the
 * caller keeps its own fallback. `t` is the `errors` namespace's.
 */
export function buyerErrorText(err: unknown, t: TFunction): string | null {
  const code = buyerErrorCode(err);
  return code ? t(`labBuying.${code}`) : null;
}
