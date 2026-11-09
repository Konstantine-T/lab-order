import type { ReactNode } from 'react';
import { alpha, Box, Stack, Typography, useTheme } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon, StatusPill } from '@/components/design';
import { OrderStatusChip, PaymentStatusChip } from '@/components/OrderStatusChip';
import { FromLabBadge } from '@/features/lab/orders/FromLabBadge';
import { dueLine, pastDate } from '@/features/orders/list/listFormat';
import type { StatusSide } from '@/features/orders/statusLabel';
import { formatGEL } from '@/utils/pricing';
import { brand, lift, motion, radii, surfaces, tone } from '@/theme/tokens';
import type { OrderStatus, PaymentStatus } from '@/types/database';

export type FinanceCardOrder = {
  order_code: string;
  order_status: OrderStatus;
  created_at: string;
  completed_at: string | null;
  confirmed_due_date: string | null;
  requested_due_date: string | null;
  confirmed_due_time: string | null;
  requested_due_time: string | null;
  payment_status: PaymentStatus;
};

/**
 * One order on a finances page below `md`: the orders pages' card (code and
 * date, status, service, who, the due or completed line) with the money under
 * it, billed · paid · outstanding on one line. The body opens the order;
 * `actions` ("Record payment") sit outside it, so pressing one never also
 * navigates.
 */
export function FinanceOrderCard({
  order,
  href,
  side,
  service,
  who,
  doctorName,
  fromLab,
  amounts,
  labels,
  overdue,
  actions,
}: {
  order: FinanceCardOrder;
  href: string;
  side: StatusSide;
  service: string;
  /** "Patient · customer" (the lab) or "patient · lab" (the clinic). */
  who: string;
  /** The clinic: who the order was placed for. */
  doctorName?: string | null;
  fromLab?: boolean;
  amounts: { billed: number; paid: number; outstanding: number };
  /** The page's own words for the three amounts and the overdue pill. */
  labels: { billed: string; paid: string; outstanding: string; overdue: string };
  /** Past its confirmed date with money still owed. */
  overdue: boolean;
  actions?: ReactNode;
}) {
  const { t } = useTranslation('common');
  const mode = useTheme().palette.mode;
  const aqua = tone('success', mode);

  const due = order.completed_at
    ? { text: t('orderList.completedOn', { date: pastDate(order.completed_at, t) }), tone: 'requested' as const }
    : dueLine({ ...order, status: order.order_status }, t);

  const amount = (label: string, value: number, owed?: boolean) => (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary' }} noWrap>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.8125rem',
          fontWeight: owed ? 700 : 600,
          color: owed && value > 0 ? 'error.main' : 'text.primary',
          whiteSpace: 'nowrap',
        }}
      >
        {formatGEL(value)}
      </Typography>
    </Box>
  );

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        borderRadius: `${radii.card}px`,
        border: 1,
        borderColor: surfaces[mode].borderSolid,
        bgcolor: 'background.paper',
        overflow: 'hidden',
        transition: `border-color ${motion.base}, box-shadow ${motion.base}`,
        '&:hover': { borderColor: alpha(brand.main, 0.6), boxShadow: lift.card },
        '&:has(a:focus-visible), &:has(button:focus-visible)': {
          borderColor: brand.main,
          boxShadow: `0 0 0 3px ${alpha(brand.main, 0.28)}`,
        },
      }}
    >
      <Box
        component={RouterLink}
        to={href}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          px: 2,
          py: 1.75,
          color: 'inherit',
          textDecoration: 'none',
          outline: 'none',
          minWidth: 0,
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary', flexShrink: 0 }}>
            {order.order_code}
            {' · '}
            <Box component="time" dateTime={order.created_at} sx={{ fontWeight: 500 }}>
              {pastDate(order.created_at, t)}
            </Box>
          </Typography>
          <OrderStatusChip status={order.order_status} side={side} />
        </Stack>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, lineHeight: 1.35 }}>
            {service || '—'}
          </Typography>
          {who && (
            <Typography sx={{ fontSize: '0.8125rem', color: 'text.secondary', mt: 0.5 }} noWrap>
              {who}
            </Typography>
          )}
          {doctorName && (
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mt: 0.25, color: 'text.secondary', minWidth: 0 }}>
              <Icon name="stethoscope" size={14} />
              <Typography sx={{ fontSize: '0.75rem', color: 'inherit' }} noWrap>
                {t('orderList.doctorName', { name: doctorName })}
              </Typography>
            </Stack>
          )}
          {fromLab && (
            <Box sx={{ mt: 0.5 }}>
              <FromLabBadge />
            </Box>
          )}
        </Box>

        {due && (
          <Typography
            sx={{
              fontSize: '0.75rem',
              fontWeight: due.tone !== 'requested' ? 600 : 500,
              color:
                due.tone === 'overdue' ? 'error.main' : due.tone === 'confirmed' ? aqua.fg : 'text.secondary',
            }}
          >
            {due.text}
          </Typography>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 1,
            pt: 1,
            borderTop: 1,
            borderColor: 'divider',
          }}
        >
          {amount(labels.billed, amounts.billed)}
          {amount(labels.paid, amounts.paid)}
          {amount(labels.outstanding, amounts.outstanding, true)}
        </Box>

        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
          <PaymentStatusChip status={order.payment_status} />
          {overdue && <StatusPill tone="danger">{labels.overdue}</StatusPill>}
        </Stack>
      </Box>

      {actions && (
        <Stack direction="row" alignItems="center" sx={{ px: 2, pb: 1.5, pt: 0.25, gap: 1 }}>
          {actions}
        </Stack>
      )}
    </Box>
  );
}
