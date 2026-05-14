import { Chip, type ChipProps } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { OrderStatus, PaymentStatus } from '@/types/database';

const ORDER_COLOR: Record<OrderStatus, ChipProps['color']> = {
  SUBMITTED: 'info',
  RECEIVED: 'info',
  NEEDS_CLARIFICATION: 'warning',
  IN_PROGRESS: 'primary',
  READY_FOR_DELIVERY: 'success',
  SENT_TO_CLINIC: 'success',
  RECEIVED_BY_CLINIC: 'success',
  TRY_IN_PHASE: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'default',
};

const PAYMENT_COLOR: Record<PaymentStatus, ChipProps['color']> = {
  UNPAID: 'error',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { t } = useTranslation('common');
  return (
    <Chip
      size="small"
      color={ORDER_COLOR[status]}
      label={t(`orderStatus.${status}`)}
    />
  );
}

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation('common');
  return (
    <Chip
      size="small"
      variant="outlined"
      color={PAYMENT_COLOR[status]}
      label={t(`paymentStatus.${status}`)}
    />
  );
}
