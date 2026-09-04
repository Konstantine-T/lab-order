/**
 * A lab's phone number as a WhatsApp link.
 *
 * `wa.me` wants digits only, in full international form, with no plus. Labs
 * type their number however they like — "557 00 26 21", "+995 557 002621" —
 * so the punctuation goes first and a bare Georgian mobile gets its country
 * code.
 *
 * Returns null when the number can't be made into something wa.me will
 * accept, so the caller renders a plain chip instead of a link that fails.
 */
export function whatsappUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // 995 is Georgia. A local mobile is nine digits starting with 5; anything
  // already carrying a country code is left alone rather than guessed at.
  const full =
    digits.startsWith('995') ? digits
    : digits.length === 9 && digits.startsWith('5') ? `995${digits}`
    : digits;

  // E.164 is 15 digits at most, and a country code plus a subscriber number is
  // at least 10. Outside that it isn't a single dialable number — a lab that
  // typed two numbers in the field, or a landline with a country code — and
  // wa.me would answer with "phone number shared via url is invalid". Better a
  // plain chip than a link that goes nowhere.
  return full.length >= 10 && full.length <= 15 ? `https://wa.me/${full}` : null;
}
