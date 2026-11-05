import { formatGELShort } from '@/utils/pricing';
import type { ShownPrice } from './catalogue';

/** The `doctor` namespace's `t`, or anything shaped like it. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** "20 ₾-დან" / "250 ₾": the amount, with "from" unless it is the one price. */
export function priceLabel(p: Pick<ShownPrice, 'amount' | 'exact'> | null, t: TFn): string | null {
  if (!p) return null;
  const amount = formatGELShort(p.amount);
  return p.exact ? amount : t('marketplace.fromPrice', { price: amount });
}
