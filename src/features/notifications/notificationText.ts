import type { TFunction, i18n as I18n } from 'i18next';
import { formatGELShort } from '@/utils/pricing';
import { dueWindowEnd } from '@/features/orders/orderDates';
import { shortDate } from '@/features/orders/detail/format';
import type { NotificationKind, NotificationRow, UserRole } from '@/types/database';

// A record, so a kind added to the type and not here fails the build.
const KINDS: Record<NotificationKind, true> = {
  lab_question: true,
  lab_needs_change: true,
  order_ready: true,
  order_sent: true,
  order_cancelled_by_lab: true,
  price_set: true,
  due_confirmed: true,
  invoice_attached: true,
  invoice_replaced: true,
  clinic_invite: true,
  new_order: true,
  order_edited: true,
  doctor_answered: true,
  invoice_seen: true,
  order_completed: true,
  order_reopened: true,
  order_cancelled_by_doctor: true,
  lab_approved: true,
  lab_suspended: true,
  lab_changes_requested: true,
  lab_rejected: true,
  clinic_order_placed: true,
  clinic_order_completed: true,
  doctor_left: true,
  payment_recorded: true,
  new_payable: true,
  admin_new_lab: true,
  admin_new_feedback: true,
  lab_review_new: true,
  lab_review_reply: true,
};
const KNOWN = new Set<string>(Object.keys(KINDS));

/** A kind this build knows and has text for (in the viewer's language or English). */
export function isKnownKind(kind: string, i18n: I18n): boolean {
  return KNOWN.has(kind) && i18n.exists(`notifications.kinds.${kind}.title`, { ns: 'common' });
}

/**
 * Title and body for one row, translated now, so a language switch
 * re-renders every old row.
 *
 * `t` is the `common` namespace. A missing Georgian or Russian string falls
 * back to English through i18next's `fallbackLng`; a kind this build has never
 * heard of (a newer database, an older tab) gets the neutral title and no
 * body, never a raw key.
 */
export function notificationText(
  row: Pick<NotificationRow, 'kind' | 'params'>,
  t: TFunction,
  i18n: I18n,
): { title: string; body: string; detail?: string; known: boolean } {
  if (!isKnownKind(row.kind, i18n)) {
    return { title: t('notifications.unknown'), body: '', known: false };
  }
  const p = row.params ?? {};
  const vars = {
    code: p.code ?? '',
    lab: p.lab ?? '',
    doctor: p.doctor ?? '',
    clinic: p.clinic ?? '',
    sender: p.sender ?? '',
    // Already formatted: it carries the ₾.
    amount: typeof p.amount === 'number' ? formatGELShort(p.amount) : '',
    // The raw YYYY-MM-DD, as formatDueWindow shows a due date everywhere.
    date: p.date ?? '',
    time: '',
    // lab_review_new: the stars, 1 to 5.
    rating: typeof p.rating === 'number' ? String(p.rating) : '',
  };
  const base = `notifications.kinds.${row.kind}`;
  let bodyKey = `${base}.body`;
  if (row.kind === 'due_confirmed') {
    if (p.time) {
      // The same one-hour window the order pages show (formatDueWindow).
      const { end, nextDay } = dueWindowEnd(p.time);
      vars.time = `${t('orderCard.dueWindow', { start: p.time.slice(0, 5), end })}${
        nextDay ? ` ${t('orderCard.dueWindowNextDay')}` : ''
      }`;
    } else {
      bodyKey = `${base}.bodyDateOnly`;
    }
  }
  // price_set: the lab's explanation of the price (0046), as the lab wrote it
  // — raw text, not a key, so every reader sees the same words. Rows from
  // before 0046 have no note and read as they always did.
  const note = row.kind === 'price_set' && typeof p.note === 'string' ? p.note.trim() : '';
  return {
    title: t(`${base}.title`, vars),
    body: t(bodyKey, vars),
    ...(note ? { detail: note } : {}),
    known: true,
  };
}

const AREA: Partial<Record<UserRole, string>> = {
  DOCTOR: '/doctor',
  LAB_MAIN_ADMIN: '/lab',
  CLINIC_ADMIN: '/clinic',
  PLATFORM_ADMIN: '/admin',
};

/**
 * Where a click on the row goes, for the role reading it. Every path is a
 * route in src/routes/<area>Routes.tsx. Null when there is nowhere useful.
 */
export function notificationTarget(
  row: Pick<NotificationRow, 'kind' | 'order_id' | 'params'>,
  role: UserRole | undefined,
): string | null {
  const area = role ? AREA[role] : undefined;
  if (!area) return null;
  switch (row.kind) {
    case 'clinic_invite':
      // The doctor answers invites on their home page (ClinicInvitesCard).
      return '/doctor';
    case 'doctor_left':
      return '/clinic/doctors';
    case 'payment_recorded':
    case 'new_payable':
      return '/clinic/finances';
    case 'lab_approved':
    case 'lab_suspended':
    case 'lab_changes_requested':
    case 'lab_rejected':
      return '/lab/profile';
    case 'admin_new_lab':
      return row.params?.lab_id ? `/admin/labs/${row.params.lab_id}` : '/admin/labs';
    case 'admin_new_feedback':
      return '/admin/feedbacks';
    case 'lab_review_new':
      return '/lab/reviews';
    // lab_review_reply is about the doctor's order: the default below.
  }
  // Every other kind is about one order: its page in the viewer's own area.
  if (row.order_id && area !== '/admin') return `${area}/orders/${row.order_id}`;
  return null;
}

/**
 * "5 min ago", from our own strings, and the short date once it is a week
 * old. Not Intl.RelativeTimeFormat (Chrome has no Georgian data and answers
 * in English) nor dayjs's relativeTime (its Georgian forms are ungrammatical).
 * The units are abbreviated so no language needs plural forms.
 */
export function relativeTime(iso: string, t: TFunction, now = Date.now()): string {
  const minutes = Math.floor((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return t('notifications.time.now');
  if (minutes < 60) return t('notifications.time.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.time.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('notifications.time.days', { n: days });
  return shortDate(iso);
}
