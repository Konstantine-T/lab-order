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

/**
 * The ordering RPCs' other refusals (_submit_order_impl, edit_order), which
 * raise plain English sentences rather than codes, as keys of
 * `errors:orderRpc.*`. Matched whole, case-insensitively: "order not found" must
 * not catch "Continued order not found or not in the same lab". Most of these
 * are races (the lab paused, the service or form changed, the lab moved the
 * order on) that a retry will not fix, so the reason has to be said.
 */
const RPC_MESSAGES: Record<string, string> = {
  'lab is not available for orders': 'labUnavailable',
  'service is not available': 'serviceUnavailable',
  'form version not found or not published': 'formChanged',
  'continued order not found or not in the same lab': 'continuedOrderMissing',
  'work location is not available': 'workLocationUnavailable',
  'patient not found': 'patientNotFound',
  'order not found': 'orderNotFound',
  'you are not allowed to edit this order': 'notAllowed',
  'this order can no longer be edited': 'notEditable',
  patient_reference_too_long: 'referenceTooLong',
  // 0050: ordering for a clinic.
  not_in_clinic: 'notInClinic',
  clinic_address_missing: 'clinicAddressMissing',
  'this doctor is not in your clinic': 'doctorNotInClinic',
};

export function orderRpcErrorKey(err: unknown): string | null {
  const msg = String((err as { message?: unknown } | null)?.message ?? '')
    .trim()
    .toLowerCase();
  return RPC_MESSAGES[msg] ?? null;
}

/**
 * The words for any refusal the submit / edit RPCs are known to raise: the 0048
 * codes first, then the sentences above. Null for anything else, so the caller
 * keeps its own fallback. `t` is the `errors` namespace's.
 */
export function orderErrorText(err: unknown, t: TFunction): string | null {
  const buyerText = buyerErrorText(err, t);
  if (buyerText) return buyerText;
  const key = orderRpcErrorKey(err);
  return key ? t(`orderRpc.${key}`) : null;
}
