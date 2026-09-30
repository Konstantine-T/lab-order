import dayjs, { type Dayjs } from 'dayjs';
import type { Theme } from '@mui/material';
import type { PickersDayProps } from '@mui/x-date-pickers';
import { tone } from '@/theme/tokens';
import type { OrderRow } from '@/types/database';

type DueColumns = Pick<
  OrderRow,
  'confirmed_due_date' | 'confirmed_due_time' | 'requested_due_date' | 'requested_due_time'
>;

/** Postgres `time` comes back as `HH:mm:ss`; the picker writes `HH:mm`. */
const hhmm = (t: string | null | undefined): string => t?.slice(0, 5) ?? '';

/**
 * What the lab's confirm-due fields start out holding.
 *
 * The lab's own confirmation when there is one, otherwise the doctor's request,
 * so agreeing with the doctor is one click. The pair travels together: a lab
 * that confirmed "that day, any time" must not have the doctor's time slipped
 * in next to its own date.
 */
export function initialDueFields(order: DueColumns): { date: string; time: string } {
  const labHasConfirmed = order.confirmed_due_date != null || order.confirmed_due_time != null;
  return labHasConfirmed
    ? { date: order.confirmed_due_date ?? '', time: hhmm(order.confirmed_due_time) }
    : { date: order.requested_due_date ?? '', time: hhmm(order.requested_due_time) };
}

/**
 * Do the fields differ from what is saved?
 *
 * This is what keeps the pre-fill honest: the doctor's date sitting in the
 * picker looks the same whether or not the lab has confirmed it, so the button
 * has to say which. Empty and null are the same thing on both sides, or an
 * empty field reads as dirty against a null column and never settles.
 */
export function isDueDirty(
  fields: { date: string; time: string },
  order: Pick<OrderRow, 'confirmed_due_date' | 'confirmed_due_time'>,
): boolean {
  return (
    (fields.date || null) !== (order.confirmed_due_date || null) ||
    (fields.time || null) !== (hhmm(order.confirmed_due_time) || null)
  );
}

/**
 * The doctor's requested day in the calendar: a periwinkle tint and a heavier
 * weight, the way booking sites mark the day you asked about.
 *
 * Periwinkle, not aqua — aqua means confirmed, and this day is only a request.
 * Selection still wins: a selected day keeps MUI's ink fill and gets a ring
 * instead of the tint, and today's outline is left alone so it shows on top.
 */
const requestedDaySx = (theme: Theme) => {
  const b = tone('brand', theme.palette.mode);
  return {
    fontWeight: 800,
    // An inset ring rather than a border, so today's own outline still draws.
    '&:not(.Mui-selected)': { bgcolor: b.bg, color: b.fg, boxShadow: `inset 0 0 0 1px ${b.border}` },
    '&:not(.Mui-selected):hover, &:not(.Mui-selected):focus': { bgcolor: b.border },
    // MUI's selected rule resets the weight, so restate it there.
    '&.Mui-selected': { fontWeight: 800, outline: `2px solid ${b.dot}`, outlineOffset: '1px' },
  };
};

/**
 * `slotProps.day` for a DatePicker: marks `requested` (YYYY-MM-DD) and nothing
 * else. A props function rather than a custom `day` slot, so the calendar keeps
 * its own PickersDay and no component is re-created on every render.
 */
export function requestedDaySlotProps(requested: string | null, title: string) {
  const target = requested ? dayjs(requested) : null;
  if (!target || !target.isValid()) return undefined;
  return (ownerState: { day: Dayjs }): Partial<PickersDayProps<Dayjs>> =>
    ownerState.day.isSame(target, 'day') ? { sx: requestedDaySx, title } : {};
}

/**
 * The legend's key: a small day bubble drawn exactly like the marked day, with
 * the requested day-of-month in it, so it reads as "this is what to look for"
 * rather than as a control.
 */
export const requestedDaySwatchSx = (theme: Theme) => {
  const b = tone('brand', theme.palette.mode);
  return {
    width: 22,
    height: 22,
    flexShrink: 0,
    borderRadius: '50%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.6875rem',
    fontWeight: 800,
    lineHeight: 1,
    bgcolor: b.bg,
    color: b.fg,
    boxShadow: `inset 0 0 0 1px ${b.border}`,
  };
};
