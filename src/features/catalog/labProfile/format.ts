import { formatGELShort } from '@/utils/pricing';
import { radii } from '@/theme/tokens';
import type { ProfileLab, ProfileMaterial, ProfileService } from './useLabProfile';
import type { PriceDisplay, RushOffer } from './priceDisplay';

/** Minimal shape of the i18next `t` these helpers need. */
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** The white card every block of the profile sits in (lab.html). */
export const panelSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: `${radii.labCard}px`,
} as const;

/** The parts of the profile its tabs jump to. */
export const SECTION = {
  services: 'lab-services',
  reviews: 'lab-reviews',
  about: 'lab-about',
} as const;

/**
 * Where a jumped-to section stops: clear of the sticky tabs (and, in the shell
 * that has one, of the mobile top bar they stick under).
 */
export const sectionScrollMargin = 'calc(var(--page-header-top, 56px) + 64px)';

/**
 * Scrolls to a section and focuses its heading (`tabindex="-1"`), so a keyboard
 * or screen-reader user lands where the page moved to. React Router never
 * scrolls to a hash, so every jump on the profile comes through here.
 */
export function jumpToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el.querySelector<HTMLElement>('[tabindex="-1"]')?.focus({ preventScroll: true });
}

type AmountPrice = Extract<PriceDisplay, { kind: 'amount' }>;

/** "80 ₾" or "from 80 ₾": the figure, saying "from" when it is only the floor. */
export function amountText(price: AmountPrice, t: TranslateFn): string {
  const amount = formatGELShort(price.amount);
  return price.from ? t('marketplace.fromPrice', { price: amount }) : amount;
}

/** "/ tooth", or nothing for a price per order. */
export function unitText(price: AmountPrice, t: TranslateFn): string | undefined {
  return price.per === 'order' ? undefined : t(`marketplace.per.${price.per}`);
}

/**
 * The price the profile headlines, by the catalogue card's rule so a lab never
 * leads with one price there and another here: the cheapest crown & bridge per
 * tooth, else its cheapest published price of any kind.
 */
export function featuredProfilePrice(
  services: ProfileService[],
): { service: ProfileService; price: AmountPrice } | null {
  const priced = services.flatMap((service) =>
    service.price.kind === 'amount' ? [{ service, price: service.price }] : [],
  );
  const cheapest = (list: typeof priced) =>
    list.reduce<(typeof priced)[number] | null>(
      (best, x) => (!best || x.price.amount < best.price.amount ? x : best),
      null,
    );
  return (
    cheapest(priced.filter((x) => x.service.category === 'crownBridge' && x.price.per === 'tooth')) ??
    cheapest(priced)
  );
}

/** Every material the lab's services list, once each, in the lab's own order. */
export function labMaterials(services: ProfileService[]): ProfileMaterial[] {
  const seen = new Map<string, ProfileMaterial>();
  for (const s of services) {
    for (const m of s.materials) {
      if (!seen.has(m.key)) seen.set(m.key, m);
    }
  }
  return [...seen.values()];
}

/** "4 days" or "2–5 days". */
export function rangeText(range: { min: number; max: number }, t: TranslateFn): string {
  return range.min === range.max
    ? t('marketplace.days', { count: range.max })
    : t('labProfile.daysRange', { min: range.min, max: range.max });
}

/** "4 დღე", or the lab's own label ("1–2 weeks"), or null when it says nothing. */
export function turnaroundText(
  s: Pick<ProfileService, 'turnaroundDays' | 'turnaroundLabel'>,
  t: TranslateFn,
): string | null {
  if (s.turnaroundLabel) return s.turnaroundLabel;
  if (s.turnaroundDays) return t('marketplace.days', { count: s.turnaroundDays });
  return null;
}

/** "+10%" / "+20 ₾", or null for a rush with no surcharge set. */
export function rushSurchargeText(r: RushOffer, tc: TranslateFn): string | null {
  if (!r.surcharge) return null;
  return r.surcharge.type === 'PERCENTAGE'
    ? tc('rush.chipPercent', { value: r.surcharge.value })
    : tc('rush.chipFixed', { amount: formatGELShort(r.surcharge.value) });
}

/** "3 დღე · +10%" — the rush column. */
export function rushText(r: RushOffer, t: TranslateFn, tc: TranslateFn): string {
  const days = t('marketplace.days', { count: r.days });
  const surcharge = rushSurchargeText(r, tc);
  return surcharge ? `${days} · ${surcharge}` : days;
}

/**
 * Shortest and longest average turnaround across the services a doctor can
 * order — the same set, and so the same range, as the catalogue card's.
 */
export function turnaroundRange(services: ProfileService[]): { min: number; max: number } | null {
  const days = services
    .filter((s) => s.orderable)
    .map((s) => s.turnaroundDays)
    .filter((d): d is number => d !== null);
  return days.length ? { min: Math.min(...days), max: Math.max(...days) } : null;
}

/**
 * The header's one-line rush summary: "+10%" when every rush the lab offers
 * costs the same percentage, "+5–20%" when the percentages differ, and null
 * (→ "rush available") when fixed fees or unpriced rushes are in the mix.
 * `offered` is false when no service offers rush at all; `days` is its fastest.
 */
export function rushSummary(
  services: ProfileService[],
  tc: TranslateFn,
): { offered: boolean; surcharge: string | null; days: number | null } {
  const offers = services.map((s) => s.rush).filter((r): r is RushOffer => r !== null);
  if (!offers.length) return { offered: false, surcharge: null, days: null };
  const days = Math.min(...offers.map((r) => r.days));
  const pcts = offers.map((r) => (r.surcharge?.type === 'PERCENTAGE' ? r.surcharge.value : null));
  if (pcts.some((p) => p === null)) return { offered: true, surcharge: null, days };
  const values = pcts as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    offered: true,
    days,
    surcharge:
      min === max
        ? tc('rush.chipPercent', { value: min })
        : tc('rush.chipPercent', { value: `${min}–${max}` }),
  };
}

/** Whether the contact card has anything to show. */
export function labHasContact(lab: ProfileLab): boolean {
  return !!(
    lab.contact_phone?.trim() ||
    lab.contact_email?.trim() ||
    lab.working_address?.trim() ||
    lab.city?.trim()
  );
}

/** Google Maps search for the lab's address — opened in a new tab. */
export function mapsUrl(address: string | null, city: string | null): string | null {
  const q = [address?.trim(), city?.trim()].filter(Boolean).join(', ');
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

/** A dialable `tel:` href — digits and a leading plus only. */
export function telHref(phone: string): string | null {
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  return cleaned.replace(/\+/g, '').length >= 5 ? `tel:${cleaned}` : null;
}
