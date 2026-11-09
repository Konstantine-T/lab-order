import type { PaymentStatus } from '@/types/database';

/**
 * The finances pages' squares and the payment-status filter each one sets.
 *
 * The rule (the dashboard-tiles one): the rows a click lands on are exactly
 * the orders behind the number. So a square's number is taken over every
 * filter but the payment status (J2), and clicking it sets the payment status
 * to the orders that make it up:
 *
 *   outstanding  unpaid + partially paid   paid orders owe nothing
 *   billed       every status (empty)      every order with a bill
 *   collected    paid + partially paid     the orders money came in for (J3)
 *
 * The count squares (the lab's customers, the clinic's orders) also set
 * "every status"; "Billed" is the one shown selected for it.
 */
export type PaymentSquare = 'outstanding' | 'billed' | 'collected';

/** Everything still owed. */
export const OWED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['UNPAID', 'PARTIALLY_PAID'];

/** Every order some money has been received for. */
export const COLLECTED_PAYMENT_STATUSES: readonly PaymentStatus[] = ['PAID', 'PARTIALLY_PAID'];

export const SQUARE_PAYMENT_STATUSES: Record<PaymentSquare, readonly PaymentStatus[]> = {
  outstanding: OWED_PAYMENT_STATUSES,
  billed: [],
  collected: COLLECTED_PAYMENT_STATUSES,
};

const sameSet = (a: readonly PaymentStatus[], b: readonly PaymentStatus[]) =>
  a.length === b.length && a.every((s) => b.includes(s));

/** The square whose filter is the current payment-status selection, if any. */
export function selectedPaymentSquare(statuses: readonly PaymentStatus[]): PaymentSquare | null {
  const squares = Object.keys(SQUARE_PAYMENT_STATUSES) as PaymentSquare[];
  return squares.find((sq) => sameSet(statuses, SQUARE_PAYMENT_STATUSES[sq])) ?? null;
}

/** Sums over the per-customer / per-doctor rollup the squares are read from. */
export function squareTotals(
  rows: readonly {
    order_count: number | string;
    total_billed: number | string;
    total_paid: number | string;
    total_outstanding: number | string;
  }[],
) {
  return {
    outstanding: rows.reduce((s, r) => s + Number(r.total_outstanding), 0),
    billed: rows.reduce((s, r) => s + Number(r.total_billed), 0),
    collected: rows.reduce((s, r) => s + Number(r.total_paid), 0),
    groups: rows.length,
    orders: rows.reduce((s, r) => s + Number(r.order_count), 0),
  };
}
