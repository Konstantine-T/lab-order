import { startingPrice, type StartingPrice } from '@/utils/pricing';
import { priceIsExact } from '@/features/catalog/servicePrice';
import type { PricingConfig, RushType } from '@/types/database';

/**
 * What the price column of the lab profile's services table says for one
 * service. Never a bare 0: a service that publishes no number says so in
 * words.
 *
 *   amount      — `startingPrice`'s figure and unit. `from` is set whenever
 *                 the figure is the cheapest of several (materials, implant
 *                 rates, print units…), so "145 ₾ / tooth" is only printed
 *                 when every one-tooth order really costs 145 ₾.
 *   described   — LAB_DESCRIBED: the lab's own prose, shown as written.
 *   noPricing   — NO_PRICING: the lab publishes no price at all.
 *   labConfirms — a structured model that still has no number to show (an
 *                 implant form without crown prices, a custom form).
 *   unavailable — the service's form isn't published, so nothing is orderable
 *                 and no price is advertised.
 */
export type PriceDisplay =
  | { kind: 'amount'; amount: number; per: StartingPrice['per']; from: boolean }
  | { kind: 'described'; text: string }
  | { kind: 'noPricing' }
  | { kind: 'labConfirms' }
  | { kind: 'unavailable' };

const positive = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

export function priceDisplay(
  orderable: boolean,
  pricing: PricingConfig | null | undefined,
  templateCode: string | null | undefined,
): PriceDisplay {
  if (!orderable || !pricing) return { kind: 'unavailable' };
  const sp = startingPrice(pricing, templateCode);
  if (sp) {
    const from = !priceIsExact(pricing, templateCode);
    return { kind: 'amount', amount: sp.amount, per: sp.per, from };
  }
  if (pricing.model === 'LAB_DESCRIBED') {
    const text = pricing.price_description?.trim();
    return text ? { kind: 'described', text } : { kind: 'labConfirms' };
  }
  if (pricing.model === 'NO_PRICING') return { kind: 'noPricing' };
  return { kind: 'labConfirms' };
}

/** A service's rush option, when the lab both enabled it and named the days. */
export type RushOffer = {
  days: number;
  surcharge: { type: Exclude<RushType, 'NONE'>; value: number } | null;
};

/** Same rule as `RushChip`: no day count, no rush shown. */
export function rushOffer(pricing: PricingConfig | null | undefined): RushOffer | null {
  const rush = pricing?.rush;
  if (!rush || rush.type === 'NONE' || !positive(rush.turnaround_days)) return null;
  return {
    days: rush.turnaround_days,
    surcharge: positive(rush.value) ? { type: rush.type, value: rush.value } : null,
  };
}
