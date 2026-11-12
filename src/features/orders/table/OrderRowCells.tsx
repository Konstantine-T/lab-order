import type { ReactNode } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { Icon, InitialsAvatar } from '@/components/design';
import { formatGELShort } from '@/utils/pricing';
import type { ListPrice } from '@/features/orders/list/orderListModel';
import { OrderStatusChip } from '@/components/OrderStatusChip';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import {
  CLOSED_STATUSES,
  isPastDue,
  LAB_ACTIVE_STATUSES,
  OPEN_STATUSES,
  type QueueDates,
} from '@/features/lab/orders/orderPresets';
import { appendDueWindow, dueDateOf, dueTimeOf, type DatedOrder } from '@/features/orders/orderDates';
import { pastDate, shortDate } from '@/features/orders/list/listFormat';
import type { StatusSide } from '@/features/orders/statusLabel';
import { tone } from '@/theme/tokens';
import type { OrderStatus } from '@/types/database';

/**
 * The cells of an order row in a `DataTable`: the lab's orders queue and both
 * finances pages draw their rows from these, so the three cannot drift (J5).
 * Each is one grid cell; the page owns the columns and their order.
 */

/** The order code, bold brand. */
export function OrderCodeCell({ code }: { code: string }) {
  return (
    <Typography sx={{ fontSize: '0.78125rem', fontWeight: 700, color: 'primary.dark' }} noWrap>
      {code}
    </Typography>
  );
}

/** Avatar and name; `children` go under the name (the queue's badges). */
export function PatientCell({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <Stack direction="row" alignItems="center" spacing={1.125} sx={{ minWidth: 0 }}>
      <InitialsAvatar name={name} size={28} shape="circle" />
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600 }} noWrap>
          {name}
        </Typography>
        {children}
      </Box>
    </Stack>
  );
}

/**
 * Who the order is from: the name, the "from a lab" mark for a buying lab
 * (0048) on its own line, and a smaller detail line (the clinic, or on the
 * finances page the doctor behind a clinic's invoice).
 */
export function CustomerCell({
  name,
  fromLab,
  detail,
  detailTitle,
}: {
  name: string;
  fromLab?: boolean;
  detail?: string | null;
  detailTitle?: string;
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body1" color="text.secondary" noWrap>
        {name || '—'}
      </Typography>
      {/* On its own line, not beside the name: the column is narrow at
          1280px and a lab's name is long. */}
      {fromLab && (
        <Box sx={{ mt: 0.375 }}>
          <FromLabBadge />
        </Box>
      )}
      {detail && (
        <Typography
          sx={{ fontSize: '0.6875rem', color: 'text.secondary', opacity: 0.8 }}
          noWrap
          title={detailTitle ?? detail}
        >
          {detail}
        </Typography>
      )}
    </Box>
  );
}

/** A plain secondary text cell: the service, the lab. */
export function TextCell({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body1" color="text.secondary" noWrap>
      {children || '—'}
    </Typography>
  );
}

export type DueCellOrder = DatedOrder & {
  status: OrderStatus;
  created_at: string;
  confirmed_due_time?: string | null;
  requested_due_time?: string | null;
};

/**
 * The due date as a tinted pill, with the creation date under it. Red once the
 * date has passed on a case still open, amber and blue as it nears. A closed
 * case has no deadline left to miss.
 *
 * `labWork`: the lab's own order lists. There the deadline is the lab's work,
 * so it counts only while the lab still has the case (`LAB_ACTIVE_STATUSES`):
 * red is exactly the rows the "Overdue" preset finds, so the colour and the lab
 * dashboard's count agree, and an order sent to (or received at) the clinic is
 * neutral. Without it (the doctor's and clinic's lists, the finance pages) an
 * order stays open until it is completed.
 *
 * Created sits here rather than in a column of its own: the two dates are read
 * against each other.
 */
export function DueCell({
  order,
  dates,
  side,
  labWork = false,
}: {
  order: DueCellOrder;
  /** `queueDates()`, taken once per render of the table. */
  dates: QueueDates;
  side: StatusSide;
  labWork?: boolean;
}) {
  const { t } = useTranslation(side === 'lab' ? 'lab' : 'common');
  const { t: tc } = useTranslation('common');
  const dueRaw = dueDateOf(order);
  const daysOut = dueRaw ? dayjs(dueRaw).diff(dayjs(), 'day') : null;
  const overdue = isPastDue(order, labWork ? LAB_ACTIVE_STATUSES : OPEN_STATUSES, dates);
  // No deadline left: closed, or, for the lab, already at the clinic.
  const noDeadline =
    (CLOSED_STATUSES as readonly OrderStatus[]).includes(order.status) ||
    (labWork && (order.status === 'SENT_TO_CLINIC' || order.status === 'RECEIVED_BY_CLINIC'));
  const dueTone = overdue
    ? 'danger'
    : daysOut == null || noDeadline
      ? 'neutral'
      : daysOut <= 1
        ? 'warning'
        : daysOut <= 4
          ? 'info'
          : 'neutral';

  return (
    <Stack spacing={0.375} sx={{ minWidth: 0 }}>
      <Box
        title={overdue ? (side === 'lab' ? t('dashboard.overdue') : tc('orderList.overdue')) : undefined}
        sx={(theme) => ({
          textAlign: 'center',
          py: 0.5,
          borderRadius: 999,
          fontSize: '0.71875rem',
          fontWeight: 600,
          color: tone(dueTone, theme.palette.mode).fg,
          bgcolor: tone(dueTone, theme.palette.mode).bg,
        })}
      >
        {dueRaw ? appendDueWindow(shortDate(dueRaw, tc), dueTimeOf(order), tc) : '—'}
      </Box>
      <Typography
        sx={{ fontSize: '0.625rem', color: 'text.secondary', textAlign: 'center' }}
        noWrap
      >
        {side === 'lab'
          ? t('orderSheet.createdOn', { date: pastDate(order.created_at, tc) })
          : tc('orderList.createdOn', { date: pastDate(order.created_at, tc) })}
      </Typography>
    </Stack>
  );
}

/**
 * The order's status as a read-only pill, in the side's wording, and when it
 * was completed under it. The queue has its own inline status select instead.
 */
export function OrderStatusCell({
  status,
  completedAt,
  side,
}: {
  status: OrderStatus;
  completedAt: string | null;
  side: StatusSide;
}) {
  const { t } = useTranslation('common');
  return (
    <Stack spacing={0.375} alignItems="flex-start" sx={{ minWidth: 0 }}>
      <OrderStatusChip status={status} side={side} />
      {completedAt && (
        <Typography sx={{ fontSize: '0.625rem', color: 'text.secondary' }} noWrap>
          {t('orderList.completedOn', { date: pastDate(completedAt, t) })}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * The order's price, right-aligned, as the card states it (orderListModel's
 * priceOf): the lab's final figure in bold, an estimate as "≈", the estimate
 * struck through when the lab settled below it, "—" when there is none.
 */
export function TotalCell({ price }: { price: ListPrice | null }) {
  const { t } = useTranslation('common');
  if (!price) {
    return (
      <Typography sx={{ fontSize: '0.78125rem', color: 'text.secondary', textAlign: 'right' }}>—</Typography>
    );
  }
  return (
    <Stack alignItems="flex-end" sx={{ minWidth: 0 }}>
      {price.was != null && (
        <Typography
          sx={{ fontSize: '0.6875rem', color: 'text.secondary', textDecoration: 'line-through', whiteSpace: 'nowrap' }}
        >
          {formatGELShort(price.was)}
        </Typography>
      )}
      <Typography
        title={
          price.kind === 'estimate' ? t('priceBreakdown.estimatedTotal') : t('priceBreakdown.labFinalTotal')
        }
        sx={{
          fontSize: '0.78125rem',
          fontWeight: price.kind === 'final' ? 700 : 600,
          color: price.kind === 'final' ? 'text.primary' : 'text.secondary',
          whiteSpace: 'nowrap',
        }}
      >
        {price.kind === 'estimate' ? '≈ ' : ''}
        {formatGELShort(price.amount)}
      </Typography>
    </Stack>
  );
}

/** The queue's chevron: the row opens the order. */
export function GoCell() {
  return <Icon name="chevron_right" size={17} sx={{ color: 'text.disabled' }} />;
}

/**
 * A money figure, right-aligned. `owed` paints it red while above 0, and
 * `children` stack under it (the payment and overdue pills under what is
 * still owed, so the row keeps to one column for both).
 */
export function AmountCell({
  value,
  owed,
  amount,
  children,
}: {
  value: ReactNode;
  owed?: boolean;
  amount?: number;
  children?: ReactNode;
}) {
  const red = owed && (amount ?? 0) > 0;
  return (
    <Stack spacing={0.5} alignItems="flex-end" sx={{ minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: '0.8125rem',
          textAlign: 'right',
          fontWeight: owed ? 700 : 400,
          color: owed ? (red ? 'error.main' : 'text.secondary') : 'text.primary',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </Typography>
      {children}
    </Stack>
  );
}
