import dayjs from 'dayjs';

/**
 * "22 ივლ" — the redesign's short date, in the active dayjs locale. The year
 * only appears when it is not this one, so a case from last December cannot
 * pass for next December's.
 */
export function shortDate(value: string): string {
  const d = dayjs(value);
  return d.format(d.year() === dayjs().year() ? 'D MMM' : 'D MMM YYYY');
}

/** "22 ივლ · 14:05" — for real timestamps only, never for a bare date. */
export function shortDateTime(value: string): string {
  return `${shortDate(value)} · ${dayjs(value).format('HH:mm')}`;
}

/** "გიორგი თ." — first name and last initial, as the mockups name a technician. */
export function shortName(first: string, last: string): string {
  const initial = last.trim().charAt(0);
  return initial ? `${first.trim()} ${initial}.` : first.trim();
}

/**
 * A dialable `tel:` link from however the lab typed its number, or null when
 * what is left would not dial anything.
 */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 5 ? `tel:${digits}` : null;
}
