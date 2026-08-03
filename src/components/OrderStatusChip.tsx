import { useTranslation } from 'react-i18next';
import { StatusPill } from '@/components/design/StatusPill';
import type { Tone } from '@/theme/tokens';
import type { OrderStatus, PaymentStatus } from '@/types/database';

// Tones follow the mockups: brand for work in progress, warning for anything
// waiting on a human, sky for a case that has left the lab, green once it is
// closed, neutral for cancelled.
const ORDER_TONE: Record<OrderStatus, Tone> = {
  SUBMITTED: 'brand',
  RECEIVED: 'warning',
  NEEDS_CLARIFICATION: 'danger',
  IN_PROGRESS: 'brand',
  READY_FOR_DELIVERY: 'success',
  SENT_TO_CLINIC: 'info',
  RECEIVED_BY_CLINIC: 'info',
  TRY_IN_PHASE: 'info',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
};

/** The tone a status maps to — for dots and row tints outside the pill. */
export const statusTone = (status: OrderStatus): Tone => ORDER_TONE[status];

const PAYMENT_TONE: Record<PaymentStatus, Tone> = {
  UNPAID: 'danger',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  const { t } = useTranslation('common');
  return <StatusPill tone={ORDER_TONE[status]}>{t(`orderStatus.${status}`)}</StatusPill>;
}

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation('common');
  return <StatusPill tone={PAYMENT_TONE[status]}>{t(`paymentStatus.${status}`)}</StatusPill>;
}
