import dayjs, { type Dayjs } from 'dayjs';
import { appendDueWindow, dueDateOf, dueTimeOf } from '@/features/orders/orderDates';
import { pipelineIndex } from '@/features/orders/pipeline';
import type { ListOrderRow } from './orderListModel';

/** Minimal shape of the i18next `t` these helpers need. */
type TranslateFn = (key: string, opts?: Record<string, unknown>) => string;

/** "31 ივლ" / "Jul 31" — the short date every card line uses. The pattern is a
 *  translation so English can put the month first. */
export const shortDate = (iso: string, t: TranslateFn) =>
  dayjs(iso).format(t('common:orderList.dateFormat'));

/**
 * `shortDate`, plus the year when it is not the current one — for a date that
 * looks back (when an order was created, when it was last changed), where a
 * case from last September must not pass for this one's.
 */
export function pastDate(iso: string, t: TranslateFn, now: Dayjs = dayjs()): string {
  const at = dayjs(iso);
  return at.year() === now.year()
    ? at.format(t('common:orderList.dateFormat'))
    : at.format(t('common:orderList.dateFormatYear'));
}

/**
 * "12 წთ წინ", "1 სთ წინ", "დღეს", "გუშინ" — how long ago an order was sent,
 * while that is still recent enough to say so; null once it is older than
 * yesterday.
 */
export function recentAge(iso: string, t: TranslateFn, now: Dayjs = dayjs()): string | null {
  const at = dayjs(iso);
  const minutes = now.diff(at, 'minute');
  if (minutes < 1) return t('common:orderList.age.justNow');
  if (minutes < 60) return t('common:orderList.age.minutes', { count: minutes });
  // A few hours reads better as hours; past that "today" says enough.
  if (minutes < 6 * 60) return t('common:orderList.age.hours', { count: Math.floor(minutes / 60) });
  if (at.isSame(now, 'day')) return t('common:orderList.age.today');
  if (at.isSame(now.subtract(1, 'day'), 'day')) return t('common:orderList.age.yesterday');
  return null;
}

/**
 * "12 წთ წინ", "1 სთ წინ", "დღეს", "გუშინ", then a date — how long ago an
 * order was sent, as the board's "sent" column labels it.
 */
export function relativeAge(iso: string, t: TranslateFn, now: Dayjs = dayjs()): string {
  return recentAge(iso, t, now) ?? shortDate(iso, t);
}

export type DueLine = {
  text: string;
  /**
   * `overdue` — past its date and the lab still has it; `confirmed` — the lab
   * has committed to the date (aqua: confirmed); `requested` — only the date
   * the doctor asked for.
   */
  tone: 'overdue' | 'confirmed' | 'requested';
};

/**
 * "ვადა 31 ივლ · 3 დღე" — the due date and, while the lab still has the case,
 * how many days are left. Once the work has been handed over the countdown
 * means nothing, so only the date remains. Null when the order has no date.
 */
export function dueLine(row: ListOrderRow, t: TranslateFn, now: Dayjs = dayjs()): DueLine | null {
  const due = dueDateOf(row);
  if (!due) return null;

  const date = appendDueWindow(shortDate(due, t), dueTimeOf(row), t);
  const text = t('common:orderList.due', { date });
  const confirmed = row.confirmed_due_date != null;
  const stage = pipelineIndex(row.status);
  // Before SENT_TO_CLINIC (stage 4): the lab is still working to the date.
  const withLab = stage != null && stage < 4;
  if (!withLab) return { text, tone: confirmed ? 'confirmed' : 'requested' };

  const days = dayjs(due).startOf('day').diff(now.startOf('day'), 'day');
  if (days < 0) return { text: `${text} · ${t('common:orderList.overdue')}`, tone: 'overdue' };
  const left =
    days === 0 ? t('common:orderList.dueToday') : t('common:orderList.daysLeft', { count: days });
  return { text: `${text} · ${left}`, tone: confirmed ? 'confirmed' : 'requested' };
}
