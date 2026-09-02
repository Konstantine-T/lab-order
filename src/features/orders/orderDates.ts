/**
 * One definition of when a case is due, and one way to order by it.
 *
 * The coalesce below was written out inline in nineteen places across nine
 * files before this existed. That is why the lists could filter on the due date
 * and still sort on `created_at` without anyone noticing: nothing named the
 * concept, so nothing owned it.
 */

/** Rows carry these two columns everywhere an order is listed. */
export type DatedOrder = {
  confirmed_due_date: string | null;
  requested_due_date: string | null;
  created_at?: string;
};

/**
 * The date a case is actually due: the lab's confirmed date once it exists,
 * otherwise the date the doctor asked for. Every list, filter, badge and sort
 * has to agree on this.
 */
export function dueDateOf(row: DatedOrder): string | null {
  return row.confirmed_due_date ?? row.requested_due_date;
}

/**
 * Soonest deadline first.
 *
 * Undated orders sort last, not first. An order with no due date is not urgent,
 * and floating nulls to the top of a work queue would bury the real deadlines
 * under the ones nobody has scheduled.
 *
 * Ties break on newest-created, which preserves the previous ordering inside a
 * single day — so a lab that knew its list by shape still recognises it.
 *
 * Dates are ISO `YYYY-MM-DD`, which compares correctly as a string; the
 * existing date filters already rely on that, so there is nothing to parse.
 */
export function byDueDate(a: DatedOrder, b: DatedOrder): number {
  const da = dueDateOf(a);
  const db = dueDateOf(b);

  if (da == null && db == null) return tieBreak(a, b);
  if (da == null) return 1;
  if (db == null) return -1;
  if (da !== db) return da < db ? -1 : 1;
  return tieBreak(a, b);
}

/** Newest created first, matching the order the query already returns. */
function tieBreak(a: DatedOrder, b: DatedOrder): number {
  const ca = a.created_at ?? '';
  const cb = b.created_at ?? '';
  if (ca === cb) return 0;
  return ca > cb ? -1 : 1;
}
