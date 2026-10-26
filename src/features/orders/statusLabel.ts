import type { OrderStatus } from '@/types/database';

/** Any `t` will do: i18next's own, or the narrower ones the list helpers take. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Whose screen the status is read on. A new order is "sent" from the doctor's
 * side and "received, sent to us" from the lab's: in Georgian გაგზავნილი vs
 * გამოგზავნილი. A lab's own purchase screens (0048) are the doctor's side.
 */
export type StatusSide = 'lab' | 'doctor';

/**
 * The one place a status label is built. `common:orderStatus.labSide.<status>`
 * wins on the lab's side where it exists (only SUBMITTED today); everything
 * else reads `common:orderStatus.<status>`. Any namespace's `t` will do.
 */
export function statusLabel(status: OrderStatus, t: Translate, side: StatusSide = 'doctor'): string {
  const base = t(`orderStatus.${status}`, { ns: 'common' });
  return side === 'lab'
    ? t(`orderStatus.labSide.${status}`, { ns: 'common', defaultValue: base })
    : base;
}
