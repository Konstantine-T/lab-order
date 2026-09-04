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

// ===== The one-hour window ==================================================

/** A time is stored as `HH:MM:SS`; only the first five characters are shown. */
const hhmm = (time: string) => time.slice(0, 5);

/**
 * The end of the window a start time implies.
 *
 * One hour, always, derived here and nowhere else. Storing an end column would
 * let it drift from the start and would invite someone to make it editable,
 * which is not what was asked for.
 *
 * `nextDay` is true when the hour crosses midnight — 23:30 ends at 00:30
 * tomorrow, and showing "23:30–00:30" unmarked reads as an end before its own
 * start.
 */
export function dueWindowEnd(time: string): { end: string; nextDay: boolean } {
  const [h, m] = hhmm(time).split(':').map(Number);
  const total = h * 60 + m + 60;
  const endH = Math.floor(total / 60) % 24;
  return {
    end: `${String(endH).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`,
    nextDay: total >= 24 * 60,
  };
}

/** Minimal shape of the i18next `t` we need. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * "2026-08-31", or "2026-08-31, 13:30–14:30" when a time was given.
 *
 * Every surface that shows a due date routes through this, so the window can
 * only be got wrong in one place. A date with no time renders exactly as it
 * always did — no stray dash, no invented 00:00.
 */
export function formatDueWindow(
  date: string | null | undefined,
  time: string | null | undefined,
  t: TranslateFn,
  fallback = '—',
): string {
  if (!date) return fallback;
  if (!time) return date;
  const { end, nextDay } = dueWindowEnd(time);
  const window = t('orderCard.dueWindow', { start: hhmm(time), end });
  return `${date}, ${window}${nextDay ? ` ${t('orderCard.dueWindowNextDay')}` : ''}`;
}

/** The time that goes with `dueDateOf` — the lab's once it exists. */
export function dueTimeOf(row: {
  confirmed_due_date?: string | null;
  confirmed_due_time?: string | null;
  requested_due_time?: string | null;
}): string | null {
  // Tied to which *date* is authoritative, not to which time happens to be
  // set: a lab that confirms a date but no time means "that day, any time".
  return (row.confirmed_due_date ? row.confirmed_due_time : row.requested_due_time) ?? null;
}

/**
 * The compact form for a list row: whatever short date the caller already
 * renders, plus the window when a time was asked for.
 *
 * Shares `dueWindowEnd` with `formatDueWindow`, so a row and the detail screen
 * it opens can never disagree about when the hour ends.
 */
export function appendDueWindow(
  formattedDate: string,
  time: string | null | undefined,
  t: TranslateFn,
): string {
  if (!time) return formattedDate;
  const { end, nextDay } = dueWindowEnd(time);
  const window = t('orderCard.dueWindow', { start: hhmm(time), end });
  return `${formattedDate} ${window}${nextDay ? ` ${t('orderCard.dueWindowNextDay')}` : ''}`;
}
