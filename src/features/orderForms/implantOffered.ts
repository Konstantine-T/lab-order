import type { ImplantPriceItem } from '@/types/database';

// Kept out of implantTypes.ts, which the eager entry chunk loads (pricing.ts
// imports it): only the lazily loaded order forms need this.
/**
 * The options of one implant group the lab offers: the ones its Pricing tab
 * leaves switched on (`implant_price_config[key].enabled`; an item the stored
 * config lacks counts as on, as the editor shows it). In both pricing modes,
 * so automatic and described services offer the same choices.
 *
 * Two safety nets, so a form never strands the doctor or hides an answer:
 * the option already chosen stays listed (an order placed before the lab
 * switched it off, read back on the order and edit pages), and a group the
 * lab switched off entirely falls back to every option.
 */
export function offeredImplantOptions<K extends string>(
  keys: readonly K[],
  config: Record<string, ImplantPriceItem> | undefined,
  current?: string,
): K[] {
  const on = keys.filter((k) => config?.[k]?.enabled !== false);
  if (on.length === 0) return [...keys];
  return keys.filter((k) => on.includes(k) || k === current);
}
