import { Icon, MetaChip } from '@/components/design';
import { formatGEL } from '@/utils/pricing';
import type { PricingConfig } from '@/types/database';

/** Minimal shape of the i18next `t` we need. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * "Rush: 3 days, +30%" — the lab's faster-delivery option, on the service card.
 *
 * A doctor with an urgent case scans the grid for exactly this, and until now
 * it was only discoverable by starting an order and finding the toggle in the
 * rail. The card is where the choice is actually made.
 *
 * Returns null unless the lab has both switched rush on AND given it a faster
 * turnaround — an enabled rush with no day count promises a speed it cannot
 * name, so it is better not shown than shown empty.
 */
export function RushChip({
  pricing,
  t,
}: {
  pricing: PricingConfig | undefined;
  /** The `common` namespace. */
  t: TranslateFn;
}) {
  const rush = pricing?.rush;
  if (!rush || rush.type === 'NONE' || !rush.turnaround_days) return null;

  // The surcharge is worth naming, but a rush with no price set still offers a
  // real faster date — say the days and leave the money out rather than
  // rendering "+%" or "+GEL 0.00".
  const days = t('rush.chipDays', { count: rush.turnaround_days });
  const surcharge =
    !rush.value || rush.value <= 0
      ? null
      : rush.type === 'PERCENTAGE'
        ? t('rush.chipPercent', { value: rush.value })
        : t('rush.chipFixed', { amount: formatGEL(rush.value) });

  return (
    <MetaChip icon={<Icon name="bolt" size={13} />}>
      {surcharge ? `${days} · ${surcharge}` : days}
    </MetaChip>
  );
}
