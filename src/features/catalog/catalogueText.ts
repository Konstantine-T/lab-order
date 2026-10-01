import { formatGELShort } from '@/utils/pricing';
import type { CatalogueRush, ShownPrice } from './catalogue';

/** The `doctor` namespace's `t`, or anything shaped like it. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** "20 ₾-დან" / "250 ₾": the amount, with "from" unless it is the one price. */
export function priceLabel(p: Pick<ShownPrice, 'amount' | 'exact'> | null, t: TFn): string | null {
  if (!p) return null;
  const amount = formatGELShort(p.amount);
  return p.exact ? amount : t('marketplace.fromPrice', { price: amount });
}

/** "სასწრაფო +10% · მინ. 2 დღე" — or without the surcharge when the lab set none. */
export function rushNote(rush: CatalogueRush, t: TFn): string {
  const days = t('marketplace.days', { count: rush.days });
  if (rush.value === null) return t('marketplace.card.rushNoteDays', { days });
  const surcharge =
    rush.type === 'PERCENTAGE' ? `+${rush.value}%` : `+${formatGELShort(rush.value)}`;
  return t('marketplace.card.rushNote', { surcharge, days });
}
