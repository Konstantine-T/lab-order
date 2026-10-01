import { formatGELShort } from '@/utils/pricing';
import { radii } from '@/theme/tokens';
import type { ProfileService } from './useLabProfile';
import type { RushOffer } from './priceDisplay';

/** Minimal shape of the i18next `t` these helpers need. */
export type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** The white card every block of the profile sits in (design page 4). */
export const panelSx = {
  bgcolor: 'background.paper',
  border: 1,
  borderColor: 'divider',
  borderRadius: `${radii.card}px`,
} as const;

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
 * `offered` is false when no service offers rush at all.
 */
export function rushSummary(
  services: ProfileService[],
  tc: TranslateFn,
): { offered: boolean; surcharge: string | null } {
  const offers = services.map((s) => s.rush).filter((r): r is RushOffer => r !== null);
  if (!offers.length) return { offered: false, surcharge: null };
  const pcts = offers.map((r) => (r.surcharge?.type === 'PERCENTAGE' ? r.surcharge.value : null));
  if (pcts.some((p) => p === null)) return { offered: true, surcharge: null };
  const values = pcts as number[];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    offered: true,
    surcharge:
      min === max
        ? tc('rush.chipPercent', { value: min })
        : tc('rush.chipPercent', { value: `${min}–${max}` }),
  };
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
