import type { OrderStatus } from '@/types/database';

/**
 * The status filter every orders list shares: the lab's queue
 * (`matchesQueueFilter`) and the doctor's, the clinic's and a buying lab's
 * lists (`matchesStatusDue`).
 *
 * Nothing selected means every status but CANCELLED: a cancelled order is
 * history nobody acts on, and listing it by default buried the live ones.
 * Selecting "Cancelled", alone or with other statuses, shows them. Each list
 * says how many the default hides (`CancelledHiddenHint`), counted under
 * `CANCELLED_ONLY`, so they are never a mystery.
 */
export function matchesStatusSelection(
  status: OrderStatus,
  selected: readonly OrderStatus[],
): boolean {
  return selected.length === 0 ? status !== 'CANCELLED' : selected.includes(status);
}

/**
 * The selection under which a list shows exactly the cancelled orders its
 * default hides: what the hint counts with, and what its "Show" applies.
 */
export const CANCELLED_ONLY: readonly OrderStatus[] = ['CANCELLED'];

/** The selection with CANCELLED added — the hint's "Show". */
export const withCancelled = (selected: OrderStatus[]): OrderStatus[] =>
  selected.includes('CANCELLED') ? selected : [...selected, 'CANCELLED'];
